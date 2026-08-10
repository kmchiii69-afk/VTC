/**
 * Setter follow-up cadence — the one place that decides "who gets contacted today".
 *
 * The setter never calculates dates. They log what happened (a touch, or a stage
 * change) and everything below is derived:
 *
 *   Lead Age        = today − created_at
 *   Last Activity   = stamped on every stage change / logged touchpoint
 *   Reset Date      = stamped when a lead goes No Show or Cancelled
 *   Follow-Up?      = false for Call Booked / Rescheduled / Closed / DQ (and the
 *                     other terminal stages: Closed Lost, Ghosted)
 *   Next Follow-Up  = Last Activity + cadence, where cadence is
 *                       reset window (≤7 days since Reset Date) → every 1 day
 *                       Lead Age 0-7                            → every 1 day
 *                       Lead Age 8-21                           → every 3 days
 *                       Lead Age 22+                            → every 7 days
 *
 * Pure module (no db import) so both the API routes and the admin UI can share it.
 */

/* ─── Stage semantics ──────────────────────────────────────────────────────
 * Stages are per-pipeline and user-renameable, so classify by matching the key
 * AND the label — a pipeline with a stage called "Didn't Show" still behaves
 * like a no-show.
 */
export type StageKind =
  | 'work'      // actively followed up (New, Contacted, Nurturing, App Sent, Call Held, Follow-Up Call)
  | 'booked'    // on the calendar — follow-up auto-clears (Call Booked, Rescheduled)
  | 'reset'     // showed nothing / fell through — restart daily for 7 days (No Show, Cancelled)
  | 'terminal'; // done either way (Closed Won, Closed Lost, DQ, Ghosted)

const TERMINAL_RE = /closed.?won|closed.?lost|^closed$|^won$|^lost$|^dq$|\bdq\b|disqualif|ghost/i;
const RESET_RE    = /no.?show|didn.?t.?show|did.?not.?show|cancel/i;
const BOOKED_RE   = /booked|reschedul/i;
const DQ_RE       = /^dq$|\bdq\b|disqualif/i;

export function stageKind(stage: string | null | undefined, label?: string | null): StageKind {
  const s = `${stage ?? ''} ${label ?? ''}`.toLowerCase();
  if (TERMINAL_RE.test(s)) return 'terminal';
  if (RESET_RE.test(s)) return 'reset';
  if (BOOKED_RE.test(s)) return 'booked';
  return 'work';
}

/** True for the "showed up but wasn't actually qualified" stage. */
export function isDqStage(stage: string | null | undefined, label?: string | null): boolean {
  return DQ_RE.test(`${stage ?? ''} ${label ?? ''}`);
}

/* ─── Day math ─────────────────────────────────────────────────────────────
 * Everything is day-granular. Day indexes are UTC-based so the API (UTC) and the
 * browser agree, and follow-ups land at 09:00 UTC — an hour that reads as the
 * same calendar date anywhere from UTC-9 to UTC+14.
 */
const DAY_MS = 86_400_000;
const NINE_AM_MS = 9 * 3_600_000;

function dayIndex(t: string | number | Date): number {
  return Math.floor(new Date(t).getTime() / DAY_MS);
}

/** Whole days from `a` to `b` (negative if b is before a). */
export function daysBetween(a: string | number | Date, b: string | number | Date): number {
  return dayIndex(b) - dayIndex(a);
}

function isoAtNine(day: number): string {
  return new Date(day * DAY_MS + NINE_AM_MS).toISOString();
}

/** A follow-up is "due" for the whole calendar day it lands on. */
export function isDue(nextFollowupAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!nextFollowupAt) return false;
  return dayIndex(nextFollowupAt) <= dayIndex(now);
}

/* ─── Cadence ──────────────────────────────────────────────────────────── */
export const RESET_WINDOW_DAYS = 7;

export type CadenceBucket = 'reset' | 'daily' | '3day' | '7day';

export const CADENCE_LABELS: Record<CadenceBucket, string> = {
  reset:  'Daily · post no-show reset',
  daily:  'Daily · days 0-7',
  '3day': 'Every 3 days · days 8-21',
  '7day': 'Every 7 days · day 22+',
};

export interface CadenceLead {
  stage: string;
  created_at: string;
  updated_at?: string | null;
  /** Null until `supabase-crm-followup-cadence.sql` is run — falls back to updated_at. */
  last_activity_at?: string | null;
  reset_at?: string | null;
  next_followup_at?: string | null;
}

export interface Cadence {
  kind: StageKind;
  /** The "Follow-Up?" formula: is this lead in the daily working set at all? */
  followUp: boolean;
  /** Next Follow-Up Date (ISO), or null when follow-up is off. */
  next: string | null;
  everyDays: number | null;
  bucket: CadenceBucket | null;
  ageDays: number;
  lastActivityAt: string;
  resetActive: boolean;
  resetDaysLeft: number;
}

/** Last Activity, with a fallback for rows written before the cadence columns existed. */
export function lastActivityOf(lead: CadenceLead): string {
  return lead.last_activity_at || lead.updated_at || lead.created_at;
}

export function cadenceFor(lead: CadenceLead, stageLabel?: string | null, now: Date = new Date()): Cadence {
  const kind = stageKind(lead.stage, stageLabel);
  const lastActivityAt = lastActivityOf(lead);
  const ageDays = Math.max(0, daysBetween(lead.created_at, now));

  const resetDaysSince = lead.reset_at ? daysBetween(lead.reset_at, now) : null;
  const resetActive = resetDaysSince !== null && resetDaysSince >= 0 && resetDaysSince <= RESET_WINDOW_DAYS;
  const resetDaysLeft = resetActive ? RESET_WINDOW_DAYS - (resetDaysSince as number) : 0;

  const followUp = kind === 'work' || kind === 'reset';
  if (!followUp) {
    return { kind, followUp, next: null, everyDays: null, bucket: null, ageDays, lastActivityAt, resetActive, resetDaysLeft };
  }

  // The reset window overrides the age bucket — a no-show goes back to daily for
  // a week no matter how old the lead is.
  const bucket: CadenceBucket = resetActive ? 'reset' : ageDays <= 7 ? 'daily' : ageDays <= 21 ? '3day' : '7day';
  const everyDays = bucket === '3day' ? 3 : bucket === '7day' ? 7 : 1;

  return {
    kind, followUp, everyDays, bucket, ageDays, lastActivityAt, resetActive, resetDaysLeft,
    next: isoAtNine(dayIndex(lastActivityAt) + everyDays),
  };
}

/* ─── Write-side patch builder ─────────────────────────────────────────── */

/** Columns added by `supabase-crm-followup-cadence.sql`; dropped on retry if absent. */
export const CADENCE_COLUMNS = ['last_activity_at', 'reset_at'] as const;

export interface CadenceOpts {
  /** The stage being written (omit when the stage isn't changing). */
  stage?: string | null;
  /** Label of the stage being written, for classification. */
  stageLabel?: string | null;
  /** The setter logged a touch (touchpoint, dial, "Log Follow-Up"). */
  activity?: boolean;
  now?: Date;
}

/**
 * Build the cadence half of a lead write: Last Activity / Reset Date / Next
 * Follow-Up Date. Callers merge this into their own updates; an explicit
 * next_followup_at from the caller should be applied *after* this (manual wins).
 */
export function cadencePatch(lead: CadenceLead, opts: CadenceOpts = {}): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();

  const nextStage = opts.stage ?? lead.stage;
  const stageChanged = !!opts.stage && opts.stage !== lead.stage;
  const touched = !!opts.activity || stageChanged;
  const kind = stageKind(nextStage, opts.stageLabel);

  const patch: Record<string, unknown> = {};
  if (touched) patch.last_activity_at = nowIso;
  // Entering No Show / Cancelled restarts the daily clock.
  if (stageChanged && kind === 'reset') patch.reset_at = nowIso;

  const projected: CadenceLead = {
    ...lead,
    stage: nextStage,
    last_activity_at: (patch.last_activity_at as string) ?? lastActivityOf(lead),
    reset_at: (patch.reset_at as string) ?? lead.reset_at ?? null,
  };
  patch.next_followup_at = cadenceFor(projected, opts.stageLabel, now).next;
  return patch;
}

/** Cadence fields for a brand-new lead: activity = now, so the first touch is tomorrow. */
export function newLeadCadence(stage: string, stageLabel?: string | null, now: Date = new Date()): Record<string, unknown> {
  const nowIso = now.toISOString();
  return cadencePatch(
    { stage: '__new__', created_at: nowIso, last_activity_at: nowIso, reset_at: null },
    { stage, stageLabel, now },
  );
}

/* ─── Stage lookup for the setter's one-click outcome buttons ──────────── */
export type SetterAction =
  | 'contacted' | 'booked' | 'rescheduled' | 'no_show' | 'cancelled'
  | 'closed' | 'follow_up_call' | 'dq';

const ACTION_RE: Record<SetterAction, RegExp> = {
  contacted:      /contacted/i,
  booked:         /booked/i,
  rescheduled:    /reschedul/i,
  no_show:        /no.?show|didn.?t.?show/i,
  cancelled:      /cancel/i,
  closed:         /closed.?won|^closed$|^won$/i,
  follow_up_call: /follow.?up/i,
  dq:             /^dq$|\bdq\b|disqualif/i,
};

export const ACTION_LABELS: Record<SetterAction, string> = {
  contacted: 'Contacted', booked: 'Booked', rescheduled: 'Rescheduled',
  no_show: 'No Show', cancelled: 'Cancelled', closed: 'Closed',
  follow_up_call: 'Follow-Up Call', dq: 'DQ',
};

/** Resolve an action to a real stage key in this lead's pipeline (null if absent). */
export function findStageKey(
  stages: Array<{ key: string; label: string }>,
  action: SetterAction,
): string | null {
  const re = ACTION_RE[action];
  const hit = stages.find((s) => re.test(s.key) || re.test(s.label));
  return hit ? hit.key : null;
}
