import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { updateSection, deleteSection } from '@/lib/modules';

type Params = { params: Promise<{ id: string }> };

// Admin: rename / reorder a category.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  try {
    await updateSection(id, {
      name: typeof b.name === 'string' ? b.name.trim() : undefined,
      sort_order: typeof b.sort_order === 'number' ? b.sort_order : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

// Admin: delete a category (its modules cascade).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    await deleteSection(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
