import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listUnmatchedCheckIns } from '@/lib/checkins';

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const checkins = await listUnmatchedCheckIns();
  return NextResponse.json(checkins);
}
