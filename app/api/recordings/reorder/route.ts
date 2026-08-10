import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { RECORDING_CATEGORY_IDS } from '@/lib/recordings';

// Bulk-persist drag-and-drop ordering. The admin player sends the full, final
// list of { id, category, sort_order } after a drag; we write each row's new
// position (and category, since a card can be dragged onto another category's
// tab). Admin only.
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items) return NextResponse.json({ error: 'items array required' }, { status: 400 });

  // Validate before writing anything.
  for (const it of items) {
    if (!it || typeof it.id !== 'string') {
      return NextResponse.json({ error: 'Each item needs an id' }, { status: 400 });
    }
    if (!RECORDING_CATEGORY_IDS.includes(it.category)) {
      return NextResponse.json({ error: `Invalid category: ${it.category}` }, { status: 400 });
    }
    if (typeof it.sort_order !== 'number') {
      return NextResponse.json({ error: 'Each item needs a numeric sort_order' }, { status: 400 });
    }
  }

  const client = db();
  const results = await Promise.all(
    items.map((it: { id: string; category: string; sort_order: number }) =>
      client
        .from('call_recordings')
        .update({ category: it.category, sort_order: it.sort_order })
        .eq('id', it.id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: items.length });
}
