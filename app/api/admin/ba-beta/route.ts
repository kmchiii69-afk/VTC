import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getBetaTree } from '@/lib/ba-beta';

export const dynamic = 'force-dynamic';

// Admin-only: the full Brand Architect Beta catalog. Never exposed to members.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    return NextResponse.json(await getBetaTree());
  } catch {
    return NextResponse.json({ error: 'Catalog temporarily unavailable' }, { status: 503 });
  }
}
