// Data access for the Creative Specialist weekly report.
//
// Schema, week maths and the auto-calculated fields all live in
// lib/creative-weekly-report.ts (pure, client-safe). This module is the
// server-only half: reads, writes, the live to-do read behind the to-do sections,
// and the Wednesday/Friday prompt dedup. Reuses the service-role connection from
// lib/kv.

import { db, getAllUsers, type User } from '@/lib/kv';
import { logEvent } from '@/lib/journey';
import { TAG_CREATIVE_SPECIALIST } from '@/lib/roadmap-variant';
import {
  pickKnown, commitmentStats, derive, weekEnd, weekLabel, KIND_META, PER_TODO_KEYS,
  type ReportAnswers, type ReportKind, type WeekActionItem, type WeekSignal,
} from '@/lib/creative-weekly-report';

const TABLE = 'creative_weekly_reports';
const PROMPTS = 'creative_weekly_report_prompts';
const TODOS = 'client_todos';

const norm = (e: string) => e.toLowerCase().trim();

// Thrown when creative_weekly_reports doesn't exist yet — the migration in
// supabase-creative-weekly-reports.sql is run by hand. Reads already fail soft
// (empty result); this lets writes say something useful instead of a bare 500.
export class MigrationPendingError extends Error {
  constructor() {
    super('The weekly report table isn’t set up yet — run supabase-creative-weekly-reports.sql, then try again.');
    this.name = 'MigrationPendingError';
  }
}

function isMissingTable(message: string): boolean {
  return /relation .* does not exist|could not find the table|schema cache/i.test(message);
}

export interface WeeklyReportRow {
  id: string;
  user_email: string;
  week_start: string;
  kind: ReportKind;
  answers: ReportAnswers;
  submitted_at: string | null;
  sent_at: string | null;
  updated_at: string;
}

// Whether a member is on the weekly report at all. Reads the RAW stored feature
// list, NOT resolveFeatures() — that grants admins every feature and would put
// every admin on the report (same reasoning as lib/roadmap-variant.ts).
export function onWeeklyReport(features?: string[] | null): boolean {
  return !!features?.includes(TAG_CREATIVE_SPECIALIST);
}

export async function getReport(email: string, weekStart: string, kind: ReportKind): Promise<WeeklyReportRow | null> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_email', norm(email))
    .eq('week_start', weekStart)
    .eq('kind', kind)
    .maybeSingle();
  return (data as WeeklyReportRow | null) ?? null;
}

// A member's reports of one kind, newest week first.
export async function listReports(email: string, kind: ReportKind, limit = 26): Promise<WeeklyReportRow[]> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_email', norm(email))
    .eq('kind', kind)
    .order('week_start', { ascending: false })
    .limit(limit);
  return (data ?? []) as WeeklyReportRow[];
}

// Both kinds for one week, as a { wednesday, friday } pair.
export async function getWeekPair(
  email: string,
  weekStart: string,
): Promise<Record<ReportKind, WeeklyReportRow | null>> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_email', norm(email))
    .eq('week_start', weekStart);
  const rows = (data ?? []) as WeeklyReportRow[];
  return {
    wednesday: rows.find((r) => r.kind === 'wednesday') ?? null,
    friday: rows.find((r) => r.kind === 'friday') ?? null,
  };
}

export async function getReportById(id: string): Promise<WeeklyReportRow | null> {
  const { data } = await db().from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as WeeklyReportRow | null) ?? null;
}

/* ─── The Commitment section: live to-do data ─────────────────────────────── */

// The member's to-dos ASSIGNED inside the report week (Mon-Sun, by assigned_date).
// The Commitment section counts these and asks why any unticked ones slipped, so
// it always reflects the list as it stands rather than a snapshot.
export async function weekActionItems(email: string, weekStart: string): Promise<WeekActionItem[]> {
  const { data } = await db()
    .from(TODOS)
    .select('id, text, done, assigned_date, completed_at')
    .eq('client_email', norm(email))
    .gte('assigned_date', weekStart)
    .lte('assigned_date', weekEnd(weekStart))
    .order('assigned_date', { ascending: true });

  return ((data ?? []) as { id: string; text: string; done: boolean; assigned_date: string; completed_at: string | null }[])
    .map((t) => ({
      id: t.id,
      text: t.text,
      done: !!t.done,
      assignedDate: t.assigned_date,
      completedAt: t.completed_at,
    }));
}

/* ─── Reads that need the week's to-dos ───────────────────────────────────── */

// The completion history the escalation trigger reads. Commitment completion is
// derived from the to-do list per week, not from anything stored on the report,
// and it's the Friday report that reports on it.
export async function weekSignals(email: string, limit = 8): Promise<WeekSignal[]> {
  const reports = (await listReports(email, 'friday', limit)).filter((r) => !!r.submitted_at);
  return Promise.all(
    reports.map(async (r) => ({
      weekStart: r.week_start,
      completionRate: commitmentStats(await weekActionItems(email, r.week_start)).completionRate,
    })),
  );
}

/* ─── Writes ──────────────────────────────────────────────────────────────── */

// Merge a patch into a week's answers, keeping only known field ids. Creates the
// row on first write. Returns the saved row.
export async function saveAnswers(
  email: string,
  weekStart: string,
  kind: ReportKind,
  patch: ReportAnswers,
): Promise<WeeklyReportRow | null> {
  const e = norm(email);
  const existing = await getReport(e, weekStart, kind);
  const clean = pickKnown(patch, kind);

  // The per-to-do maps are keyed by to-do id — merge them rather than replacing,
  // so saving one box never drops the others.
  const merged: ReportAnswers = { ...(existing?.answers ?? {}), ...clean };
  for (const key of PER_TODO_KEYS) {
    if (clean[key] && typeof clean[key] === 'object') {
      merged[key] = {
        ...(existing?.answers?.[key] as Record<string, unknown> ?? {}),
        ...(clean[key] as Record<string, unknown>),
      };
    }
  }

  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      { user_email: e, week_start: weekStart, kind, answers: merged, updated_at: new Date().toISOString() },
      { onConflict: 'user_email,week_start,kind' },
    )
    .select('*')
    .single();
  if (error) throw isMissingTable(error.message) ? new MigrationPendingError() : new Error(error.message);
  return (data as WeeklyReportRow) ?? null;
}

// Stamp the submission. Idempotent — re-submitting an already submitted report
// updates the answers but keeps the original submitted_at.
export async function markSubmitted(
  email: string,
  weekStart: string,
  kind: ReportKind,
): Promise<WeeklyReportRow | null> {
  const e = norm(email);
  const existing = await getReport(e, weekStart, kind);
  if (!existing) return null;
  if (existing.submitted_at) return existing;

  const { data } = await db()
    .from(TABLE)
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('*')
    .single();

  const saved = (data as WeeklyReportRow) ?? existing;
  const items = await weekActionItems(e, weekStart);
  const d = derive(saved.answers ?? {}, saved.week_start, { actionItems: items });

  // Wednesday is a plan, Friday is results — summarise each on its own terms.
  const summary = kind === 'wednesday'
    ? `${items.length} to-do${items.length === 1 ? '' : 's'} planned for the week`
    : [
        `${d.closeRate ?? 0}% close rate`,
        d.totalCash ? `$${d.totalCash.toLocaleString()} cash` : 'no cash',
        `${d.igViews7d.toLocaleString()} IG views`,
        d.commitment.completionRate !== null ? `${d.commitment.completionRate}% of to-dos` : 'no to-dos assigned',
      ].join(' · ');

  await logEvent({
    clientEmail: e,
    type: 'weekly_report_submitted',
    title: `${KIND_META[kind].label} · ${weekLabel(weekStart)}`,
    summary,
    refTable: TABLE,
    refId: saved.id,
  }).catch(() => {});

  return saved;
}

// Mark the report as sent to the founder (or un-send it).
export async function setSent(id: string, sent: boolean): Promise<WeeklyReportRow | null> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ sent_at: sent ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw isMissingTable(error.message) ? new MigrationPendingError() : new Error(error.message);
  return (data as WeeklyReportRow | null) ?? null;
}

/* ─── Wednesday / Friday prompts (cron) ───────────────────────────────────── */

export interface PromptTarget { email: string; name: string; discord_channel_id: string }

// Creative Specialists who should get a report ping: tagged, active, onboarded,
// and with a 1-1 Discord channel to post into.
export async function eligibleForReportPrompt(): Promise<PromptTarget[]> {
  const users: User[] = await getAllUsers();
  return users
    .filter((u) => (u.role ?? 'user') === 'user' && u.active !== false && u.onboarded_at != null)
    .filter((u) => onWeeklyReport(u.features) && !!u.discord_channel_id)
    .map((u) => ({ email: norm(u.email), name: u.name?.trim() || 'there', discord_channel_id: u.discord_channel_id }));
}

// Dedup: record that (member, week, kind) was prompted. Returns true the FIRST
// time so the caller sends exactly once even if the cron re-runs. If the table is
// missing (migration not run yet), returns true so prompts still go out.
export async function markReportPromptSent(
  email: string,
  weekStart: string,
  kind: ReportKind,
): Promise<boolean> {
  const { data, error } = await db()
    .from(PROMPTS)
    .upsert(
      { user_email: norm(email), week_start: weekStart, kind },
      { onConflict: 'user_email,week_start,kind', ignoreDuplicates: true },
    )
    .select('week_start');
  if (error) return true;
  return (data?.length ?? 0) > 0;
}
