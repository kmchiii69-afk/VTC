import { NextRequest, NextResponse } from 'next/server';
import { eligibleForWeeklyPrompt, markWeeklyPromptSent, priorWeekMonday, isoDate, weekLabel, WEEKLY_CASH_FIRST_WEEK } from '@/lib/weekly-cash';
import { sendChannelMessage } from '@/lib/discord';

// Monday-AM leaderboard prompt. Reachable without an auth cookie (proxy allowlists
// /api/cron/), secured by the CRON_SECRET bearer Vercel Cron sends automatically.
// Posts to each active member's 1-1 Discord channel a link to report LAST week's
// organic cash collected. Deduped per (member, week) so a re-run never double-pings.
// Scheduled by vercel.json → crons (Mondays).
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const APP_URL = (process.env.APP_URL || 'https://gohconsulting.app').replace(/\/$/, '');

// The exact text posted to a member's 1-1 channel.
function buildPromptMessage(name: string, label: string, link: string): string {
  return (
    `**Leaderboard time, ${name}!**\n\n` +
    `Log your cash collected from organic content for last week (**${label}**) here:\n${link}\n\n` +
    `_Only C.C from organic content is counted towards the leaderboard so show attributed proof._`
  );
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const week = isoDate(priorWeekMonday());
  const label = weekLabel(week);
  const link = `${APP_URL}/weekly-cash?week=${week}`;

  // Dev-only test-send: ?send=<channelId> posts ONE sample prompt to that single
  // channel so you can see it render in Discord. No fan-out, no dedup writes.
  const sendTo = req.nextUrl.searchParams.get('send');
  if (sendTo && process.env.NODE_ENV !== 'production') {
    const message = buildPromptMessage('Alex', label, link);
    const ok = await sendChannelMessage(sendTo, message).catch(() => false);
    return NextResponse.json({ ok, test: true, channel: sendTo, message });
  }

  // Dev-only preview: ?dry=1 returns the rendered message + recipients without
  // posting to Discord or writing dedup rows (and ignores the launch-week guard
  // so the format is visible before the cycle starts). Never allowed in production.
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const devDry = dry && process.env.NODE_ENV !== 'production';
  if (!authorized(req) && !devDry) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const members = await eligibleForWeeklyPrompt();

  if (dry) {
    const sampleName = members[0]?.name || 'Alex';
    return NextResponse.json({
      ok: true, dry: true, week, label,
      eligible: members.length,
      recipients: members.map((m) => m.name),
      message: buildPromptMessage(sampleName, label, link),
    });
  }

  // Don't prompt for any week before the launch week (the cycle starts then).
  if (week < WEEKLY_CASH_FIRST_WEEK) {
    return NextResponse.json({ ok: true, skipped: 'before launch week', week, firstWeek: WEEKLY_CASH_FIRST_WEEK });
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const m of members) {
    const firstTime = await markWeeklyPromptSent(m.email, week);
    if (!firstTime) { skipped++; continue; } // already prompted this week

    const ok = await sendChannelMessage(m.discord_channel_id, buildPromptMessage(m.name, label, link)).catch(() => false);
    if (ok) { sent++; } else { failed++; }
  }

  return NextResponse.json({ ok: true, week, eligible: members.length, sent, skipped, failed });
}
