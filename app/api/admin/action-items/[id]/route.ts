import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canAdminManageClient } from '@/lib/acquisition-admin';
import { getTodo, updateTodo, setTodoDone, deleteTodo, todoToActionItem } from '@/lib/todos';

type Params = { params: Promise<{ id: string }> };

// Resolve the task and confirm the caller may manage its owner (full admin any
// client; acq-admin only acquisition clients). Backed by client_todos.
async function loadManageable(id: string) {
  const auth = await getAuthUser();
  if (!auth) return { auth: null, todo: null };
  const todo = await getTodo(id);
  if (!todo) return { auth, todo: null };
  const ok = await canAdminManageClient(auth.email, todo.client_email);
  return { auth: ok ? auth : null, todo: ok ? todo : null };
}

// Edit a task: toggle status, or update text / due date.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { auth, todo } = await loadManageable(id);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (body.status === 'open' || body.status === 'completed') {
    const updated = await setTodoDone(id, body.status === 'completed', auth.email);
    return NextResponse.json(updated ? todoToActionItem(updated) : null);
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.text === 'string' && body.text.trim()) updates.text = body.text.trim();
  if (body.due_date !== undefined) updates.due_date = body.due_date || null;
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const updated = await updateTodo(id, updates);
  return NextResponse.json(updated ? todoToActionItem(updated) : null);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { auth, todo } = await loadManageable(id);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteTodo(id);
  return NextResponse.json({ ok: true });
}
