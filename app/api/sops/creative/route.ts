import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { resolveFeatures } from '@/lib/features';
import { getDefaultFeatures } from '@/lib/settings';
import { getCreativeSops } from '@/lib/creative-sops';

export const dynamic = 'force-dynamic';

// Creative Specialist SOPs are gated by the `creative_specialist` tag. Admins
// and members holding the tag get the list; everyone else gets an empty list
// (so the group simply doesn't appear for them, while the rest of the SOP
// library stays open to all).
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (auth.role !== 'admin') {
    const user = await getUser(auth.email);
    const feats = resolveFeatures(user?.features, user?.role ?? 'user', await getDefaultFeatures());
    if (!feats.includes('creative_specialist')) return NextResponse.json([]);
  }
  return NextResponse.json(await getCreativeSops());
}
