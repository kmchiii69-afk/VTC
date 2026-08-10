import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { resolveFeatures } from '@/lib/features';
import { getDefaultFeatures } from '@/lib/settings';

// Never cache — feature access changes the moment an admin toggles it.
export const dynamic = 'force-dynamic';

// Client-facing: returns the feature ids the caller is allowed to see in the
// portal. Admins get every feature; ungated members fall back to the global
// default allowlist configured by admins (recordings only out of the box).
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const globalDefault = await getDefaultFeatures();
  return NextResponse.json({ features: resolveFeatures(user.features, user.role, globalDefault) });
}
