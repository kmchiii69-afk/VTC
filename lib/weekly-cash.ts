// Weekly organic cash-collected self-reports + the leaderboard they feed.
//
// Members report LAST week's (Mon-Sun) cash collected from ORGANIC content, with
// attributed proof, at /weekly-cash. The leaderboard (client name + cash) shows a
// collective sum for the current month and rolls over at 00:00 UTC on the 2nd of
// each month. Reuses the service-role connection from lib/kv.

import { db, getAllUsers } from '@/lib/kv';
import { logEvent } from '@/lib/journey';

const WEEK = 'weekly_cash';
const PROMPTS = 'weekly_cash_prompts';

function norm(email: string) {
  return email.toLowerCase().trim();
}

// Launch floor: the first Monday whose week counts toward the leaderboard.
// Clients start tracking organic cash from this week; the first Discord prompt
// therefore goes out the FOLLOWING Monday (asking for this week). Weeks before
// this are never prompted for or accepted. Change this to re-baseline the cycle.
export const WEEKLY_CASH_FIRST_WEEK = '2026-07-20'; // Monday

/* ─── Date helpers (all UTC) ──────────────────────────────────────────────── */

// ISO calendar date (YYYY-MM-DD) — the shape week_start is stored/compared as.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 00:00 UTC on the Monday of the week containing `d`.
export function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = (day + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

// The Monday of the week BEFORE the one containing `now` — the week the Monday
// prompt asks members to report.
export function priorWeekMonday(now: Date = new Date()): Date {
  const thisMonday = mondayOf(now);
  return new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Jul 7–13" style label for a Mon-Sun week given its Monday ISO date.
export function weekLabel(weekStartISO: string): string {
  const start = new Date(`${weekStartISO}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const sM = MONTHS[start.getUTCMonth()], eM = MONTHS[end.getUTCMonth()];
  const sD = start.getUTCDate(), eD = end.getUTCDate();
  return sM === eM ? `${sM} ${sD}–${eD}` : `${sM} ${sD} – ${eM} ${eD}`;
}

// The leaderboard resets at 00:00 UTC on the 2nd of each month. This returns the
// start of the CURRENT window: on the 1st we still show last month, from the 2nd
// onward we show this month. The window's month === the boundary's month.
function leaderboardBoundary(now: Date): Date {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return d >= 2 ? new Date(Date.UTC(y, m, 2)) : new Date(Date.UTC(y, m - 1, 2));
}

function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ─── Submissions ─────────────────────────────────────────────────────────── */

export interface WeeklyCashRow {
  id: string;
  week_start: string;
  cash_collected: number;
  proof_url: string | null;
  proof_name: string | null;
  note: string | null;
  submitted_at: string;
}

// One submission per (member, week). Re-submitting the same week overwrites it
// (and refreshes submitted_at, which the leaderboard windows by).
export async function submitWeeklyCash(input: {
  email: string;
  weekStart: string; // Monday ISO date
  cash: number;
  proofUrl?: string | null;
  proofName?: string | null;
  note?: string | null;
}): Promise<WeeklyCashRow | null> {
  const e = norm(input.email);
  const { data, error } = await db()
    .from(WEEK)
    .upsert(
      {
        user_email: e,
        week_start: input.weekStart,
        cash_collected: input.cash,
        proof_url: input.proofUrl ?? null,
        proof_name: input.proofName ?? null,
        note: input.note ?? null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'user_email,week_start' },
    )
    .select('id, week_start, cash_collected, proof_url, proof_name, note, submitted_at')
    .single();
  if (error) throw new Error(error.message);

  await logEvent({
    clientEmail: e,
    type: 'weekly_cash_submitted',
    title: `Reported organic cash · ${weekLabel(input.weekStart)}`,
    summary: `$${Number(input.cash).toLocaleString()}`,
    refTable: WEEK,
    refId: data?.id,
    ...(input.proofUrl ? { metadata: { proof_url: input.proofUrl } } : {}),
  }).catch(() => {});

  return (data as WeeklyCashRow) ?? null;
}

// A member's existing submission for a given week (for prefill), or null.
export async function getWeeklyCashForWeek(email: string, weekStartISO: string): Promise<WeeklyCashRow | null> {
  const { data } = await db()
    .from(WEEK)
    .select('id, week_start, cash_collected, proof_url, proof_name, note, submitted_at')
    .eq('user_email', norm(email))
    .eq('week_start', weekStartISO)
    .maybeSingle();
  return (data as WeeklyCashRow | null) ?? null;
}

/* ─── Leaderboard ─────────────────────────────────────────────────────────── */

export interface LeaderboardEntry {
  email: string;
  name: string;
  cash: number;
  rank: number;
}
export interface Leaderboard {
  monthLabel: string;
  total: number;
  entries: LeaderboardEntry[];
}

export async function getLeaderboard(now: Date = new Date()): Promise<Leaderboard> {
  const boundary = leaderboardBoundary(now);
  const { data } = await db()
    .from(WEEK)
    .select('user_email, cash_collected')
    .gte('submitted_at', boundary.toISOString());

  // Sum each member's organic cash reported since the reset.
  const sums = new Map<string, number>();
  for (const r of (data ?? []) as { user_email: string; cash_collected: number | string }[]) {
    const e = norm(r.user_email);
    sums.set(e, (sums.get(e) ?? 0) + Number(r.cash_collected || 0));
  }

  // Resolve display names; only active members (role 'user') appear.
  const users = await getAllUsers();
  const nameByEmail = new Map<string, string>();
  for (const u of users) {
    if ((u.role ?? 'user') === 'user' && u.active !== false) {
      nameByEmail.set(norm(u.email), u.name?.trim() || u.email);
    }
  }

  const entries: LeaderboardEntry[] = [];
  let total = 0;
  for (const [email, cash] of sums) {
    const name = nameByEmail.get(email);
    if (!name) continue; // skip admins / departed members
    total += cash;
    entries.push({ email, name, cash, rank: 0 });
  }
  entries.sort((a, b) => b.cash - a.cash || a.name.localeCompare(b.name));
  entries.forEach((e, i) => { e.rank = i + 1; });

  return { monthLabel: monthLabel(boundary), total, entries };
}

/* ─── Weekly prompt (Monday cron) ─────────────────────────────────────────── */

// Members who should get the Monday prompt: active, finished onboarding, and have
// a 1-1 Discord channel to post into.
export async function eligibleForWeeklyPrompt(): Promise<{ email: string; name: string; discord_channel_id: string }[]> {
  const users = await getAllUsers();
  return users
    .filter((u) => (u.role ?? 'user') === 'user' && u.active !== false && u.onboarded_at != null && !!u.discord_channel_id)
    .map((u) => ({ email: norm(u.email), name: u.name?.trim() || 'there', discord_channel_id: u.discord_channel_id }));
}

// Dedup: record that (member, week) was prompted. Returns true the FIRST time so
// the caller sends exactly once even if the cron re-runs. If the table is missing
// (migration not run yet), returns true so prompts still go out.
export async function markWeeklyPromptSent(email: string, weekStartISO: string): Promise<boolean> {
  const { data, error } = await db()
    .from(PROMPTS)
    .upsert({ user_email: norm(email), week_start: weekStartISO }, { onConflict: 'user_email,week_start', ignoreDuplicates: true })
    .select('week_start');
  if (error) return true;
  return (data?.length ?? 0) > 0;
}
