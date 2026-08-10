import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canAdminManageClient } from '@/lib/acquisition-admin';
import { getTodo, updateTodo, deleteTodo, parseTodoUpdate } from '@/lib/todos';

type Params = { params: Promise<{ email: string; id: string }> };

// Full admins may act on any client; acq-admins only on acquisition clients.
async function requireManager(clientEmail: string) {
  const auth = await getAuthUser();
  if (!auth) return null;
  return (await canAdminManageClient(auth.email, clientEmail)) ? auth : null;
}

// Confirm the todo exists and belongs to the client in the path.
async function ownedTodo(id: string, email: string) {
  const todo = await getTodo(id);
  return todo && todo.client_email === email.toLowerCase().trim() ? todo : null;
}

// PATCH → admin edits one of a client's to-dos.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { email, id } = await params;
  const clientEmail = decodeURIComponent(email);
  if (!await requireManager(clientEmail)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!await ownedTodo(id, clientEmail)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const updates = parseTodoUpdate(body);
  if ('error' in updates) return NextResponse.json({ error: updates.error }, { status: 400 });
  return NextResponse.json(await updateTodo(id, updates));
}

// DELETE → admin removes one of a client's to-dos.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { email, id } = await params;
  const clientEmail = decodeURIComponent(email);
  if (!await requireManager(clientEmail)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!await ownedTodo(id, clientEmail)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await deleteTodo(id);
  return NextResponse.json({ ok: true });
}
