import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sendChannelMessage } from '@/lib/discord';

// Admin: send a test message to a Discord channel to confirm the bot can post
// there (used by the "Send test message" button next to a client's 1-1 channel).
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { channelId } = await req.json().catch(() => ({}));
  const id = String(channelId || '').trim();
  if (!id) return NextResponse.json({ error: 'Channel ID required' }, { status: 400 });
  if (!process.env.DISCORD_BOT_TOKEN) return NextResponse.json({ ok: false, error: 'DISCORD_BOT_TOKEN is not set' }, { status: 200 });

  const ok = await sendChannelMessage(id, 'Test message from Goh Consulting — your 1-1 channel is connected. Roadmap phase completions will post here.');
  return NextResponse.json(
    ok ? { ok: true } : { ok: false, error: "Couldn't post — check the channel ID and that the bot has access + Send Messages permission here." },
    { status: 200 }
  );
}
