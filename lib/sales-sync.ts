// Shared sales-call sync + analysis, used by the admin "Sync" button
// (app/api/admin/sync-fathom), the admin analyze loop
// (app/api/admin/calls/analyze-pending), and the daily cron
// (app/api/cron/sync-fathom). Keeping the logic here means all three behave
// identically and attribution runs on every import path.

import { db } from '@/lib/kv';
import { getAllMeetings, getMeetingTranscript, resolveApiKey, type FathomSource, type FathomMeeting } from '@/lib/fathom';
import { isInternalCallTitle, hasExcludedInvitee } from '@/lib/sales-call';
import { analyzeClosingCall, resolveCallOutcome } from '@/lib/ai/analyze';
import { attributeSalesCall } from '@/lib/sales-attribution';

// A call that fails analysis (transient API error, or a transcript that wasn't
// ready at import time) is left as 'imported' and retried on the next sync/cron
// run. This caps those retries so a genuinely un-analyzable call can't churn
// forever — after this many failed attempts it stays 'imported' and is dropped
// from the analysis queue. Requires the `analysis_attempts` column (see
// supabase-calls-analysis-retry.sql).
const MAX_ANALYSIS_ATTEMPTS = 3;
// Calls eligible for analysis: brand-new 'pending' imports PLUS 'imported' calls
// that failed a previous attempt but haven't hit the retry cap above. Applied
// identically to the queue, the remaining-count, and the import stats. Once a call
// exhausts its retries it moves to the terminal 'analysis_failed' status (below)
// so it drops out of the queue but stays VISIBLE — it's never silently stranded.
const ANALYZABLE_STATUSES = ['pending', 'imported'];
const FAILED_STATUS = 'analysis_failed';

function isOneOnOne(meeting: { title: string; attendees: Array<{ is_external?: boolean }> }) {
  if (isInternalCallTitle(meeting.title)) return false;
  if (meeting.attendees.length > 6) return false;
  return true; // small non-group call — accept (is_external flag is unreliable across plans)
}

export interface ImportStats {
  total: number;
  one_on_one: number;
  filtered_out: number;
  imported: number;
  skipped: number;
  attributed: number;
  pending_analysis: number;
  // Calls that exhausted their analysis retries and need admin attention
  // (surfaced in the UI so nothing fails silently). 0 in the healthy case.
  analysis_failed: number;
}

// List → filter → dedupe → insert new sales calls from one Fathom account, then
// attribute freshly-imported calls to matching clients. No AI here (fast); calls
// land as 'pending' and are analyzed separately.
export async function importFathomSalesCalls(opts: {
  source?: FathomSource;
  maxPages?: number;
  monthsBack?: number;
} = {}): Promise<ImportStats | { error: string }> {
  const source = (opts.source === 'sales_manager' ? 'sales_manager' : 'default') as FathomSource;
  const maxPages = opts.maxPages ?? 20;
  const monthsBack = opts.monthsBack ?? 4;

  const apiKey = resolveApiKey(source);
  const callSource = source === 'sales_manager' ? 'sales_manager' : 'fathom';
  if (!apiKey) {
    return { error: source === 'sales_manager' ? 'FATHOM_SALES_API_KEY not configured' : 'FATHOM_API_KEY not configured' };
  }

  const createdAfter = new Date();
  createdAfter.setMonth(createdAfter.getMonth() - monthsBack);

  const allMeetings = await getAllMeetings(maxPages, createdAfter.toISOString(), apiKey);
  if (!allMeetings.length) {
    return { error: 'No meetings found or Fathom API key not configured' };
  }

  const meetings = allMeetings.filter(
    (m) => isOneOnOne(m) && !hasExcludedInvitee(m.attendees.map((a) => a.email)),
  );

  const { data: existing } = await db().from('calls').select('fathom_call_id');
  const existingIds = new Set((existing ?? []).map((r: { fathom_call_id: string }) => r.fathom_call_id));

  const fresh = meetings.filter((m) => !existingIds.has(m.id));
  const skipped = meetings.length - fresh.length;

  let imported = 0;
  let attributed = 0;
  if (fresh.length) {
    const rows = fresh.map((meeting) => ({
      fathom_call_id: meeting.id,
      lead_name: meeting.attendees.find((a) => a.is_external)?.name ?? 'Unknown',
      transcript: meeting.transcript ?? '',
      summary: meeting.summary ?? null,
      call_date: meeting.created_at || null,
      status: callSource === 'sales_manager' ? 'pending' : 'imported',
      source: callSource,
      call_type: 'closing',
      raw_payload: meeting,
    }));

    // Upsert on fathom_call_id so overlapping syncs can't double-insert; .select()
    // returns only the rows actually inserted, keeping the count honest.
    const { data: inserted, error: insErr } = await db()
      .from('calls')
      .upsert(rows, { onConflict: 'fathom_call_id', ignoreDuplicates: true })
      .select('id, fathom_call_id');
    if (insErr) return { error: insErr.message };

    const insertedRows = inserted ?? [];
    imported = insertedRows.length;

    // Attribute each newly-imported call from its Fathom payload (no extra API call).
    const byFathomId = new Map<string, FathomMeeting>(fresh.map((m) => [m.id, m]));
    for (const row of insertedRows) {
      const meeting = byFathomId.get(row.fathom_call_id as string);
      const res = await attributeSalesCall(row.id as string, meeting, {
        leadName: meeting?.attendees.find((a) => a.is_external)?.name ?? null,
        callDate: meeting?.created_at ?? null,
      });
      if (res.matched) attributed++;
    }
  }

  const { count: pending } = await db()
    .from('calls').select('id', { count: 'exact', head: true })
    .in('status', ANALYZABLE_STATUSES).lt('analysis_attempts', MAX_ANALYSIS_ATTEMPTS);

  const { count: failed } = await db()
    .from('calls').select('id', { count: 'exact', head: true }).eq('status', FAILED_STATUS);

  return {
    total: allMeetings.length,
    one_on_one: meetings.length,
    filtered_out: allMeetings.length - meetings.length,
    imported,
    skipped,
    attributed,
    pending_analysis: pending ?? 0,
    analysis_failed: failed ?? 0,
  };
}

export interface AnalyzeStats {
  analyzed: number;
  failed: number; // failed this pass (will be retried unless terminal)
  internal: number;
  remaining: number; // still analyzable (pending + retryable imported)
  failed_permanently: number; // hit the retry cap this pass → moved to analysis_failed
}

// Record a failed analysis attempt. Keeps the call retryable ('imported') until it
// exhausts MAX_ANALYSIS_ATTEMPTS, then moves it to the terminal 'analysis_failed'
// status with the reason recorded — so it drops out of the queue but stays visible
// and diagnosable instead of silently churning or vanishing. Returns whether the
// call was moved to the terminal state.
async function recordAnalysisFailure(callId: string, attempts: number, reason: string): Promise<boolean> {
  const terminal = attempts >= MAX_ANALYSIS_ATTEMPTS;
  await db().from('calls').update({
    status: terminal ? FAILED_STATUS : 'imported',
    analysis_attempts: attempts,
    analysis_error: reason.slice(0, 500),
  }).eq('id', callId);
  return terminal;
}

// How many calls are terminally failed (exhausted analysis retries). Drives the
// admin "Retry Failed" badge so stuck calls are visible on load, not just after a sync.
export async function countFailedCalls(): Promise<number> {
  const { count } = await db()
    .from('calls').select('id', { count: 'exact', head: true }).eq('status', FAILED_STATUS);
  return count ?? 0;
}

// Recovery: put every terminally-failed call back in the queue with a clean retry
// budget. Backs the admin "Retry failed" action — nothing is ever unrecoverable.
export async function requeueFailedCalls(): Promise<{ requeued: number }> {
  const { data } = await db()
    .from('calls')
    .update({ status: 'imported', analysis_attempts: 0, analysis_error: null })
    .eq('status', FAILED_STATUS)
    .select('id');
  return { requeued: data?.length ?? 0 };
}

// Analyze up to `limit` (hard-capped at 5) analyzable calls (fresh 'pending'
// imports + 'imported' calls that failed a prior attempt, under the retry cap):
// fetch transcript if missing, run the ICP analyzer, write the icp_report, and
// roll outcome/revenue onto the call row. Also (re)attributes each analyzed call.
// One long-transcript Sonnet analysis can take 30-60s, so callers keep `limit` small.
// Shape of a queued call as selected below. Declared because the column list is
// built at runtime (the outcome_locked fallback), which loses PostgREST's
// select-string type inference.
interface AnalyzableCall {
  id: string;
  fathom_call_id: string;
  transcript: string | null;
  source: string | null;
  lead_name: string | null;
  raw_payload: unknown;
  call_date: string | null;
  analysis_attempts: number | null;
  outcome: string | null;
  outcome_locked?: boolean | null;
}

export async function analyzePendingCalls(limit = 1): Promise<AnalyzeStats> {
  const take = Math.max(1, Math.min(limit, 5));
  const queue = (cols: string) => db()
    .from('calls')
    .select(cols)
    .in('status', ANALYZABLE_STATUSES)
    .lt('analysis_attempts', MAX_ANALYSIS_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(take);

  const BASE_COLS = 'id, fathom_call_id, transcript, source, lead_name, raw_payload, call_date, analysis_attempts, outcome';
  // outcome_locked arrives with supabase-calls-outcome-lock.sql; until that's run
  // PostgREST rejects the select, so fall back to the pre-migration column list.
  let { data: pending, error: pendErr } = await queue(`${BASE_COLS}, outcome_locked`);
  if (pendErr && pendErr.message.toLowerCase().includes('outcome_locked')) {
    ({ data: pending, error: pendErr } = await queue(BASE_COLS));
  }

  if (pendErr) throw new Error(pendErr.message);
  const queued = (pending ?? []) as unknown as AnalyzableCall[];
  if (!queued.length) return { analyzed: 0, failed: 0, internal: 0, remaining: 0, failed_permanently: 0 };

  const { data: icpData } = await db()
    .from('icp_criteria').select('criteria').order('version', { ascending: false }).limit(1).single();
  const icpCriteria = (icpData?.criteria as Record<string, unknown>) ?? {};

  let analyzed = 0, failed = 0, internal = 0, failedPermanently = 0;

  for (const call of queued) {
    const source = (call.source === 'sales_manager' ? 'sales_manager' : 'default') as FathomSource;
    const apiKey = resolveApiKey(source);

    let transcript = (call.transcript as string) ?? '';
    if ((!transcript || transcript.length < 100) && apiKey) {
      transcript = await getMeetingTranscript(String(call.fathom_call_id), apiKey);
      if (transcript) await db().from('calls').update({ transcript }).eq('id', call.id);
    }

    const attempts = ((call.analysis_attempts as number | null) ?? 0) + 1;

    if (!transcript || transcript.length < 100) {
      // Transcript still not available — keep retryable (Fathom may finish
      // transcribing before the next run) until the attempt cap, then terminal.
      if (await recordAnalysisFailure(call.id as string, attempts, 'Transcript unavailable from Fathom')) failedPermanently++;
      failed++;
      continue;
    }

    try {
      const analysis = await analyzeClosingCall(transcript, icpCriteria);

      if (analysis.is_internal_call === true) {
        await db().from('calls').update({ status: 'internal' }).eq('id', call.id);
        internal++;
        continue;
      }

      await db().from('icp_reports').delete().eq('call_id', call.id);
      await db().from('icp_reports').insert({
        call_id: call.id,
        icp_score: analysis.icp_score,
        close_likelihood: analysis.close_likelihood,
        pain_points: analysis.pain_points,
        call_summary: analysis.call_summary,
        next_step: analysis.next_step,
        full_analysis: analysis,
        analysis_type: 'closing',
        discord_sent: false,
        feedback_applied: false,
      });

      const curName = (call.lead_name as string | null)?.trim();
      const useName = (!curName || curName === 'Unknown') && analysis.prospect_name?.trim()
        ? analysis.prospect_name.trim() : undefined;
      // A human-set outcome (Discord notes, manual add, an admin's ✎ correction)
      // is the source of truth — re-analysis refreshes everything else but must
      // not silently flip a hand-marked DQ back to no-close.
      const locked = call.outcome_locked === true;
      const outcome = locked ? String(call.outcome ?? 'unknown') : resolveCallOutcome(analysis);
      await db().from('calls').update({
        status: 'analyzed',
        ...(locked ? {} : { outcome }),
        revenue: analysis.revenue || 0,
        cash_collected: analysis.cash_collected || 0,
        ...(useName ? { lead_name: useName } : {}),
      }).eq('id', call.id);

      // Make sure the call is linked to a client (idempotent — usually already
      // done at import; this covers webhook/legacy calls reaching analysis first).
      await attributeSalesCall(call.id as string, call.raw_payload, {
        leadName: useName ?? curName ?? null,
        outcome,
        callDate: call.call_date as string | null,
      }).catch(() => {});

      analyzed++;
    } catch (e) {
      // Transient failure (API overload/timeout, or an unparseable response). Kept
      // retryable so the next sync/cron run picks it up; only after the retry cap
      // does it move to the terminal 'analysis_failed' status with the reason.
      const reason = e instanceof Error ? e.message : String(e);
      if (await recordAnalysisFailure(call.id as string, attempts, reason)) failedPermanently++;
      failed++;
    }
  }

  const { count: remaining } = await db()
    .from('calls').select('id', { count: 'exact', head: true })
    .in('status', ANALYZABLE_STATUSES).lt('analysis_attempts', MAX_ANALYSIS_ATTEMPTS);

  return { analyzed, failed, internal, remaining: remaining ?? 0, failed_permanently: failedPermanently };
}
