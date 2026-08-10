import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canAdminManageClient } from '@/lib/acquisition-admin';
import { notifyTasksAssigned } from '@/lib/discord';
import { listTodos, createTodo, parseTodoCreate, wasRecentlyAssigned } from '@/lib/todos';

type Params = { params: Promise<{ email: string }> };

// Full admins may act on any client; acq-admins only on acquisition clients.
async function requireManager(clientEmail: string) {
  const auth = await getAuthUser();
  if (!auth) return null;
  return (await canAdminManageClient(auth.email, clientEmail)) ? auth : null;
}

// GET → a client's to-dos (for the CSM client profile).
export async function GET(_req: NextRequest, { params }: Params) {
  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  if (!await requireManager(clientEmail)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ items: await listTodos(clientEmail) });
}

// POST → admin adds one ({ text }) or many ({ texts: [...] }) to-dos to a
// client's list; bulk items share the same category/priority/week/dates.
export async function POST(req: NextRequest, { params }: Params) {
  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  const auth = await requireManager(clientEmail);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseTodoCreate(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = [];
  for (const [i, it] of parsed.items.entries()) {
    const item = await createTodo({
      client_email: clientEmail,
      ...parsed.fields,
      text: it.text,
      priority: it.priority ?? parsed.fields.priority, // inline p1…p4 wins
      week: it.week ?? parsed.fields.week,             // inline w2/week2 wins
      created_by: auth.email,
      source: 'admin',
      sort_order: i, // keep the pasted order top-to-bottom
    });
    if (item) created.push(item);
  }
  if (!created.length) return NextResponse.json({ error: 'Could not create' }, { status: 500 });
  // Ping the client's 1-1 Discord channel once — however many tasks were added,
  // and not again if they were already pinged for an assignment moments ago.
  if (!await wasRecentlyAssigned(clientEmail, created.map((t) => t.id))) {
    await notifyTasksAssigned(clientEmail);
  }
  // Single add keeps its original shape; bulk returns the batch.
  return NextResponse.json(Array.isArray(body?.texts) ? { items: created } : created[0]);
}
