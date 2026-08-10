import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listConversations } from '@/lib/ai/memory';

export const dynamic = 'force-dynamic';

// The signed-in user's SooWei AI chat threads (most-recent first) for the sidebar.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ conversations: await listConversations('content', auth.email) });
}
