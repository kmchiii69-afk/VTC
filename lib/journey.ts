import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Shares the Supabase service-role connection pattern used by lib/kv.ts.
let _client: SupabaseClient | null = null;
function db() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  }
  return _client;
}

const TABLE = 'client_events';

// Every interaction worth tracking in a client's journey. Keep this list in
// sync with supabase-journey.sql's header comment.
export type EventType =
  | 'login'
  | 'call'
  | 'checkin'
  | 'sales_call'
  | 'action_item_created'
  | 'action_item_completed'
  | 'roadmap_completed'
  | 'roadmap_uncompleted'
  | 'admin_note'
  | 'referral'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_reminder'
  | 'weekly_cash_submitted'
  | 'weekly_report_submitted'
  | 'contract_selected'
  | 'contract_signed'
  | 'document_uploaded'
  | 'form_submitted'
  | 'sop_view'
  | 'module_view'
  | 'recording_view'
  | 'guide_view';

export interface ClientEvent {
  id: string;
  client_email: string;
  event_type: EventType;
  title: string | null;
  summary: string | null;
  ref_table: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

export interface LogEventInput {
  clientEmail: string;
  type: EventType;
  title?: string | null;
  summary?: string | null;
  refTable?: string | null;
  refId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string | Date | null;
}

function norm(email: string) {
  return email.toLowerCase().trim();
}

function toIso(v: string | Date | null | undefined): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString();
  return v;
}

// Log a journey event. Deliberately swallows errors and never throws — journey
// logging is a side effect and must never break the host write (a check-in
// ingest, a roadmap toggle, etc.). Failures are logged to the server console.
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const row = {
      client_email: norm(input.clientEmail),
      event_type: input.type,
      title: input.title ?? null,
      summary: input.summary ?? null,
      ref_table: input.refTable ?? null,
      ref_id: input.refId != null ? String(input.refId) : null,
      metadata: input.metadata ?? null,
      occurred_at: toIso(input.occurredAt) ?? new Date().toISOString(),
    };
    const { error } = await db().from(TABLE).insert(row);
    if (error) console.error('[journey] logEvent failed:', error.message);
  } catch (e) {
    console.error('[journey] logEvent threw:', e);
  }
}

// True if a timeline event already points at this source row. Used to make
// attribution idempotent (don't log the same sales call twice). Non-throwing:
// on error returns false so the caller logs (a duplicate beats a lost event).
export async function eventExistsForRef(refTable: string, refId: string): Promise<boolean> {
  try {
    const { count } = await db()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('ref_table', refTable)
      .eq('ref_id', String(refId));
    return (count ?? 0) > 0;
  } catch (e) {
    console.error('[journey] eventExistsForRef threw:', e);
    return false;
  }
}

// Remove timeline events that point at a specific record (e.g. when a check-in is
// deleted, drop its 'checkin' event). Non-throwing.
export async function deleteEventsByRef(refTable: string, refId: string): Promise<void> {
  try {
    await db().from(TABLE).delete().eq('ref_table', refTable).eq('ref_id', String(refId));
  } catch (e) {
    console.error('[journey] deleteEventsByRef threw:', e);
  }
}

// Log a content-view event, but only if the same (client, type, ref) view
// hasn't already been logged within `windowHours`. Keeps a single sitting (or
// page re-render / refresh) from spamming the timeline, while still recording
// genuine repeat engagement on a later day. Also non-throwing.
export async function logViewOnce(
  input: LogEventInput,
  windowHours = 6
): Promise<void> {
  try {
    const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
    let q = db()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('client_email', norm(input.clientEmail))
      .eq('event_type', input.type)
      .gte('occurred_at', since);
    q = input.refId != null ? q.eq('ref_id', String(input.refId)) : q.is('ref_id', null);
    const { count } = await q;
    if ((count ?? 0) > 0) return; // already logged recently — skip
  } catch (e) {
    console.error('[journey] logViewOnce dedup check threw:', e);
    // fall through and log anyway — a duplicate is better than a lost event
  }
  await logEvent(input);
}

export interface GetEventsOpts {
  types?: EventType[];
  limit?: number;
  since?: string | Date;
}

// A client's timeline, newest first.
export async function getClientEvents(
  clientEmail: string,
  opts: GetEventsOpts = {}
): Promise<ClientEvent[]> {
  let q = db()
    .from(TABLE)
    .select('*')
    .eq('client_email', norm(clientEmail))
    .order('occurred_at', { ascending: false });
  if (opts.types?.length) q = q.in('event_type', opts.types);
  if (opts.since) q = q.gte('occurred_at', toIso(opts.since)!);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return (data ?? []) as ClientEvent[];
}

export interface JourneySummary {
  total: number;
  byType: Record<string, number>;
  lastEventAt: string | null;
  // distinct content the client has engaged with, by ref_id
  distinctContent: { sops: number; modules: number; recordings: number; guides: number };
}

// Lightweight per-client rollup for the CSM dashboard list/overview. Computed on
// read from the event log rather than denormalized.
export async function getJourneySummary(clientEmail: string): Promise<JourneySummary> {
  const { data } = await db()
    .from(TABLE)
    .select('event_type, ref_id, occurred_at')
    .eq('client_email', norm(clientEmail))
    .order('occurred_at', { ascending: false });
  const rows = (data ?? []) as Pick<ClientEvent, 'event_type' | 'ref_id' | 'occurred_at'>[];

  const byType: Record<string, number> = {};
  const distinct: Record<string, Set<string>> = {
    sop_view: new Set(),
    module_view: new Set(),
    recording_view: new Set(),
    guide_view: new Set(),
  };
  for (const r of rows) {
    byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
    if (distinct[r.event_type] && r.ref_id) distinct[r.event_type].add(r.ref_id);
  }
  return {
    total: rows.length,
    byType,
    lastEventAt: rows[0]?.occurred_at ?? null,
    distinctContent: {
      sops: distinct.sop_view.size,
      modules: distinct.module_view.size,
      recordings: distinct.recording_view.size,
      guides: distinct.guide_view.size,
    },
  };
}
