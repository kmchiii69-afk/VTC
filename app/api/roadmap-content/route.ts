import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getRoadmapOverrides, setRoadmapOverride, type RoadmapLink } from '@/lib/roadmap-content';

// GET: any signed-in user reads the overrides (so the roadmap can merge them).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ overrides: await getRoadmapOverrides() });
}

// POST: admins save one item's description + links.
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  const description = typeof body?.description === 'string' ? body.description : null;
  const links: RoadmapLink[] = Array.isArray(body?.links)
    ? body.links
        .filter((l: unknown): l is RoadmapLink => !!l && typeof (l as RoadmapLink).label === 'string' && typeof (l as RoadmapLink).url === 'string')
        .map((l: RoadmapLink) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l: RoadmapLink) => l.label && l.url)
    : [];

  try {
    await setRoadmapOverride(itemId, description && description.trim() ? description : null, links);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('roadmap-content save error:', err);
    return NextResponse.json({ error: 'Save failed (has supabase-roadmap-content.sql been run?)' }, { status: 500 });
  }
}
