import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { listCheckInsForClient, countCheckInsForClient, getClientProgress } from '@/lib/checkins';

// Maps the stored phase number (roadmap_state.current_phase) to its program label.
const PHASE_LABELS: Record<number, string> = {
  1: 'Foundation of Content',
  2: 'Mastering Camera Presence',
  3: 'Brand Positioning + Content Messaging',
  4: 'TOF Masterclass',
  5: 'MOF Masterclass',
};

// Client-facing: returns ONLY the caller's own counts + positive progress.
// Deliberately omits admin_notes, red_flags, and blockers — those are admin-only.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [counts, checkins, progress] = await Promise.all([
    countCheckInsForClient(user.email),
    listCheckInsForClient(user.email),
    getClientProgress(user.email),
  ]);

  const phaseNum =
    Number((progress?.roadmap_state as { current_phase?: number } | null | undefined)?.current_phase) || 0;

  return NextResponse.json({
    counts, // { total, byCoach } — safe to show
    progress: progress
      ? {
          narrative: progress.narrative,
          open_action_items: progress.open_action_items,
          wins: progress.wins,
          momentum: progress.momentum,
          current_phase: phaseNum, // 0 = not yet assessed
          current_phase_label: PHASE_LABELS[phaseNum] ?? '',
          // admin_notes intentionally excluded
        }
      : null,
    checkins: checkins
      .filter((c) => c.status === 'processed')
      .map((c) => ({
        id: c.id,
        title: c.title,
        coach_name: c.coach_name,
        call_date: c.call_date,
        recording_url: c.recording_url,
        summary_bullets: c.summary_bullets,
        action_steps: c.action_steps,
        queries_answered: c.queries_answered,
        wins: c.wins,
        // red_flags, blockers, transcript intentionally excluded
      })),
  });
}
