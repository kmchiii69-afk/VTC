import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createBetaCategory } from '@/lib/ba-beta';

// Admin: create a Brand Architect Beta category.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  try {
    const row = await createBetaCategory(name);
    return NextResponse.json(row ?? {});
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
