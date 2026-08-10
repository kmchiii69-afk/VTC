import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { GUIDE_SECTION_IDS } from '@/lib/guides';

// Any authenticated member can read the guides.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await db().from('section_guides').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Only admins can set/update a section's guide. Upserts one row per section.
export async function PUT(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!GUIDE_SECTION_IDS.includes(b.section)) return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  const url = typeof b.loom_url === 'string' ? b.loom_url.trim() : '';

  // Empty url => clear the guide for this section.
  if (!url) {
    const { error } = await db().from('section_guides').delete().eq('section', b.section);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ section: b.section, loom_url: null, title: null });
  }

  const { data, error } = await db().from('section_guides').upsert({
    section: b.section,
    loom_url: url,
    title: b.title?.trim() || null,
  }, { onConflict: 'section' }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
