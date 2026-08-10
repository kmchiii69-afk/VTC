import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import {
  getOnboardingProgress,
  setOnboardingStep,
  getOnboardedAt,
  setOnboardedAt,
  getOnboardingUploads,
} from '@/lib/onboarding';
import { canToggleStep, resolveOnboardingCallLink } from '@/lib/onboarding-data';
import { onboardingVariantFor, stepIdsFor } from '@/lib/onboarding-variant';
import { logEvent } from '@/lib/journey';

// Never cache — onboarding status changes the moment a client finishes the
// wizard or an admin applies a skip-onboarding tag. A stale cached response
// here strands a client on the onboarding screen even after they're onboarded.
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [completed, profile, uploads] = await Promise.all([
    getOnboardingProgress(user.email),
    getUser(user.email),
    getOnboardingUploads(user.email),
  ]);
  return NextResponse.json({
    email: user.email,
    completed,
    onboardedAt: profile?.onboarded_at ?? null,
    contractTier: profile?.contract_tier ?? null,
    tags: profile?.tags ?? [],
    uploads,
    callLink: resolveOnboardingCallLink(profile?.tags),
    // Which onboarding this member is on — 'creative' is the single-form
    // Creative Specialist wizard (see lib/onboarding-variant.ts).
    variant: onboardingVariantFor(profile?.features),
  }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stepId, completed } = await req.json();
  if (!stepId) return NextResponse.json({ error: 'stepId required' }, { status: 400 });

  // Validate against THIS member's onboarding — a Creative Specialist has a
  // single step, everyone else the standard sequence.
  const profile = await getUser(user.email);
  const stepIds = stepIdsFor(profile?.features);
  if (!stepIds.includes(stepId)) {
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  }

  // Enforce one-step-at-a-time order server-side (same rule as the roadmap):
  // only the frontier step may be toggled, keeping progress a gap-free prefix.
  const current = new Set(await getOnboardingProgress(user.email));
  const alreadyDone = current.has(stepId);
  if (Boolean(completed) === alreadyDone) {
    return NextResponse.json({ ok: true, completed: [...current] }); // no-op
  }
  if (!canToggleStep(stepId, current, stepIds)) {
    return NextResponse.json({ error: 'Complete the previous step first' }, { status: 409 });
  }

  // The contract step can't be checked off until a signature actually exists.
  if (stepId === 'select-contract' && completed) {
    const { getLatestSignature } = await import('@/lib/contracts');
    const sig = await getLatestSignature(user.email).catch(() => null);
    if (!sig) return NextResponse.json({ error: 'Please sign your contract first' }, { status: 409 });
  }

  const wasEmpty = current.size === 0;
  await setOnboardingStep(user.email, stepId, completed);

  const next = new Set(current);
  if (completed) next.add(stepId); else next.delete(stepId);

  // Log start (first step completed) and finish (all steps complete).
  if (completed && wasEmpty) {
    await logEvent({ clientEmail: user.email, type: 'onboarding_started', title: 'Started onboarding' });
  }

  let onboardedAt = await getOnboardedAt(user.email);
  // Done when every step of THEIR onboarding is ticked — one step for a Creative
  // Specialist, the full sequence for a standard client.
  const allDone = stepIds.every((id) => next.has(id));
  if (allDone && !onboardedAt) {
    onboardedAt = Date.now();
    await setOnboardedAt(user.email, onboardedAt);
    await logEvent({ clientEmail: user.email, type: 'onboarding_completed', title: 'Completed onboarding' });
  }

  return NextResponse.json({ ok: true, completed: [...next], onboardedAt });
}
