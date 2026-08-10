import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getResources } from '@/lib/resources';

// Never cache — admins can edit/add resources at any time.
export const dynamic = 'force-dynamic';

// Client-facing: the full Resources library for the portal Resources tab.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const resources = await getResources();
  return NextResponse.json({ resources }, { headers: { 'Cache-Control': 'no-store' } });
}
