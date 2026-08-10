import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { resolveFathomCallFromUrl, resolveApiKey } from '@/lib/fathom';
import { analyzeClosingCall, resolveCallOutcome } from '@/lib/ai/analyze';
import { writeWithOptionalColumns } from '@/lib/db-write';

// Manually add a sales call (for when the auto-sync missed one). Pulls the
// transcript from a Fathom URL or uses a pasted transcript, runs the same AI
// analysis so it gets an ICP score, then applies the admin's manual fields
// (closer/outcome/cash/revenue) which take precedence over the AI. Unlike the
// auto-sync, this does NOT skip "internal" calls — the admin added it on purpose.
export const maxDuration = 300;

const ALLOWED_OUTCOMES = ['closed', 'no_close', 'dq', 'no_show', 'unknown'];

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const date = String(body.date || '').trim();
  const closer = String(body.closer || '').trim();
  const fathomUrl = String(body.fathomUrl || '').trim();
  let transcript = String(body.transcript || '').trim();
  const outcome = ALLOWED_OUTCOMES.includes(body.outcome) ? body.outcome : 'unknown';
  const revenue = Number.isFinite(Number(body.revenue)) && Number(body.revenue) >= 0 ? Number(body.revenue) : 0;
  const cash = Number.isFinite(Number(body.cash_collected)) && Number(body.cash_collected) >= 0 ? Number(body.cash_collected) : 0;

  if (!fathomUrl && !transcript) {
    return NextResponse.json({ error: 'Provide a Fathom URL or paste the transcript.' }, { status: 400 });
  }

  let recordingId: string | null = null;
  let resolvedDate: string | null = null;
  let resolvedTitle: string | null = null;

  // Fetch the transcript from the URL only if one wasn't pasted. Try the main key,
  // then the sales-manager account's key (the call could be in either).
  if (fathomUrl && !transcript) {
    let resolved = await resolveFathomCallFromUrl(fathomUrl, resolveApiKey('default'));
    if (!resolved) resolved = await resolveFathomCallFromUrl(fathomUrl, resolveApiKey('sales_manager'));
    if (!resolved) {
      return NextResponse.json({ error: "Couldn't fetch a transcript from that URL — paste the transcript instead." }, { status: 400 });
    }
    transcript = resolved.transcript;
    recordingId = resolved.recordingId;
    resolvedDate = resolved.callDate ?? null;
    resolvedTitle = resolved.title ?? null;
  }

  // Pull a recording id out of the URL (for dedup) even when a transcript was pasted.
  if (!recordingId && fathomUrl) {
    const m = fathomUrl.match(/(?:calls|recordings|meetings|share|embed)\/([A-Za-z0-9_-]+)/i) || fathomUrl.match(/(\d{6,})/);
    recordingId = m?.[1] ?? null;
  }

  if (transcript.length < 50) {
    return NextResponse.json({ error: 'Transcript is too short to analyze.' }, { status: 400 });
  }

  const fathomCallId = recordingId
    ? String(recordingId)
    : `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Don't add a call that already exists.
  const { data: dup } = await db().from('calls').select('id').eq('fathom_call_id', fathomCallId).maybeSingle();
  if (dup) return NextResponse.json({ error: 'This call has already been added.' }, { status: 409 });

  const { data: icpData } = await db()
    .from('icp_criteria').select('criteria').order('version', { ascending: false }).limit(1).single();
  const icpCriteria = (icpData?.criteria as Record<string, unknown>) ?? {};

  let analysis;
  try {
    analysis = await analyzeClosingCall(transcript, icpCriteria, outcome);
  } catch {
    return NextResponse.json({ error: 'AI analysis failed — try again.' }, { status: 500 });
  }

  const leadName = analysis.prospect_name?.trim() || resolvedTitle || 'Unknown';
  const callDate = date ? new Date(date).toISOString() : (resolvedDate || null);

  const { data: call, error: callErr } = await writeWithOptionalColumns('calls', {
    fathom_call_id: fathomCallId,
    lead_name: leadName,
    closer: closer || null,
    transcript,
    call_date: callDate,
    // The admin's pick wins over the AI's; "unknown" means they didn't pick, so
    // fall back to the analysis (which counts an unqualified prospect as a DQ).
    outcome: outcome === 'unknown' ? resolveCallOutcome(analysis) : outcome,
    outcome_locked: outcome !== 'unknown',
    revenue,
    cash_collected: cash,
    status: 'analyzed',
    source: 'manual',
    call_type: 'closing',
    raw_payload: { source: 'manual-add', fathomUrl: fathomUrl || null, addedBy: auth.email },
  }, { optional: ['outcome_locked'] });
  if (callErr || !call) {
    return NextResponse.json({ error: callErr?.message ?? 'Failed to save the call.' }, { status: 500 });
  }

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

  return NextResponse.json({ ok: true, lead_name: leadName });
}
