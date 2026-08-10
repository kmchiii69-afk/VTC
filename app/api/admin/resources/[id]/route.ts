import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { updateResource, deleteResource } from '@/lib/resources';
import type { ResourceType } from '@/lib/resources-data';

const TYPES: ResourceType[] = ['native', 'embed', 'template'];

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

// Admin: edit a resource.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.title === 'string') patch.title = b.title.trim();
  if (typeof b.description === 'string') patch.description = b.description;
  if (typeof b.category === 'string') patch.category = b.category.trim() || 'Resources';
  if (typeof b.type === 'string' && TYPES.includes(b.type as ResourceType)) patch.type = b.type;
  if (typeof b.body === 'string') patch.body = b.body;
  if ('embed_url' in b) patch.embed_url = b.embed_url ? String(b.embed_url).trim() : null;
  if ('template_url' in b) patch.template_url = b.template_url ? String(b.template_url).trim() : null;
  if ('upload_step_id' in b) patch.upload_step_id = b.upload_step_id ? String(b.upload_step_id).trim() : null;
  if ('upload_slot' in b) patch.upload_slot = b.upload_slot ? String(b.upload_slot).trim() : null;
  if (typeof b.sort_order === 'number') patch.sort_order = b.sort_order;
  try {
    await updateResource(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

// Admin: delete a resource.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    await deleteResource(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
