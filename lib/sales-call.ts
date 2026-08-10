import { analyzeClosingCall, resolveCallOutcome } from '@/lib/ai/analyze';
import { sendCallReport } from '@/lib/discord/notify';
import { db } from '@/lib/kv';
import { attributeSalesCall } from '@/lib/sales-attribution';

// Shared sales/closing-call processing. Used by the dedicated sales webhook
// (app/api/webhooks/fathom) AND by the unified Fathom webhook router
// (app/api/fathom/webhook) for any call that isn't a coaching check-in.

const DEFAULT_ICP = {
  industry: ['SaaS', 'E-commerce', 'Consulting', 'Agencies'],
  company_size: '5-200 employees',
  annual_revenue: '$500K - $10M',
  pain_points: ['lead generation', 'sales process', 'scaling', 'automation'],
  decision_maker: true,
  budget_range: '$2K - $50K',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FathomPayload = Record<string, any>;

// Titles that are INTERNAL/team calls — never closing calls — so they must not
// be ingested into the Sales Calls pipeline. Case-insensitive substring match on
// the meeting title (e.g. "GC team call" matches "team call", "GC Executives
// Call" matches "executives call"). Single source of truth: also used by the
// on-demand sync (app/api/admin/sync-fathom). Add new internal-call phrases here.
export const INTERNAL_CALL_TITLE_RE =
  /sales huddle|huddle|executives? call|team call|team meeting|group call|mastermind|content x|content call|aidan cordes|ugc|cm team|coaching call|onboarding|training|fulfill?ment|q&a|q\+a|100k|drills|round robin|\bsop\b/i;

export function isInternalCallTitle(title: string | null | undefined): boolean {
  return !!title && INTERNAL_CALL_TITLE_RE.test(title);
}

// Calls with any of these invitee emails are internal (e.g. the founder sitting
// in) — never ingested as a closer's sales call.
export const EXCLUDED_INVITEE_EMAILS = ['soowei@gohconsulting.com', 'lazzartopalovic@gmail.com'];

export function hasExcludedInvitee(emails: (string | null | undefined)[]): boolean {
  const set = new Set(EXCLUDED_INVITEE_EMAILS.map((e) => e.toLowerCase()));
  return emails.some((e) => !!e && set.has(String(e).toLowerCase().trim()));
}

// Pull invitee emails out of a raw Fathom payload (webhook shapes vary).
function payloadInviteeEmails(payload: FathomPayload): string[] {
  const arr = payload?.calendar_invitees ?? payload?.attendees ?? payload?.participants ?? [];
  return Array.isArray(arr)
    ? arr.map((a: { email?: string }) => a?.email).filter((e: unknown): e is string => typeof e === 'string')
    : [];
}

// Pull the meeting title out of a raw Fathom payload (webhook or meeting object),
// trying the same field paths the check-in normalizer uses.
function payloadTitle(payload: FathomPayload): string {
  return (
    payload?.meeting?.title ??
    payload?.recording?.title ??
    payload?.title ??
    payload?.meeting_title ??
    payload?.meeting?.meeting_title ??
    ''
  );
}

export async function processSalesCall(
  payload: FathomPayload,
  opts: { source?: string } = {}
): Promise<{ report_id: string | null; skipped?: boolean }> {
  const source = opts.source ?? 'fathom';

  // Internal/team calls (huddles, team/group calls, exec calls, etc.) and any
  // call the founder (soowei@) sat in on are not closer sales calls — skip them
  // so they never hit the Sales Calls dashboard.
  if (isInternalCallTitle(payloadTitle(payload)) || hasExcludedInvitee(payloadInviteeEmails(payload))) {
    return { report_id: null, skipped: true };
  }

  const fathomCallId = String(
    payload.id ?? payload.call_id ?? payload.recording_id ?? `fathom_${Date.now()}`,
  );

  // Skip if we've already ingested this recording (Fathom retries webhooks).
  const { data: dup } = await db().from('calls').select('id').eq('fathom_call_id', fathomCallId).maybeSingle();
  if (dup) return { report_id: null, skipped: true };

  const transcript =
    payload.transcript ?? payload.summary ?? payload.notes ?? JSON.stringify(payload);
  const leadName =
    payload.attendees?.find((a: { is_host?: boolean }) => !a.is_host)?.name ??
    payload.participant_name ??
    payload.contact_name ??
    'Unknown Prospect';

  const { data: call, error: callError } = await db()
    .from('calls')
    .insert({
      fathom_call_id: fathomCallId,
      lead_name: leadName,
      transcript,
      summary: payload.summary ?? null,
      status: 'pending',
      source,
      call_type: 'closing',
      raw_payload: payload,
    })
    .select()
    .single();
  if (callError) throw callError;

  const { data: icpData } = await db()
    .from('icp_criteria')
    .select('criteria')
    .order('version', { ascending: false })
    .limit(1)
    .single();
  const icpCriteria = (icpData?.criteria as Record<string, unknown>) ?? DEFAULT_ICP;

  const analysis = await analyzeClosingCall(transcript, icpCriteria);

  // Title/invitee filters above catch the obvious internal calls; this catches the
  // rest — if the AI reads the transcript as an internal/non-sales call, mark it
  // internal and skip the report so it never reaches the dashboard.
  if (analysis.is_internal_call === true) {
    await db().from('calls').update({ status: 'internal' }).eq('id', call.id);
    return { report_id: null, skipped: true };
  }

  const { data: report, error: reportError } = await db()
    .from('icp_reports')
    .insert({
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
    })
    .select()
    .single();
  if (reportError) throw reportError;

  // Carry the AI's outcome + any money figures it could extract back onto the
  // call row so the Sales Calls dashboard (close rate, revenue, cash) reflects
  // them. These are estimates and remain admin-overridable per call.
  const useName = (leadName === 'Unknown Prospect') && analysis.prospect_name?.trim()
    ? analysis.prospect_name.trim() : undefined;
  const outcome = resolveCallOutcome(analysis);
  await db().from('calls').update({
    status: 'analyzed',
    outcome,
    revenue: analysis.revenue || 0,
    cash_collected: analysis.cash_collected || 0,
    ...(useName ? { lead_name: useName } : {}),
  }).eq('id', call.id);

  // Link the call to a matching portal member (if any attendee email matches) so
  // it surfaces on that client's CSM journey. Non-fatal — never break the report.
  await attributeSalesCall(call.id, payload, {
    leadName: useName ?? leadName,
    outcome,
  }).catch(() => {});

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  await sendCallReport(report.id, leadName, analysis, appUrl);
  await db().from('icp_reports').update({ discord_sent: true }).eq('id', report.id);

  return { report_id: report.id };
}
