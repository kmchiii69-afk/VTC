import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { updateUser } from '@/lib/kv';
import { logEvent } from '@/lib/journey';
import { ONBOARDING_STEPS } from '@/lib/onboarding-data';

// Records which VTC contract a client selected during onboarding,
// against their account, before they open the signing form.
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tier } = await req.json();

  // Validate against the contracts defined on the onboarding step.
  const contracts = ONBOARDING_STEPS.flatMap((s) => s.contracts ?? []);
  const match = contracts.find((c) => c.tier === tier);
  if (!match) return NextResponse.json({ error: 'Unknown contract' }, { status: 400 });

  await updateUser(user.email, { contract_tier: match.tier });
  await logEvent({
    clientEmail: user.email,
    type: 'contract_selected',
    title: `Selected ${match.label}`,
    metadata: { tier: match.tier, url: match.url },
  });

  return NextResponse.json({ ok: true, contractTier: match.tier });
}
