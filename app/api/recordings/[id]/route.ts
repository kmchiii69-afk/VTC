import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { RECORDING_CATEGORY_IDS } from '@/lib/recordings';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { error } = await db().from('call_recordings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Admins can edit a recording's title, embed code, call date, category, and
// summary document link.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, string | null> = {};
  if ('summary_url' in b) patch.summary_url = b.summary_url?.trim() || null;
  if ('title' in b) patch.title = b.title?.trim() || null;
  if ('embed_code' in b) patch.embed_code = b.embed_code?.trim() || null;
  if ('call_date' in b) patch.call_date = b.call_date || null;
  if ('category' in b) {
    if (!RECORDING_CATEGORY_IDS.includes(b.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    patch.category = b.category;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { data, error } = await db().from('call_recordings').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
