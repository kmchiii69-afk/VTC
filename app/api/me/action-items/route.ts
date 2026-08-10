import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { listActionItemsView } from '@/lib/todos';

// Client-facing: the caller's own tasks (open + completed) and open count.
// Backed by the unified client_todos table (action items are just to-dos now).
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await listActionItemsView(user.email, { includeCompleted: true });
  const openCount = items.filter((i) => i.status === 'open').length;
  return NextResponse.json({ items, openCount });
}
