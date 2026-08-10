import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { reorderTodos } from '@/lib/todos';

// PATCH → persist the caller's own drag-and-drop order. Body: { items: [{ id, sort_order }] }.
// reorderTodos scopes every write to the caller's email, so foreign ids are no-ops.
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items) return NextResponse.json({ error: 'items array required' }, { status: 400 });
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.sort_order !== 'number') {
      return NextResponse.json({ error: 'Each item needs id + numeric sort_order' }, { status: 400 });
    }
  }

  await reorderTodos(auth.email, items);
  return NextResponse.json({ ok: true, count: items.length });
}
