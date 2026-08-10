import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listTodos, createTodo, parseTodoCreate } from '@/lib/todos';

// GET → the caller's own to-dos.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ items: await listTodos(auth.email) });
}

// POST → the caller adds one ({ text }) or many ({ texts: [...] }) to-dos to
// their own list; bulk items share the same category/priority/week/dates.
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseTodoCreate(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = [];
  for (const [i, it] of parsed.items.entries()) {
    const item = await createTodo({
      client_email: auth.email,
      ...parsed.fields,
      text: it.text,
      priority: it.priority ?? parsed.fields.priority, // inline p1…p4 wins
      week: it.week ?? parsed.fields.week,             // inline w2/week2 wins
      created_by: 'client',
      sort_order: i, // keep the pasted order top-to-bottom
    });
    if (item) created.push(item);
  }
  if (!created.length) return NextResponse.json({ error: 'Could not create' }, { status: 500 });
  // Single add keeps its original shape; bulk returns the batch.
  return NextResponse.json(Array.isArray(body?.texts) ? { items: created } : created[0]);
}
