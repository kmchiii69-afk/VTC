import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canAdminManageClient } from '@/lib/acquisition-admin';
import { notifyTasksAssigned } from '@/lib/discord';
import { listActionItemsView, createTodo, todoToActionItem, wasRecentlyAssigned } from '@/lib/todos';

type Params = { params: Promise<{ email: string }> };

// Full admins may act on any client; acq-admins only on acquisition clients.
async function requireManager(clientEmail: string) {
  const auth = await getAuthUser();
  if (!auth) return null;
  return (await canAdminManageClient(auth.email, clientEmail)) ? auth : null;
}

// List a client's tasks (open + completed) for the admin drawer. Backed by
// client_todos — action items are just to-dos now.
export async function GET(_req: NextRequest, { params }: Params) {
  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  if (!await requireManager(clientEmail)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const items = await listActionItemsView(clientEmail, { includeCompleted: true });
  return NextResponse.json(items);
}

// Assign a new task to a client (coach/admin) — creates a to-do + Discord ping.
export async function POST(req: NextRequest, { params }: Params) {
  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  const auth = await requireManager(clientEmail);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });

  const item = await createTodo({
    client_email: clientEmail,
    text: body.text,
    due_date: body.due_date || null,
    source: 'admin',
    created_by: auth.email,
    list: 'individual',
  });
  if (!item) return NextResponse.json({ error: 'Could not create' }, { status: 500 });
  // Ping the client's 1-1 Discord channel that a coach/admin assigned them a
  // task — skipped when they were already pinged for a recent assignment.
  if (!await wasRecentlyAssigned(clientEmail, [item.id])) {
    await notifyTasksAssigned(clientEmail);
  }
  return NextResponse.json(todoToActionItem(item));
}
