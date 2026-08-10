import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { updateBetaLesson, deleteBetaLesson } from '@/lib/ba-beta';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// Turn any thrown value into a JSON error with its real message (and log it),
// so failures never escape as Next's generic HTML 500 page.
function fail(where: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[ba-beta/lessons/[id]] ${where}:`, e);
  return NextResponse.json({ error: msg || 'Failed' }, { status: 500 });
}

// Admin: rename / re-embed / reorder a lesson.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthUser();
    if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    await updateBetaLesson(id, {
      title: typeof b.title === 'string' ? b.title.trim() : undefined,
      embed_id: typeof b.embed_id === 'string' ? b.embed_id.trim() : undefined,
      category_id: typeof b.category_id === 'string' ? b.category_id.trim() : undefined,
      sort_order: typeof b.sort_order === 'number' ? b.sort_order : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail('PATCH', e);
  }
}

// Admin: delete a lesson (its resources cascade).
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthUser();
    if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await deleteBetaLesson(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail('DELETE', e);
  }
}
