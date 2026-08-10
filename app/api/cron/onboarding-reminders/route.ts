import { NextRequest, NextResponse } from 'next/server';
import { runOnboardingReminders, buildReminderMessage } from '@/lib/onboarding-reminders';
import { sendChannelMessage } from '@/lib/discord';

// Daily onboarding "you're falling behind" nudges. Reachable without an auth
// cookie (proxy allowlists /api/cron/), secured by the CRON_SECRET bearer token
// Vercel Cron sends automatically when that env var is set. Pings the 1-1 Discord
// channel of any client who's been stuck > 2 days on their current onboarding
// step (once, then daily). Scheduled by vercel.json → crons.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  // Dev-only test-send: ?send=<channelId> posts ONE sample reminder to that single
  // channel so you can see it render in Discord. No fan-out, no dedup writes.
  const sendTo = req.nextUrl.searchParams.get('send');
  if (sendTo && process.env.NODE_ENV !== 'production') {
    const message = buildReminderMessage('Alex', 'Join Our VTC Discord', 3);
    const ok = await sendChannelMessage(sendTo, message).catch(() => false);
    return NextResponse.json({ ok, test: true, channel: sendTo, message });
  }

  // Dev-only preview: ?dry=1 returns the messages that WOULD be sent (and to whom)
  // without posting to Discord or writing any rows. Never allowed in production.
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const devDry = dry && process.env.NODE_ENV !== 'production';
  if (!authorized(req) && !devDry) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await runOnboardingReminders(new Date(), { dry });

  // In dry mode with no currently-stuck client, show a sample so the format is visible.
  if (dry && result.previews && result.previews.length === 0) {
    result.previews.push({
      name: 'Alex', step: 'Join Our VTC Discord', days: 3, hasChannel: true,
      message: buildReminderMessage('Alex', 'Join Our VTC Discord', 3),
    });
  }

  return NextResponse.json({ ok: true, dry, ...result });
}
