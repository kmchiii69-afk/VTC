import { NextRequest, NextResponse } from 'next/server';
import { normalizeFathomPayload, matchParticipants } from '@/lib/checkin-matching';
import { analyzeCheckIn } from '@/lib/checkin-ai';
import { verifyFathomSignature } from '@/lib/fathom-verify';
import { processSalesCall } from '@/lib/sales-call';
import {
  getCheckIn,
  insertCheckIn,
  getClientProgress,
  upsertClientProgress,
  type NewCheckIn,
} from '@/lib/checkins';
import { syncAiTodos as syncAiActionItems } from '@/lib/todos';
import { logEvent } from '@/lib/journey';
import type { User } from '@/lib/kv';

// This route is publicly reachable (see proxy.ts allowlist); it is secured by
// Fathom's Svix request signature instead of the auth cookie. AI processing
// runs inline — the Netlify function timeout is 60s (netlify.toml), enough for
// one call.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Local-only escape hatch for manual testing without forging a signature:
// set FATHOM_WEBHOOK_TEST_SECRET and pass it as ?secret= or x-webhook-secret.
// Never set this env var in production.
function isTestBypass(req: NextRequest): boolean {
  const testSecret = process.env.FATHOM_WEBHOOK_TEST_SECRET;
  if (!testSecret) return false;
  const provided =
    req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
  return provided === testSecret;
}

// Process one matched client for a call: dedupe, analyze, persist, update progress.
async function processForClient(
  call: ReturnType<typeof normalizeFathomPayload>,
  coach: User | null,
  coachName: string | null,
  client: User,
  rawBody: unknown
): Promise<'inserted' | 'duplicate' | 'error'> {
  const existing = await getCheckIn(call.recordingId, client.email);
  if (existing) return 'duplicate';

  const base: NewCheckIn = {
    fathom_recording_id: call.recordingId,
    title: call.title || null,
    coach_email: coach?.email ?? null,
    coach_name: coach?.name || coachName || null,
    client_email: client.email,
    call_date: call.callDate,
    duration_minutes: call.durationMinutes,
    recording_url: call.recordingUrl,
    transcript: call.transcript || null,
    raw_payload: rawBody,
    status: 'pending',
  };

  try {
    const existingProgress = await getClientProgress(client.email);
    const analysis = await analyzeCheckIn({
      call,
      clientName: client.name || client.email,
      existing: existingProgress,
    });

    const inserted = await insertCheckIn({
      ...base,
      summary_bullets: analysis.call.summary_bullets,
      action_steps: analysis.call.action_steps,
      queries_answered: analysis.call.queries_answered,
      wins: analysis.call.wins,
      blockers: analysis.call.blockers,
      red_flags: analysis.call.red_flags,
      sentiment: analysis.call.sentiment,
      roadmap_updates: analysis.call.roadmap_updates,
      status: 'processed',
    });

    // Turn this call's action steps into trackable items (deduped by text), so
    // they appear in the client's action-item checklist + topbar count.
    await syncAiActionItems(client.email, inserted?.id ?? null, analysis.call.action_steps)
      .catch((e) => console.error('syncAiActionItems failed:', e));

    // Record the call on the client's journey timeline.
    await logEvent({
      clientEmail: client.email,
      type: 'checkin',
      title: call.title || 'Coaching check-in',
      summary: analysis.call.summary_bullets?.slice(0, 3).join(' • ') || null,
      refTable: 'check_ins',
      refId: inserted?.id ?? null,
      metadata: {
        coach: coach?.name || coachName || null,
        sentiment: analysis.call.sentiment,
        duration_minutes: call.durationMinutes,
      },
      occurredAt: call.callDate,
    });

    const prevRoadmap = (existingProgress?.roadmap_state ?? {}) as { current_phase?: number };
    await upsertClientProgress(client.email, {
      narrative: analysis.progress.narrative,
      open_action_items: analysis.progress.open_action_items,
      wins: analysis.progress.wins,
      momentum: analysis.progress.momentum,
      admin_notes: analysis.progress.admin_notes,
      roadmap_state: {
        ...prevRoadmap,
        // Carry the prior phase forward if this call didn't resolve one.
        current_phase: analysis.progress.current_phase || prevRoadmap.current_phase || 0,
      },
    });

    return 'inserted';
  } catch (err) {
    console.error('Check-in processing error:', err);
    // Persist a row so the raw payload is retained for reprocessing.
    await insertCheckIn({ ...base, status: 'error' }).catch(() => {});
    return 'error';
  }
}

export async function POST(req: NextRequest) {
  // Signature verification needs the exact raw bytes, so read text (not .json()).
  const rawBody = await req.text();

  if (!isTestBypass(req)) {
    const verdict = verifyFathomSignature(rawBody, req.headers, process.env.FATHOM_WEBHOOK_SECRET);
    if (!verdict.ok) {
      console.warn('Fathom webhook rejected:', verdict.reason);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const call = normalizeFathomPayload(body);
  if (!call.recordingId) {
    return NextResponse.json({ error: 'Missing recording id' }, { status: 422 });
  }

  // Route by call type: coaching check-ins (titled "Check-in <coach>") run the
  // client-progress pipeline below; every other call (sales/closing) is handed
  // to the ICP sales-analysis pipeline. One Fathom webhook serves both.
  if (!/check[\s-]*in/i.test(call.title)) {
    try {
      const { report_id, skipped } = await processSalesCall(body as Record<string, unknown>);
      if (skipped) return NextResponse.json({ ok: true, status: 'internal_call_skipped' });
      return NextResponse.json({ ok: true, status: 'sales_call', report_id });
    } catch (err) {
      console.error('Sales-call processing error:', err);
      return NextResponse.json({ error: 'Sales processing failed' }, { status: 500 });
    }
  }

  const { coach, coachNameFromTitle, clients } = await matchParticipants(call);

  // No client matched → store an unmatched row for the admin review queue.
  if (clients.length === 0) {
    const existing = await getCheckIn(call.recordingId, null);
    if (!existing) {
      await insertCheckIn({
        fathom_recording_id: call.recordingId,
        title: call.title || null,
        coach_email: coach?.email ?? null,
        coach_name: coach?.name || coachNameFromTitle || null,
        client_email: null,
        call_date: call.callDate,
        duration_minutes: call.durationMinutes,
        recording_url: call.recordingUrl,
        transcript: call.transcript || null,
        raw_payload: body,
        status: 'unmatched_client',
      });
    }
    return NextResponse.json({ ok: true, status: 'unmatched_client' });
  }

  // One row per matched client (handles 1-1 and group calls).
  const results: Record<string, string> = {};
  for (const client of clients) {
    results[client.email] = await processForClient(
      call,
      coach,
      coachNameFromTitle,
      client,
      body
    );
  }

  return NextResponse.json({ ok: true, results });
}
