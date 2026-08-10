import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getResource } from '@/lib/resources';

export const dynamic = 'force-dynamic';

// Client-facing: a single resource by slug (for its in-app page).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;
  const resource = await getResource(decodeURIComponent(slug));
  if (!resource) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ resource }, { headers: { 'Cache-Control': 'no-store' } });
}
