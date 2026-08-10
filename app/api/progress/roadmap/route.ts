import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getRoadmapProgress, setRoadmapItem, getUser, markPhaseNotified } from '@/lib/kv';
import { canToggleItem, flatItemIds, phaseComplete } from '@/lib/roadmap-data';
import { logEvent } from '@/lib/journey';
import { sendRoadmapPhaseComplete } from '@/lib/discord/notify';
import { sendChannelMessage } from '@/lib/discord';
import { roadmapOpen } from '@/lib/client-tags';
import { phasesFor, roadmapVariantFor } from '@/lib/roadmap-variant';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [completed, profile] = await Promise.all([getRoadmapProgress(user.email), getUser(user.email)]);
  // "Existing Client" tag → the roadmap is fully open (no phase locking).
  // `variant` tells the client which roadmap to render ("Creative Specialist"
  // members get their own); resolved here so no surface has to re-derive it.
  return NextResponse.json({
    completed,
    open: roadmapOpen(profile?.tags),
    variant: roadmapVariantFor(profile?.features),
  });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { itemId, completed } = await req.json();
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  // Enforce one-step-at-a-time order server-side: only the frontier item may be
  // checked, and only the most recent completed item may be unchecked. This
  // keeps progress a contiguous prefix even if a client bypasses the UI.
  const [progressRows, profile] = await Promise.all([getRoadmapProgress(user.email), getUser(user.email)]);
  const current = new Set(progressRows);

  // Validate + gate against THIS member's roadmap (Creative Specialists have
  // their own phases and item ids), so ids from the other roadmap are rejected.
  const phases = phasesFor(profile?.features);
  if (!flatItemIds(phases).includes(itemId)) {
    return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
  }
  const alreadyDone = current.has(itemId);
  if (Boolean(completed) === alreadyDone) {
    return NextResponse.json({ ok: true }); // no-op (already in desired state)
  }
  // "Existing Client" members have an open roadmap — no order enforcement.
  if (!roadmapOpen(profile?.tags) && !canToggleItem(itemId, current, phases)) {
    return NextResponse.json(
      { error: 'Complete the previous step first' },
      { status: 409 }
    );
  }

  await setRoadmapItem(user.email, itemId, completed);

  // Record the step change on the client's journey timeline. Mark when the
  // toggle completes a whole phase ("checkpoint crossed") so the CSM dashboard
  // can surface it.
  const phase = phases.find((p) => p.items.some((i) => i.id === itemId));
  const item = phase?.items.find((i) => i.id === itemId);
  const next = new Set(current);
  if (completed) next.add(itemId); else next.delete(itemId);
  const phaseCompleted = !!phase && completed && phaseComplete(phase, next);
  await logEvent({
    clientEmail: user.email,
    type: completed ? 'roadmap_completed' : 'roadmap_uncompleted',
    title: item?.text || itemId,
    refTable: 'roadmap_progress',
    refId: itemId,
    metadata: {
      phase_id: phase?.id ?? null,
      phase_title: phase?.title ?? null,
      phase_completed: phaseCompleted,
    },
  });

  // When a client finishes a phase (deduped per phase): ping the team channel,
  // and also post a congrats to the client's own 1-1 Discord channel if connected.
  if (phaseCompleted && phase) {
    const firstTime = await markPhaseNotified(user.email, phase.id);
    if (firstTime) {
      const u = await getUser(user.email);
      await sendRoadmapPhaseComplete({
        clientName: u?.name || '',
        clientEmail: user.email,
        phaseLabel: phase.label,
        phaseTitle: phase.title,
      }).catch(() => {});

      if (u?.discord_channel_id) {
        const who = u?.name || 'You';
        await sendChannelMessage(
          u.discord_channel_id,
          `**${who}** just completed **${phase.label}: ${phase.title}**! That's another milestone down — onto the next phase. Keep the momentum going.`
        ).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
