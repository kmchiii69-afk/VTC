import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getTodo, updateTodo, deleteTodo, parseTodoUpdate } from '@/lib/todos';

type Params = { params: Promise<{ id: string }> };

// PATCH → edit one of the caller's own to-dos.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const todo = await getTodo(id);
  if (!todo || todo.client_email !== auth.email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const updates = parseTodoUpdate(body);
  if ('error' in updates) return NextResponse.json({ error: updates.error }, { status: 400 });
  const saved = await updateTodo(id, updates);
  return NextResponse.json(saved);
}

// DELETE → remove one of the caller's own to-dos.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const todo = await getTodo(id);
  if (!todo || todo.client_email !== auth.email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await deleteTodo(id);
  return NextResponse.json({ ok: true });
}
