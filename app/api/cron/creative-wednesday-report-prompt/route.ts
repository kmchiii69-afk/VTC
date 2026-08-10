import { NextRequest, NextResponse } from 'next/server';
import { runReportPrompt, previewReportPrompt, buildPromptMessage, reportLink } from '@/lib/creative-weekly-report-prompt';
import { currentReportWeek, weekLabel } from '@/lib/creative-weekly-report';
import { sendChannelMessage } from '@/lib/discord';

// Wednesday report prompt for Creative Specialists — the mid-week plan: how
// they'll land this week's to-dos. Its Friday twin (the week's numbers) lives at
// /api/cron/creative-weekly-report-prompt.
//
// Reachable without an auth cookie (the proxy allowlists /api/cron/), secured by
// the CRON_SECRET bearer Vercel Cron sends automatically. Scheduled by
// vercel.json → crons. Deduped per (member, week, kind) so a re-run never
// double-pings.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const KIND = 'wednesday' as const;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  // Dev-only test-send: ?send=<channelId> posts ONE sample to that channel.
  const sendTo = req.nextUrl.searchParams.get('send');
  if (sendTo && process.env.NODE_ENV !== 'production') {
    const week = currentReportWeek();
    const message = buildPromptMessage(KIND, 'Alex', weekLabel(week), reportLink(KIND, week));
    const ok = await sendChannelMessage(sendTo, message).catch(() => false);
    return NextResponse.json({ ok, test: true, channel: sendTo, message });
  }

  // Dev-only preview: ?dry=1 renders the message + recipients, sends nothing.
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const devDry = dry && process.env.NODE_ENV !== 'production';
  if (!authorized(req) && !devDry) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (dry) return NextResponse.json(await previewReportPrompt(KIND));
  return NextResponse.json(await runReportPrompt(KIND));
}
