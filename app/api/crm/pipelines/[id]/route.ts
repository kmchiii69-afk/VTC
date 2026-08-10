import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { normalizeStages } from '../route';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

// PATCH /api/crm/pipelines/[id] — rename, edit stages, or reorder.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (typeof b.name === 'string') {
    const name = b.name.trim();
    if (!name) return NextResponse.json({ error: 'Pipeline name cannot be empty' }, { status: 400 });
    updates.name = name;
  }
  if ('stages' in b) {
    const stages = normalizeStages(b.stages);
    if (stages.length === 0) return NextResponse.json({ error: 'Add at least one stage' }, { status: 400 });
    updates.stages = stages;
  }
  if (typeof b.position === 'number') updates.position = b.position;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await db()
    .from('crm_pipelines')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/crm/pipelines/[id] — leads keep existing (pipeline_id → null via FK).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { error } = await db().from('crm_pipelines').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
