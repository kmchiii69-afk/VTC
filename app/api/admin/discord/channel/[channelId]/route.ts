import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

type Params = { params: Promise<{ channelId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!BOT_TOKEN) return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });

  const { channelId } = await params;
  const limit = req.nextUrl.searchParams.get('limit') ?? '50';
  const authorId = req.nextUrl.searchParams.get('author_id') ?? '';

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
    { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err.message || 'Discord error' }, { status: res.status });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any[] = await res.json();
  if (authorId) {
    messages = messages.filter((m) => m.author?.id === authorId);
  }

  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      content: m.content,
      author: m.author?.username ?? '',
      author_id: m.author?.id ?? '',
      timestamp: m.timestamp,
    }))
  );
}
