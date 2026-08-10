import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getConversation, deleteConversation } from '@/lib/ai/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Load one of the caller's own chat threads.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const conv = await getConversation('content', auth.email, id);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(conv);
}

// Delete one of the caller's own chat threads.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const ok = await deleteConversation('content', auth.email, id);
  return NextResponse.json({ ok });
}
