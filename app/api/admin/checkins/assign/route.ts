import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import {
  getCheckInById,
  getCheckIn,
  updateCheckIn,
  getClientProgress,
  upsertClientProgress,
} from '@/lib/checkins';
import { normalizeFathomPayload } from '@/lib/checkin-matching';
import { analyzeCheckIn } from '@/lib/checkin-ai';

export const maxDuration = 60;

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

// Assign an unmatched check-in to a client, then run the same analysis pipeline.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { check_in_id, client_email } = await req.json();
  if (!check_in_id || !client_email) {
    return NextResponse.json({ error: 'check_in_id and client_email required' }, { status: 400 });
  }

  const checkIn = await getCheckInById(check_in_id);
  if (!checkIn) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 });

  const client = await getUser(client_email);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Guard against assigning to a client who already has this recording.
  const dup = await getCheckIn(checkIn.fathom_recording_id, client.email);
  if (dup && dup.id !== checkIn.id) {
    return NextResponse.json({ error: 'Client already has this check-in' }, { status: 409 });
  }

  // Rebuild the normalized call from the stored raw payload (fall back to stored
  // columns if the raw payload is unavailable).
  const call = checkIn.raw_payload
    ? normalizeFathomPayload(checkIn.raw_payload)
    : {
        recordingId: checkIn.fathom_recording_id,
        title: checkIn.title ?? '',
        recordingUrl: checkIn.recording_url,
        callDate: checkIn.call_date,
        durationMinutes: checkIn.duration_minutes,
        transcript: checkIn.transcript ?? '',
        summary: '',
        actionItems: [],
        hostEmail: null,
        participantEmails: [],
      };

  try {
    const existingProgress = await getClientProgress(client.email);
    const analysis = await analyzeCheckIn({
      call,
      clientName: client.name || client.email,
      existing: existingProgress,
    });

    const updated = await updateCheckIn(checkIn.id, {
      client_email: client.email,
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

    const prevRoadmap = (existingProgress?.roadmap_state ?? {}) as { current_phase?: number };
    await upsertClientProgress(client.email, {
      narrative: analysis.progress.narrative,
      open_action_items: analysis.progress.open_action_items,
      wins: analysis.progress.wins,
      momentum: analysis.progress.momentum,
      admin_notes: analysis.progress.admin_notes,
      roadmap_state: {
        ...prevRoadmap,
        current_phase: analysis.progress.current_phase || prevRoadmap.current_phase || 0,
      },
    });

    return NextResponse.json({ ok: true, checkIn: updated });
  } catch (err) {
    console.error('Assign/reprocess error:', err);
    return NextResponse.json({ error: 'Failed to process check-in' }, { status: 500 });
  }
}
