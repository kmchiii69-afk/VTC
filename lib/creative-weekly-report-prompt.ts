// The Discord ping that asks a Creative Specialist to fill a weekly report.
//
// Both reports stay open all week — this is what makes them land on the day:
// Wednesday asks for the mid-week plan, Friday for the week's results. Shared by
// the two cron routes so the eligibility, dedup and message shape stay identical.

import { sendChannelMessage } from '@/lib/discord';
import { eligibleForReportPrompt, markReportPromptSent } from '@/lib/creative-weekly-report-store';
import { currentReportWeek, weekLabel, type ReportKind } from '@/lib/creative-weekly-report';

const APP_URL = (process.env.APP_URL || 'https://gohconsulting.app').replace(/\/$/, '');

export function reportLink(kind: ReportKind, week: string): string {
  return `${APP_URL}/weekly-report?kind=${kind}&week=${week}`;
}

export function buildPromptMessage(kind: ReportKind, name: string, label: string, link: string): string {
  if (kind === 'wednesday') {
    return (
      `**Mid-week check, ${name}.**\n\n` +
      `Your to-dos for this week (**${label}**) are listed here — add how you're going to land each one, ` +
      `plus the steps you'll take:\n${link}\n\n` +
      `Five minutes now saves the scramble on Friday.`
    );
  }
  return (
    `**Weekly report time, ${name}.**\n\n` +
    `Drop your numbers for this week (**${label}**) here:\n${link}\n\n` +
    `Sales, content and your to-dos — about 15 minutes. ` +
    `Anything you didn't get to just needs a line on why.`
  );
}

export interface PromptRunResult {
  ok: true;
  kind: ReportKind;
  week: string;
  eligible: number;
  sent: number;
  skipped: number;   // already prompted for this (member, week, kind)
  failed: number;
}

// Fan the ping out to every eligible member, deduped per (member, week, kind).
export async function runReportPrompt(kind: ReportKind): Promise<PromptRunResult> {
  const week = currentReportWeek();
  const label = weekLabel(week);
  const link = reportLink(kind, week);
  const members = await eligibleForReportPrompt();

  let sent = 0, skipped = 0, failed = 0;
  for (const m of members) {
    const firstTime = await markReportPromptSent(m.email, week, kind);
    if (!firstTime) { skipped++; continue; }

    const ok = await sendChannelMessage(m.discord_channel_id, buildPromptMessage(kind, m.name, label, link))
      .catch(() => false);
    if (ok) sent++; else failed++;
  }

  return { ok: true, kind, week, eligible: members.length, sent, skipped, failed };
}

// Dev-only preview: the rendered message + who would get it, sending nothing.
export async function previewReportPrompt(kind: ReportKind) {
  const week = currentReportWeek();
  const members = await eligibleForReportPrompt();
  return {
    ok: true as const,
    dry: true as const,
    kind,
    week,
    label: weekLabel(week),
    eligible: members.length,
    recipients: members.map((m) => m.name),
    message: buildPromptMessage(kind, members[0]?.name || 'Alex', weekLabel(week), reportLink(kind, week)),
  };
}
