import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { resolveFathomCallFromUrl } from '@/lib/fathom';
import { analyzeCheckIn } from '@/lib/checkin-ai';
import {
  listCheckInsForClient, countCheckInsForClient,
  getCheckIn, insertCheckIn, getClientProgress, upsertClientProgress, type NewCheckIn,
} from '@/lib/checkins';
import { syncAiTodos as syncAiActionItems } from '@/lib/todos';
import { logEvent } from '@/lib/journey';
import type { NormalizedCall } from '@/lib/checkin-matching';

export const maxDuration = 120; // Fathom fetch + Sonnet analysis

const COACHES = ['SooWei', 'Kim', 'Aidan', 'George'];

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

type Params = { params: Promise<{ email: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  const [checkins, counts] = await Promise.all([
    listCheckInsForClient(clientEmail),
    countCheckInsForClient(clientEmail),
  ]);
  return NextResponse.json({ checkins, counts });
}

// Manually add a check-in: pull the transcript from a Fathom URL, run the same
// AI pipeline as the webhook, and store it against the client.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || '').trim();
  const fathomUrl = String(body.fathomUrl || '').trim();
  const coach = String(body.coach || '').trim();
  const pastedTranscript = String(body.transcript || '').trim();

  if (!fathomUrl && !pastedTranscript) {
    return NextResponse.json({ error: 'Provide a Fathom URL or paste the transcript.' }, { status: 400 });
  }
  if (!COACHES.includes(coach)) return NextResponse.json({ error: 'Pick a coach' }, { status: 400 });

  const client = await getUser(clientEmail);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Resolve the transcript: a pasted transcript is used as-is (works for calls on
  // any account/platform); otherwise pull it from Fathom. The full transcript is
  // passed through untruncated — the analyzer handles up to ~240 min of speech.
  let recordingId: string;
  let transcript: string;
  let resolvedTitle: string | undefined;
  let resolvedDate: string | null | undefined;

  if (pastedTranscript) {
    // Synthetic id from the content so identical re-pastes dedupe.
    recordingId = 'manual-' + createHash('sha256').update(`${pastedTranscript}|${date}|${coach}`).digest('hex').slice(0, 24);
    transcript = pastedTranscript;
  } else {
    let resolved;
    try {
      resolved = await resolveFathomCallFromUrl(fathomUrl);
    } catch (e) {
      return NextResponse.json({ error: `Fathom error: ${e instanceof Error ? e.message : 'failed'}` }, { status: 502 });
    }
    if (!resolved?.transcript) {
      return NextResponse.json({ error: "Couldn't fetch a transcript from that Fathom URL (it may be on a different account). Paste the transcript instead." }, { status: 422 });
    }
    recordingId = resolved.recordingId;
    transcript = resolved.transcript;
    resolvedTitle = resolved.title;
    resolvedDate = resolved.callDate;
  }

  const dup = await getCheckIn(recordingId, client.email);
  if (dup) return NextResponse.json({ error: 'This client already has this check-in.' }, { status: 409 });

  const callDate = date ? new Date(date).toISOString() : (resolvedDate || null);
  const call: NormalizedCall = {
    recordingId,
    title: resolvedTitle || `Check-in — ${coach}`,
    recordingUrl: fathomUrl || null,
    callDate,
    durationMinutes: null,
    transcript,
    summary: '',
    actionItems: [],
    hostEmail: null,
    participantEmails: [],
  };

  const base: NewCheckIn = {
    fathom_recording_id: recordingId,
    title: call.title,
    coach_email: null,
    coach_name: coach,
    client_email: client.email,
    call_date: callDate,
    duration_minutes: null,
    recording_url: fathomUrl || null,
    transcript,
    raw_payload: { source: pastedTranscript ? 'manual-paste' : 'manual-fathom', fathomUrl: fathomUrl || null, coach, addedBy: auth.email },
    status: 'pending',
  };

  try {
    const existingProgress = await getClientProgress(client.email);
    const analysis = await analyzeCheckIn({ call, clientName: client.name || client.email, existing: existingProgress });

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

    await syncAiActionItems(client.email, inserted?.id ?? null, analysis.call.action_steps).catch(() => {});

    await logEvent({
      clientEmail: client.email,
      type: 'checkin',
      title: call.title,
      summary: analysis.call.summary_bullets?.slice(0, 3).join(' • ') || null,
      refTable: 'check_ins',
      refId: inserted?.id ?? null,
      metadata: { coach, sentiment: analysis.call.sentiment, manual: true },
      occurredAt: callDate,
    });

    const prevRoadmap = (existingProgress?.roadmap_state ?? {}) as { current_phase?: number };
    await upsertClientProgress(client.email, {
      narrative: analysis.progress.narrative,
      open_action_items: analysis.progress.open_action_items,
      wins: analysis.progress.wins,
      momentum: analysis.progress.momentum,
      admin_notes: analysis.progress.admin_notes,
      roadmap_state: { ...prevRoadmap, current_phase: analysis.progress.current_phase || prevRoadmap.current_phase || 0 },
    });

    return NextResponse.json({ ok: true, checkIn: inserted });
  } catch (err) {
    console.error('Manual check-in error:', err);
    return NextResponse.json({ error: 'Failed to process the check-in.' }, { status: 500 });
  }
}
