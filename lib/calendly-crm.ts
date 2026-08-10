import { db } from '@/lib/kv';
import { writeWithOptionalColumns } from '@/lib/db-write';

/**
 * Calendly strategy-call bookings → CRM leads.
 *
 * Before this, a booking only reached the CRM if the person had already filled in
 * a funnel application: the webhook looked them up in the application tables and
 * did nothing when it missed. Measured over 60 days that was 16 of 141 people on
 * the strategy-call calendars — everyone who booked from a DM or a shared link was
 * invisible, and the Calendly answers and UTMs were fetched and thrown away.
 *
 * Now every booking on CALENDLY_CRM_CALENDARS becomes a lead, routed by UTM:
 * anything mentioning vsl goes to the VSL pipeline, ads to the Ads pipeline, and
 * everything else to the Sales pipeline. A matching funnel application still
 * decides the pipeline when there are no UTMs to go on.
 */

/** The strategy-call calendars, by Calendly event-type name (exact, trimmed). */
export const CALENDLY_CRM_CALENDARS = [
  '1 - 1 Strategy Call w/COO',
  '1-on-1 Strategy Call',
  '1 on 1 Strategy Call',
  'Strategy Call',
  '1 - 1 Strategy Call',
];

export function isCrmBookingCalendar(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return CALENDLY_CRM_CALENDARS.some((c) => c.toLowerCase() === n);
}

export interface CalendlyTracking {
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null;
  utm_content?: string | null; utm_term?: string | null;
}

export interface CalendlyBooking {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;            // Calendly's text_reminder_number, when given
  calendar: string;                 // event-type name
  startTime?: string | null;        // ISO
  timezone?: string | null;
  questions?: { question: string; answer: string }[];
  tracking?: CalendlyTracking | null;
  eventUri?: string | null;
  /** Funnel key from a matched application, when there is one. */
  funnel?: string | null;
}

/* ─── Routing ──────────────────────────────────────────────────────────────── */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function utmValues(t: CalendlyTracking | null | undefined): string[] {
  if (!t) return [];
  return UTM_KEYS.map((k) => (t[k] ?? '')).filter((v): v is string => !!v && typeof v === 'string');
}

const BOOKING_PIPELINES = ['VSL Pipeline', 'Ads Pipeline'] as const;

/** The pipeline a booking's UTMs explicitly ask for, or null if they say nothing. */
export function utmPipeline(tracking: CalendlyTracking | null | undefined): string | null {
  const blob = utmValues(tracking).join(' ').toLowerCase();
  if (blob.includes('vsl')) return 'VSL Pipeline';
  if (blob.includes('ads')) return 'Ads Pipeline';
  return null;
}

/**
 * Which pipeline a booking belongs in. UTMs win because they say where the lead
 * actually came from; a matched funnel application is the next best signal; the
 * Sales pipeline catches everyone who booked without either.
 *
 * `currentPipeline` stops a booking from DEMOTING a lead that's already being
 * worked in the VSL or Ads pipeline: those were filed by the funnel that produced
 * them, and a booking whose UTMs happen to be empty shouldn't drag them out.
 */
export function pipelineNameForBooking(
  tracking: CalendlyTracking | null | undefined,
  funnel?: string | null,
  currentPipeline?: string | null,
): string {
  const explicit = utmPipeline(tracking);
  if (explicit) return explicit;
  if (currentPipeline && (BOOKING_PIPELINES as readonly string[]).includes(currentPipeline)) return currentPipeline;
  if (funnel === 'vsl') return 'VSL Pipeline';
  if (funnel) return 'Ads Pipeline';           // the ads segment funnels
  return 'Sales Pipeline';
}

interface PipelineRow { id: string; name: string; stages: { key: string; label: string }[] | null }
let pipelineCache: PipelineRow[] | null = null;

async function pipelines(): Promise<PipelineRow[]> {
  if (pipelineCache) return pipelineCache;
  try {
    const { data } = await db().from('crm_pipelines').select('id, name, stages');
    pipelineCache = (data ?? []) as PipelineRow[];
  } catch {
    pipelineCache = [];
  }
  return pipelineCache;
}

/** The stage a booked call belongs in — `call_booked` in Sales, `booked` in VSL/Ads. */
function bookedStage(p: PipelineRow | undefined): string {
  const stages = p?.stages ?? [];
  const hit = stages.find((s) => s.key === 'call_booked')
    ?? stages.find((s) => s.key === 'booked')
    ?? stages.find((s) => /book/i.test(s.label ?? ''));
  return hit?.key ?? 'booked';
}

export const CANCELLED_STAGE = { key: 'cancelled', label: 'Cancelled', color: 'rgba(239,68,68,0.7)' };

/**
 * The stage a cancelled booking belongs in, adding it to the pipeline if it isn't
 * there yet — a cancelled call is neither booked nor closed, and filing it under
 * Booked would show a call on the board that nobody is having.
 *
 * Note for the cadence: lib/crm-followup.ts classifies any stage matching /cancel/
 * as a "reset" stage, so a lead here restarts daily follow-ups for a week as soon
 * as there's activity on it. That's deliberate — these are the people to chase for
 * a rebook.
 */
export async function cancelledTargetFor(pipelineName: string): Promise<{ id: string; stage: string } | null> {
  const p = (await pipelines()).find((x) => x.name === pipelineName);
  if (!p) return null;

  const stages = p.stages ?? [];
  const existing = stages.find((s) => s.key === CANCELLED_STAGE.key || /^cancel/i.test(s.label ?? ''));
  if (existing) return { id: p.id, stage: existing.key };

  // Insert before the closed/terminal stages so the board reads left-to-right.
  const closedAt = stages.findIndex((s) => /closed|won|lost|ghost/i.test(`${s.key} ${s.label}`));
  const next = [...stages];
  next.splice(closedAt === -1 ? next.length : closedAt, 0, CANCELLED_STAGE);

  const { error } = await db().from('crm_pipelines').update({ stages: next }).eq('id', p.id);
  if (error) return { id: p.id, stage: bookedStage(p) };   // rather booked than lost

  p.stages = next;                                          // keep the cache honest
  return { id: p.id, stage: CANCELLED_STAGE.key };
}

/**
 * Pipeline id + its booked stage key, read from the pipeline's own stages rather
 * than hardcoded, so a rename in the UI doesn't misfile bookings.
 */
export async function bookedTargetFor(pipelineName: string): Promise<{ id: string; stage: string } | null> {
  const p = (await pipelines()).find((x) => x.name === pipelineName);
  return p ? { id: p.id, stage: bookedStage(p) } : null;
}

async function pipelineNameById(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  return (await pipelines()).find((p) => p.id === id)?.name ?? null;
}

/* ─── Answers → real CRM fields ────────────────────────────────────────────── */

/**
 * These calendars ask for a phone number, an Instagram handle and current revenue.
 * Left in the notes they're just prose; lifted into the actual columns they make
 * the lead diallable and sortable. Only ever used to fill a BLANK field.
 */
export function fieldsFromAnswers(questions: { question: string; answer: string }[] | undefined) {
  const out: { phone?: string; igHandle?: string; revenue?: string } = {};
  for (const { question, answer } of questions ?? []) {
    const q = (question ?? '').toLowerCase();
    const a = (answer ?? '').trim();
    if (!a) continue;
    if (!out.phone && /phone|mobile|whatsapp|cell/.test(q)) {
      // Keep it only if it's plausibly a number, and keep the + so the dialer can
      // use it — a number without a country code stays as typed, never guessed.
      const cleaned = a.replace(/[^\d+]/g, '');
      if (/^\+?\d{7,15}$/.test(cleaned)) out.phone = cleaned;
    }
    if (!out.igHandle && /instagram|ig handle|@/.test(q)) {
      const handle = a.replace(/^.*instagram\.com\//i, '').replace(/[^A-Za-z0-9._]/g, '').replace(/^_+|_+$/g, '');
      // Bare digits are almost always someone answering the wrong question.
      if (handle.length >= 3 && !/^\d+$/.test(handle)) out.igHandle = handle;
    }
    if (!out.revenue && /revenue|monthly income|how much.*month/.test(q)) out.revenue = a.slice(0, 60);
  }
  return out;
}

/* ─── Notes block ──────────────────────────────────────────────────────────── */

function fmtWhen(startTime?: string | null, tz?: string | null): string {
  if (!startTime) return 'time unknown';
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return startTime;
  const stamp = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return tz ? `${stamp} (invitee in ${tz})` : stamp;
}

/** The readable block that goes at the top of the lead's notes. */
export function bookingNote(b: CalendlyBooking, canceled = false): string {
  const lines = [canceled
    ? `❌ Canceled: ${b.calendar} — was ${fmtWhen(b.startTime, b.timezone)}`
    : `📅 Booked: ${b.calendar} — ${fmtWhen(b.startTime, b.timezone)}`];

  const utm = UTM_KEYS
    .map((k) => (b.tracking?.[k] ? `${k}=${b.tracking[k]}` : null))
    .filter(Boolean);
  lines.push(utm.length ? `Source: ${utm.join(' · ')}` : 'Source: no UTM tracking on this booking');

  for (const qa of b.questions ?? []) {
    const q = (qa.question ?? '').trim();
    const a = (qa.answer ?? '').trim();
    if (!q && !a) continue;
    lines.push(`Q: ${q}`, `A: ${a || '(left blank)'}`);
  }
  return lines.join('\n');
}

/** Prepend the new block, keeping whatever was already in notes below it. */
function mergeNotes(existing: string | null | undefined, block: string): string {
  const prev = (existing ?? '').trim();
  return prev ? `${block}\n\n———\n${prev}` : block;
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/* ─── Write ────────────────────────────────────────────────────────────────── */

/** Columns from supabase-crm-calendly-bookings.sql — dropped and retried if absent. */
export const BOOKING_COLUMNS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'booked_at', 'calendar', 'calendly_event_uri',
] as const;

export interface BookingResult { leadId: string | null; created: boolean; pipeline: string; skipped?: boolean }

/**
 * Create or update the lead for one booking. Matches on email (the only identifier
 * Calendly always gives us) and never blanks a field that already holds real data
 * — a booking adds to what the setter knows, it doesn't overwrite it.
 */
export async function upsertBookingLead(b: CalendlyBooking, opts: { canceled?: boolean } = {}): Promise<BookingResult> {
  const email = (b.email ?? '').trim().toLowerCase();
  if (!email) return { leadId: null, created: false, pipeline: 'Sales Pipeline', skipped: true };

  const canceled = !!opts.canceled;
  const name = (b.name ?? [b.firstName, b.lastName].filter(Boolean).join(' ')).trim() || null;

  // select('*') so the read still works before the booking columns exist.
  const { data: existing } = await db().from('crm_leads').select('*').ilike('email', email).limit(1).maybeSingle();

  const pipelineName = pipelineNameForBooking(b.tracking, b.funnel, await pipelineNameById(existing?.pipeline_id as string | null));
  const answered = fieldsFromAnswers(b.questions);

  // Calendly sends canceled+created for a RESCHEDULE. If this lead is already on a
  // booked stage for a different call time, that later booking is the truth — leave
  // the stage where it is rather than dragging a live call into Cancelled.
  const rescheduled = canceled && !!existing
    && stageIsBooked(existing.stage as string | null)
    && hasOtherCall(existing, b.startTime);

  const target = canceled && !rescheduled
    ? await cancelledTargetFor(pipelineName)
    : await bookedTargetFor(pipelineName);

  const tracked: Record<string, unknown> = {
    utm_source: b.tracking?.utm_source || null,
    utm_medium: b.tracking?.utm_medium || null,
    utm_campaign: b.tracking?.utm_campaign || null,
    utm_content: b.tracking?.utm_content || null,
    utm_term: b.tracking?.utm_term || null,
    booked_at: b.startTime || null,
    calendar: b.calendar,
    calendly_event_uri: b.eventUri || null,
  };

  const tags = new Set<string>([...((existing?.tags as string[] | null) ?? []), slug(b.calendar)]);
  if (b.tracking?.utm_source) tags.add(slug(String(b.tracking.utm_source)));
  if (canceled) tags.add('call-canceled');

  // A re-run of the backfill must not stack the same block again. The event uri is
  // the cheap check, but it only exists once the migration has run — so also look
  // for this booking's own header line, which is deterministic per event.
  const block = bookingNote(b, canceled);
  const header = block.split('\n')[0];
  const prevNotes = (existing?.notes as string | null) ?? '';
  const alreadyLogged = prevNotes.includes(header);
  const notes = alreadyLogged ? (prevNotes || null) : mergeNotes(prevNotes, block);

  const row: Record<string, unknown> = {
    ...tracked,
    ...(rescheduled ? {} : { stage: target?.stage ?? 'booked', ...(target?.id ? { pipeline_id: target.id } : {}) }),
    tags: [...tags],
    notes,
    // A live booking IS the next thing on the calendar. A cancellation deliberately
    // sets no date: the cadence treats a cancelled stage as a reset, so these would
    // otherwise all land in Due Today at once, back-dated to a call that never ran.
    next_followup_at: canceled && !rescheduled ? null : (b.startTime || null),
    updated_at: new Date().toISOString(),
  };

  const phone = b.phone || answered.phone || null;

  if (existing) {
    if (!existing.name && name) row.name = name;
    if (!existing.whatsapp && phone) row.whatsapp = phone;
    if (!existing.revenue && answered.revenue) row.revenue = answered.revenue;
    if (!existing.ig_handle && answered.igHandle && await handleIsFree(answered.igHandle, existing.id as string)) {
      row.ig_handle = answered.igHandle;
    }
    const { error } = await writeWithOptionalColumns('crm_leads', row, { id: existing.id as string, optional: BOOKING_COLUMNS });
    if (error) throw new Error(error.message);
    if (!alreadyLogged) await logBookingTouchpoint(existing.id as string, b, canceled);
    return { leadId: existing.id as string, created: false, pipeline: pipelineName };
  }

  const { data, error } = await writeWithOptionalColumns('crm_leads', {
    ...row,
    email,
    name,
    whatsapp: phone,
    revenue: answered.revenue || null,
    ...(answered.igHandle && await handleIsFree(answered.igHandle) ? { ig_handle: answered.igHandle } : {}),
    source: 'inbound',
    status: 'Qualified',
  }, { optional: BOOKING_COLUMNS });
  if (error) throw new Error(error.message);

  const id = (data?.id as string | undefined) ?? null;
  if (id && !alreadyLogged) await logBookingTouchpoint(id, b, canceled);
  return { leadId: id, created: true, pipeline: pipelineName };
}

const stageIsBooked = (stage: string | null | undefined) => /booked|reschedul/i.test(stage ?? '');

/**
 * True when the lead's recorded call is a DIFFERENT call from the one being
 * cancelled — i.e. they rescheduled. Compared to the minute, because Calendly and
 * our copy of the timestamp agree on the instant but not always the formatting.
 */
function hasOtherCall(lead: Record<string, unknown>, canceledStart: string | null | undefined): boolean {
  const known = (lead.booked_at as string | null) || (lead.next_followup_at as string | null);
  if (!known || !canceledStart) return false;
  const a = new Date(known).getTime(), b = new Date(canceledStart).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) > 60_000;
}

/**
 * `crm_leads.ig_handle` carries a UNIQUE index (it's the arbiter for the opt-in
 * upserts), so writing a handle another lead already holds fails the ENTIRE write
 * and would lose the booking. Check before claiming it.
 */
async function handleIsFree(handle: string, exceptId?: string): Promise<boolean> {
  try {
    const { data } = await db().from('crm_leads').select('id').eq('ig_handle', handle).limit(1).maybeSingle();
    return !data?.id || data.id === exceptId;
  } catch {
    return false;
  }
}

/** Timeline entry for the booking. Non-fatal: the lead matters more than the log. */
async function logBookingTouchpoint(leadId: string, b: CalendlyBooking, canceled = false): Promise<void> {
  const when = b.startTime ? ` ${canceled ? 'was' : 'for'} ${fmtWhen(b.startTime, b.timezone)}` : '';
  await db().from('crm_touchpoints').insert({
    lead_id: leadId,
    channel: 'other',
    direction: 'inbound',
    content: `${canceled ? 'Canceled' : 'Booked'} ${b.calendar}${when}`,
  }).then(() => {}, () => {});
}

/* ─── Backfill ─────────────────────────────────────────────────────────────── */

const CAL_BASE = 'https://api.calendly.com';
const calHeaders = () => ({ Authorization: `Bearer ${process.env.CALENDLY_PAT}`, 'Content-Type': 'application/json' });

interface RawEvent { uri: string; name?: string; start_time: string; status?: string }
interface RawInvitee {
  email?: string; name?: string; first_name?: string; last_name?: string;
  timezone?: string; text_reminder_number?: string;
  questions_and_answers?: { question: string; answer: string }[];
  tracking?: CalendlyTracking;
}

export interface BookingSyncResult {
  events: number; invitees: number; created: number; updated: number; canceled: number; error?: string;
}

/**
 * Pull bookings on the strategy-call calendars in a window and file them in the CRM.
 *
 * Active bookings become (or update) a lead in the Booked stage. Canceled ones only
 * annotate people who are ALREADY in the CRM — backfilling a lead whose only history
 * is a cancellation would drop it into Booked on the board, which reads as a live
 * call that isn't there. Calendly's own event_type filter is ignored by the API when
 * combined with organization, so calendars are matched by name here.
 */
export async function syncCalendlyBookingsToCrm(minStartISO: string, maxStartISO: string): Promise<BookingSyncResult> {
  const out: BookingSyncResult = { events: 0, invitees: 0, created: 0, updated: 0, canceled: 0 };
  if (!process.env.CALENDLY_PAT) return { ...out, error: 'CALENDLY_PAT not set' };

  let org: string | null = null;
  try {
    const me = await (await fetch(`${CAL_BASE}/users/me`, { headers: calHeaders() })).json();
    org = me?.resource?.current_organization ?? null;
  } catch { /* handled below */ }
  if (!org) return { ...out, error: 'Could not resolve Calendly organization' };

  const events: RawEvent[] = [];
  let url: string | null = `${CAL_BASE}/scheduled_events?organization=${encodeURIComponent(org)}&count=100`
    + `&min_start_time=${encodeURIComponent(minStartISO)}&max_start_time=${encodeURIComponent(maxStartISO)}`;
  let pages = 0;
  while (url && pages < 25) {
    pages++;
    let payload: { collection?: RawEvent[]; pagination?: { next_page?: string | null } };
    try {
      payload = await (await fetch(url, { headers: calHeaders() })).json();
    } catch { break; }
    for (const ev of payload.collection ?? []) if (isCrmBookingCalendar(ev.name)) events.push(ev);
    url = payload.pagination?.next_page ?? null;
  }
  out.events = events.length;

  // Small batches: one invitee request per event, and a 30-day window is ~100 events.
  for (let i = 0; i < events.length; i += 5) {
    const batch = events.slice(i, i + 5);
    const fetched = await Promise.all(batch.map((ev) =>
      fetch(`${ev.uri}/invitees?count=100`, { headers: calHeaders() })
        .then((r) => r.json())
        .then((j) => ((j?.collection ?? []) as RawInvitee[]))
        .catch(() => [] as RawInvitee[])
    ));

    for (let k = 0; k < batch.length; k++) {
      const ev = batch[k];
      for (const inv of fetched[k]) {
        if (!inv.email) continue;
        out.invitees++;
        const canceled = !!ev.status && ev.status !== 'active';
        try {
          const res = await upsertBookingLead({
            email: inv.email,
            name: inv.name ?? null,
            firstName: inv.first_name ?? null,
            lastName: inv.last_name ?? null,
            phone: inv.text_reminder_number ?? null,
            calendar: ev.name ?? '',
            startTime: ev.start_time,
            timezone: inv.timezone ?? null,
            questions: inv.questions_and_answers ?? [],
            tracking: inv.tracking ?? null,
            eventUri: ev.uri,
          }, { canceled });
          // created/updated count leads touched; canceled is an overlay on both, so
          // a cancellation that produced a brand-new lead shows up in each.
          if (res.created) out.created++;
          else if (!res.skipped) out.updated++;
          if (canceled) out.canceled++;
        } catch { /* one bad invitee must not stop the sync */ }
      }
    }
  }

  return out;
}
