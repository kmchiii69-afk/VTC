import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { reorderBetaLessons } from '@/lib/ba-beta';

// Admin: bulk-persist drag-and-drop lesson ordering. The editor sends the final
// { id, category_id, sort_order } for every lesson it touched after a drag.
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items) return NextResponse.json({ error: 'items array required' }, { status: 400 });
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.category_id !== 'string' || typeof it.sort_order !== 'number') {
      return NextResponse.json({ error: 'Each item needs id, category_id, sort_order' }, { status: 400 });
    }
  }
  try {
    await reorderBetaLessons(items);
    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
