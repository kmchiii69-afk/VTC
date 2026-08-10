import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getBreakdowns } from '@/lib/breakdowns';

export const dynamic = 'force-dynamic';

// Any authenticated member can read the breakdowns.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getBreakdowns());
}
