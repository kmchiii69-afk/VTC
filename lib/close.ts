// Close (close.com) sales-CRM client — a one-way mirror of this app's CRM.
//
// Every crm_leads row becomes a Close lead: name, a contact carrying the email +
// phone so Close can dial, a description digest of the CRM context, a mapped lead
// status, custom fields for the CRM stage/source/tags, and its notes as a note on
// the timeline. Each CRM pipeline is mirrored as a Close *opportunity* pipeline
// with the same stages, and every lead sitting in a CRM pipeline gets an
// opportunity parked on the matching Close stage — so the Close pipeline board
// looks like the CRM board.
//
// We keep the ids Close returns on our row (crm_leads.close_lead_id /
// close_opportunity_id) so re-syncing updates instead of duplicating, and pull call
// activity back so it shows on the contact timeline. This app never places calls
// through Close: dialling happens in Aloware (lib/aloware.ts) or in Close's own
// softphone, which we deep-link to.
//
// Calls and texts made in Aloware are pushed here as External activities so Close
// stays a true mirror. Those carry closeExternalMarker() in their note/text, which
// is what stops importCloseCalls reading our own writes back out as new CRM
// touchpoints — see isCloseExternalEcho below.
//
// Env-gated + best-effort, same shape as lib/kit.ts / lib/discord.ts: with no
// CLOSE_API_KEY every call is a no-op ({ skipped: true }) and nothing throws, so
// a missing/misconfigured Close account can never break the CRM.
//
//   CLOSE_API_KEY — a Close API key (Close → Settings → Developer → API Keys)
//
// Close auth is HTTP Basic: the API key is the username, password is blank.

const BASE = 'https://api.close.com/api/v1';

function authHeader(): string | null {
  const key = (process.env.CLOSE_API_KEY || '').trim();
  if (!key) return null;
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

/** Whether Close is wired up at all — lets callers skip work before building payloads. */
export function closeConfigured(): boolean {
  return !!authHeader();
}

/** The lead's page inside the Close web app — where a coach clicks to dial. */
export function closeLeadUrl(closeLeadId: string): string {
  return `https://app.close.com/lead/${closeLeadId}/`;
}

export type CloseResult = {
  ok: boolean; skipped?: boolean; id?: string; url?: string; created?: boolean; status?: number; error?: string;
  /** Close rejected the CRM's email/phone as invalid; the lead synced without it. */
  droppedEmail?: boolean;
  droppedPhone?: boolean;
};

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Close API call.
 *
 * Retries on 429 and 5xx (Close answers a burst limit with a `rate_reset` in
 * seconds) so a 300-lead backfill isn't derailed by one throttled request.
 */
async function api<T = Json>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const auth = authHeader();
  if (!auth) return { ok: false, status: 0, error: 'CLOSE_API_KEY missing' };
  const headers: Record<string, string> = { Authorization: auth };
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: init?.method ?? 'GET',
        headers,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) return { ok: false, status: res.status, error: `Close ${res.status}` };
        const reset = Number((payload as { rate_reset?: number })?.rate_reset);
        await sleep(Math.min(Math.max(Number.isFinite(reset) ? reset * 1000 : 1000, 250), 5000));
        continue;
      }
      if (!res.ok) {
        // Close reports validation problems in `error` / `errors` / `field-errors`.
        const p = payload as { error?: unknown; errors?: unknown; 'field-errors'?: unknown };
        const detail = [p.error, p.errors, p['field-errors']]
          .filter((v) => v != null && (typeof v !== 'object' || Object.keys(v as object).length))
          .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
          .join(' ')
          .slice(0, 200);
        return { ok: false, status: res.status, error: `Close ${res.status}${detail ? `: ${detail}` : ''}` };
      }
      return { ok: true, status: res.status, data: payload as T };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: 0, error: e instanceof Error ? e.message : 'close request failed' };
      await sleep(500);
    }
  }
  return { ok: false, status: 0, error: 'close request failed' };
}

/* ── Org metadata (lead statuses + custom fields) ──────────────────────────── */
// Both are per-organization and effectively static, so they're fetched once per
// server instance. A miss returns null and the field is simply left off the
// payload — a renamed status in Close can never fail a sync.

let statusCache: Map<string, string> | null = null;

/** Close lead-status id for a status label ("Potential", "Bad Fit", …). */
export async function closeStatusId(label: string): Promise<string | null> {
  const want = label.trim().toLowerCase();
  if (!want) return null;
  if (!statusCache) {
    const res = await api<{ data?: { id: string; label: string }[] }>('/status/lead/');
    if (!res.ok) return null;
    statusCache = new Map((res.data?.data ?? []).map((s) => [String(s.label).toLowerCase(), s.id]));
  }
  return statusCache.get(want) ?? null;
}

let fieldCache: Map<string, string> | null = null;

/**
 * Close custom-field id by name, creating it when it doesn't exist.
 *
 * The CRM's stage/source/tags have no home in Close's stock field set, so the first
 * sync provisions them. Additive and safe to re-run — existing fields (their
 * "Socials" text field, say) are reused, never recreated.
 */
export async function closeCustomFieldId(
  name: string,
  opts: { create?: boolean; type?: 'text' | 'date' } = {},
): Promise<string | null> {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  if (!fieldCache) {
    const res = await api<{ data?: { id: string; name: string; type: string }[] }>('/custom_field/lead/?_limit=200');
    if (!res.ok) return null;
    fieldCache = new Map((res.data?.data ?? []).map((f) => [String(f.name).toLowerCase(), f.id]));
  }
  const hit = fieldCache.get(want);
  if (hit || !opts.create) return hit ?? null;

  const created = await api<{ id?: string }>('/custom_field/lead/', {
    method: 'POST',
    body: { name: name.trim(), type: opts.type ?? 'text' },
  });
  if (!created.ok || !created.data?.id) return null;
  fieldCache.set(want, created.data.id);
  return created.data.id;
}

/* ── Lead upsert ──────────────────────────────────────────────────────────── */

export type CloseLeadInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** CRM context shown in Close's lead description. */
  description?: string | null;
  /** Close lead-status label; skipped if the org has no status by that name. */
  statusLabel?: string | null;
  /** Custom fields by NAME → value. Created on demand as text fields. */
  custom?: Record<string, string | null | undefined>;
  /** Custom DATE fields by NAME → 'YYYY-MM-DD'. Created on demand. */
  customDates?: Record<string, string | null | undefined>;
  /**
   * When this lead first came in. Close accepts date_created on create and refuses
   * it forever after ("Value cannot be changed"), so this only lands on brand-new
   * Close leads — an existing one keeps whatever Close stamped it with.
   */
  dateCreated?: string | null;
  /** Set once we've linked this lead — makes the push an update. */
  closeLeadId?: string | null;
  /** Look the lead up in Close by email/phone before creating a new one. */
  matchExisting?: boolean;
};

function displayNameFor(input: CloseLeadInput): string {
  return (input.name || input.email || input.phone || 'Lead').toString();
}

const emailKey = (v: unknown) => String(v ?? '').trim().toLowerCase();
/** Phones are free text in our CRM (`+44 7700 900123`, `07700900123`) — compare
 *  the last 9 digits, which survives a missing country code or a trunk 0. */
const phoneKey = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9);

/** Body shared by create + update: name, description, status, custom fields. */
async function leadBody(input: CloseLeadInput): Promise<Json> {
  const body: Json = { name: displayNameFor(input) };
  if (input.description) body.description = input.description;

  if (input.statusLabel) {
    const statusId = await closeStatusId(input.statusLabel);
    if (statusId) body.status_id = statusId;
  }
  for (const [name, value] of Object.entries(input.custom ?? {})) {
    const v = (value ?? '').toString().trim();
    if (!v) continue;
    const fieldId = await closeCustomFieldId(name, { create: true, type: 'text' });
    if (fieldId) body[`custom.${fieldId}`] = v;
  }
  for (const [name, value] of Object.entries(input.customDates ?? {})) {
    const v = (value ?? '').toString().trim();
    if (!v) continue;
    const fieldId = await closeCustomFieldId(name, { create: true, type: 'date' });
    if (fieldId) body[`custom.${fieldId}`] = v;
  }
  return body;
}

/** Find an existing Close lead by email, then phone. */
export async function closeFindLeadId(input: { email?: string | null; phone?: string | null }): Promise<string | null> {
  const probes: [string, string | null | undefined][] = [
    ['email_address', input.email],
    ['phone_number', input.phone],
  ];
  for (const [field, raw] of probes) {
    const value = (raw ?? '').toString().trim().replace(/"/g, '');
    if (!value) continue;
    const query = encodeURIComponent(`${field}:"${value}"`);
    const res = await api<{ data?: { id: string }[] }>(`/lead/?query=${query}&_fields=id&_limit=1`);
    const id = res.data?.data?.[0]?.id;
    if (id) return id;
  }
  return null;
}

type CloseContact = { id: string; emails?: { email: string }[]; phones?: { phone: string }[] };

/**
 * Make sure the lead has a contact carrying our email + phone.
 *
 * Close dials contacts, not leads, so a lead that gained a phone number in our
 * CRM after it was first pushed has to get it here too — otherwise the setter
 * opens Close and finds nothing to call.
 */
async function syncContact(closeLeadId: string, input: CloseLeadInput): Promise<{ droppedEmail?: boolean; droppedPhone?: boolean }> {
  const email = (input.email ?? '').toString().trim() || null;
  const phone = (input.phone ?? '').toString().trim() || null;
  if (!email && !phone) return {};

  const res = await api<{ contacts?: CloseContact[] }>(`/lead/${closeLeadId}/?_fields=id,contacts`);
  if (!res.ok) return {};
  const contacts = res.data?.contacts ?? [];

  const hasEmail = !email || contacts.some((c) => (c.emails ?? []).some((e) => emailKey(e.email) === emailKey(email)));
  const hasPhone = !phone || contacts.some((c) => (c.phones ?? []).some((p) => phoneKey(p.phone) === phoneKey(phone)));
  if (hasEmail && hasPhone) return {};

  const newEmails = !hasEmail && email ? [{ email, type: 'office' }] : [];
  const newPhones = !hasPhone && phone ? [{ phone, type: 'office' }] : [];

  // Same tolerance as the create path: if Close rejects one detail, keep the other
  // rather than losing both.
  const write = (emails: { email: string; type: string }[], phones: { phone: string; type: string }[]) =>
    contacts.length
      // PUT replaces the whole list, so send existing + new.
      ? api(`/contact/${contacts[0].id}/`, {
        method: 'PUT',
        body: {
          emails: [...(contacts[0].emails ?? []).map((e) => ({ email: e.email, type: 'office' })), ...emails],
          phones: [...(contacts[0].phones ?? []).map((p) => ({ phone: p.phone, type: 'office' })), ...phones],
        },
      })
      : api('/contact/', {
        method: 'POST',
        body: { lead_id: closeLeadId, name: input.name || displayNameFor(input), emails, phones },
      });

  let out = await write(newEmails, newPhones);
  if (out.status === 400 && (out.error ?? '').toLowerCase().includes('email') && newEmails.length) {
    out = await write([], newPhones);
    if (out.ok) return { droppedEmail: true };
  }
  if (out.status === 400 && (out.error ?? '').toLowerCase().includes('phone') && newPhones.length) {
    out = await write(newEmails, []);
    if (out.ok) return { droppedPhone: true };
  }
  return {};
}

/**
 * Create or update the lead in Close. Returns the Close lead id + web URL.
 *
 * `created` distinguishes a fresh Close lead from an update, so a backfill can
 * report how many leads it actually added.
 */
export async function closeUpsertLead(input: CloseLeadInput): Promise<CloseResult> {
  if (!closeConfigured()) return { ok: false, skipped: true };

  let leadId = (input.closeLeadId ?? '').toString().trim() || null;
  // Unlinked but already in Close (an earlier push whose link failed to save, or
  // a lead the team added by hand) → adopt it instead of creating a duplicate.
  if (!leadId && input.matchExisting) leadId = await closeFindLeadId(input);

  const body = await leadBody(input);

  if (leadId) {
    const res = await api<{ id?: string }>(`/lead/${leadId}/`, { method: 'PUT', body });
    if (!res.ok) return { ok: false, status: res.status, error: res.error };
    const contact = await syncContact(leadId, input);
    return { ok: true, id: leadId, url: closeLeadUrl(leadId), created: false, droppedEmail: contact.droppedEmail, droppedPhone: contact.droppedPhone };
  }

  const contact = (opts: { email?: boolean; phone?: boolean } = {}) => ({
    name: input.name || undefined,
    emails: input.email && opts.email !== false ? [{ email: input.email, type: 'office' }] : [],
    phones: input.phone && opts.phone !== false ? [{ phone: input.phone, type: 'office' }] : [],
  });
  // date_created is create-only — this is the one chance to make Close's own
  // "Created" column read as the date the lead actually came in.
  if (input.dateCreated) body.date_created = input.dateCreated;

  let res = await api<{ id?: string }>('/lead/', { method: 'POST', body: { ...body, contacts: [contact()] } });

  // Close validates contact details harder than we can, and its own idea of a bad
  // address shifts. A lead whose CRM email or phone it rejects still belongs in
  // Close with whatever else it has — retry without the offending field rather than
  // leaving the lead out entirely.
  const rejected = (field: string) => res.status === 400 && (res.error ?? '').toLowerCase().includes(field);
  let droppedEmail = false;
  let droppedPhone = false;
  if (rejected('email') && input.email) {
    droppedEmail = true;
    res = await api<{ id?: string }>('/lead/', { method: 'POST', body: { ...body, contacts: [contact({ email: false })] } });
  }
  if (rejected('phone') && input.phone) {
    droppedPhone = true;
    res = await api<{ id?: string }>('/lead/', { method: 'POST', body: { ...body, contacts: [contact({ email: !droppedEmail, phone: false })] } });
  }

  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  if (!res.data?.id) return { ok: false, status: res.status, error: 'Close returned no lead id' };
  return { ok: true, id: res.data.id, url: closeLeadUrl(res.data.id), created: true, droppedEmail, droppedPhone };
}

/* ── Pipelines (a CRM pipeline mirrored as a Close opportunity pipeline) ───── */

export type CloseStatusType = 'active' | 'won' | 'lost';
export type ClosePipeline = { id: string; name: string; statuses: { id: string; label: string; type: string }[] };

let pipelineCache: ClosePipeline[] | null = null;

async function loadPipelines(): Promise<ClosePipeline[] | null> {
  if (pipelineCache) return pipelineCache;
  const res = await api<{ data?: ClosePipeline[] }>('/pipeline/');
  if (!res.ok) return null;
  pipelineCache = res.data?.data ?? [];
  return pipelineCache;
}

export type EnsuredPipeline = {
  ok: boolean;
  id?: string;
  /** Stage label (lower-cased) → Close opportunity status id. */
  statuses?: Map<string, string>;
  created?: boolean;
  addedStages?: string[];
  error?: string;
};

/**
 * Make sure Close has a pipeline of this name carrying these stages, in order.
 *
 * Matched by name, so a pipeline Close already owns (their hand-built "Sales") is
 * reused rather than duplicated. Missing stages are appended one at a time via
 * /status/opportunity/ — additive, so existing statuses keep their ids and the
 * opportunities already parked on them are untouched.
 */
export async function closeEnsurePipeline(
  name: string,
  stages: { label: string; type: CloseStatusType }[],
): Promise<EnsuredPipeline> {
  if (!closeConfigured()) return { ok: false, error: 'CLOSE_API_KEY missing' };
  const wanted = stages.filter((s) => s.label.trim());
  if (!name.trim() || !wanted.length) return { ok: false, error: 'pipeline needs a name and at least one stage' };

  const pipelines = await loadPipelines();
  if (!pipelines) return { ok: false, error: 'could not list Close pipelines' };

  let pipeline = pipelines.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  let created = false;

  if (!pipeline) {
    const res = await api<ClosePipeline>('/pipeline/', {
      method: 'POST',
      body: { name: name.trim(), statuses: wanted.map((s) => ({ label: s.label, type: s.type })) },
    });
    if (!res.ok || !res.data?.id) return { ok: false, error: res.error || 'could not create the Close pipeline' };
    pipeline = res.data;
    pipelineCache = [...pipelines, pipeline];
    created = true;
  }

  const byLabel = new Map((pipeline.statuses ?? []).map((s) => [s.label.trim().toLowerCase(), s.id]));
  const addedStages: string[] = [];
  for (const stage of wanted) {
    const key = stage.label.trim().toLowerCase();
    if (byLabel.has(key)) continue;
    const res = await api<{ id?: string }>('/status/opportunity/', {
      method: 'POST',
      body: { label: stage.label, type: stage.type, pipeline_id: pipeline.id },
    });
    if (!res.ok || !res.data?.id) return { ok: false, id: pipeline.id, statuses: byLabel, error: res.error || `could not add stage "${stage.label}"` };
    byLabel.set(key, res.data.id);
    addedStages.push(stage.label);
  }
  // Keep the cache consistent for the rest of this run.
  pipeline.statuses = [...byLabel.entries()].map(([label, id]) => ({ id, label, type: 'active' }));

  return { ok: true, id: pipeline.id, statuses: byLabel, created, addedStages };
}

/** Park (or move) the lead's opportunity on a Close pipeline stage. */
export async function closeUpsertOpportunity(input: {
  closeLeadId: string;
  statusId: string;
  opportunityId?: string | null;
}): Promise<{ ok: boolean; id?: string; created?: boolean; error?: string }> {
  if (!closeConfigured()) return { ok: false, error: 'CLOSE_API_KEY missing' };

  if (input.opportunityId) {
    const res = await api(`/opportunity/${input.opportunityId}/`, { method: 'PUT', body: { status_id: input.statusId } });
    if (res.ok) return { ok: true, id: input.opportunityId, created: false };
    // Deleted in Close (or belongs to a pipeline that's gone) → make a new one.
    if (res.status !== 404) return { ok: false, error: res.error };
  }

  const res = await api<{ id?: string }>('/opportunity/', {
    method: 'POST',
    body: { lead_id: input.closeLeadId, status_id: input.statusId },
  });
  if (!res.ok || !res.data?.id) return { ok: false, error: res.error || 'could not create the opportunity' };
  return { ok: true, id: res.data.id, created: true };
}

/* ── Notes ────────────────────────────────────────────────────────────────── */

/**
 * Mirror the CRM's notes onto the Close timeline as a single note activity.
 *
 * Identified by a marker line rather than a stored id: notes get edited in the CRM
 * constantly, and one note that keeps up to date beats a timeline stacked with
 * every past revision. An empty CRM notes field leaves any existing note alone —
 * a sync must never delete something a setter wrote in Close.
 */
export async function closeSyncNote(closeLeadId: string, notes: string | null, marker = '[CRM notes]'): Promise<{ ok: boolean; changed?: boolean; error?: string }> {
  const body = (notes ?? '').trim();
  if (!closeConfigured()) return { ok: false, error: 'CLOSE_API_KEY missing' };
  if (!body) return { ok: true, changed: false };
  const wanted = `${marker}\n${body}`;

  const list = await api<{ data?: { id: string; note?: string }[] }>(
    `/activity/note/?lead_id=${encodeURIComponent(closeLeadId)}&_limit=100`,
  );
  if (!list.ok) return { ok: false, error: list.error };

  const existing = (list.data?.data ?? []).find((n) => (n.note ?? '').trimStart().startsWith(marker));
  if (existing) {
    if ((existing.note ?? '').trim() === wanted) return { ok: true, changed: false };
    const res = await api(`/activity/note/${existing.id}/`, { method: 'PUT', body: { note: wanted } });
    return res.ok ? { ok: true, changed: true } : { ok: false, error: res.error };
  }
  const res = await api('/activity/note/', { method: 'POST', body: { lead_id: closeLeadId, note: wanted } });
  return res.ok ? { ok: true, changed: true } : { ok: false, error: res.error };
}

/* ── Reading leads back out (the Close → CRM import) ──────────────────────── */

/** A Close lead as the importer needs it. Shapes only what lib/close-import reads. */
export type CloseLeadRecord = {
  id: string;
  display_name?: string;
  description?: string;
  status_label?: string;
  date_created?: string;
  date_updated?: string;
  contacts?: { name?: string; emails?: { email?: string }[]; phones?: { phone?: string; type?: string }[] }[];
  opportunities?: { id?: string; pipeline_name?: string; status_label?: string }[];
  custom?: Record<string, unknown>;
};

/**
 * One page of the org's leads, oldest-API-order first.
 *
 * No ordering parameter: Close ignores `_order_by` on this endpoint (verified —
 * it returns the same unsorted page either way), so the importer pages the whole
 * set and relies on its own link and phone checks for idempotency rather than on
 * being able to ask for "newest first".
 */
export async function closeListLeads(
  opts: { limit?: number; skip?: number } = {},
): Promise<{ ok: boolean; leads: CloseLeadRecord[]; hasMore: boolean; total?: number; error?: string }> {
  if (!closeConfigured()) return { ok: false, leads: [], hasMore: false, error: 'CLOSE_API_KEY missing' };

  const q = new URLSearchParams({
    _limit: String(Math.min(Math.max(opts.limit ?? 100, 1), 200)),
    _skip: String(Math.max(opts.skip ?? 0, 0)),
    _fields: 'id,display_name,description,status_label,date_created,date_updated,contacts,opportunities,custom',
  });

  const res = await api<{ data?: CloseLeadRecord[]; has_more?: boolean; total_results?: number }>(`/lead/?${q}`);
  if (!res.ok) return { ok: false, leads: [], hasMore: false, error: res.error };
  return { ok: true, leads: res.data?.data ?? [], hasMore: !!res.data?.has_more, total: res.data?.total_results };
}

/* ── Call activity ────────────────────────────────────────────────────────── */

export type CloseCall = {
  id: string;
  /** The Close lead this call belongs to (null on calls Close couldn't attribute). */
  leadId: string | null;
  direction: string;          // 'inbound' | 'outbound'
  duration: number;           // seconds
  disposition: string | null; // answered / no_answer / voicemail / busy …
  note: string;
  date: string;               // ISO
  /** 'Close.io' for a call dialled in Close, 'External' for one we logged. */
  source: string | null;
};

/**
 * The marker every activity this app writes into Close carries, in its note.
 *
 * Close is a mirror, and mirrors reflect both ways if you let them: an Aloware call
 * pushed into Close would be read straight back out by importCloseCalls and land on
 * the CRM timeline a second time. The marker is what breaks that loop — and because
 * it's the call's Aloware id, it also survives someone re-logging the call by hand.
 */
export const CLOSE_EXTERNAL_MARKER = 'alo';

/** `[alo:12345]` — the note prefix that tells our own importer to skip a call. */
export function closeExternalMarker(id: string): string {
  return `[${CLOSE_EXTERNAL_MARKER}:${id}]`;
}

/** Whether a Close activity note was written by this app (and must not re-import). */
export function isCloseExternalEcho(note: string | null | undefined): boolean {
  return (note ?? '').trimStart().startsWith(`[${CLOSE_EXTERNAL_MARKER}:`);
}

/**
 * Close's call status for an Aloware disposition.
 *
 * Close's enum is fixed (`completed`, `no-answer`, `busy`, `failed`, …) and its
 * reporting counts on it, so an Aloware word we don't recognise falls back to
 * duration: a call with talk time connected, whatever it was labelled.
 */
export function closeCallStatus(disposition: string | null, durationSec: number): string {
  const d = (disposition ?? '').toLowerCase();
  if (/no.?answer|missed|unanswered/.test(d)) return 'no-answer';
  if (/busy/.test(d)) return 'busy';
  if (/fail|error|invalid/.test(d)) return 'failed';
  if (/cancel|abandon/.test(d)) return 'cancel';
  if (/timeout/.test(d)) return 'timeout';
  return durationSec > 0 ? 'completed' : 'no-answer';
}

/**
 * Log a call that happened somewhere else (Aloware) onto the Close timeline.
 *
 * `source: 'External'` keeps it visually distinct from Close's own dialer in the UI,
 * and `activity_at` backdates it to when the call actually happened — Close won't
 * let `date_created` be set on a call, so without this every imported call would
 * stack up at the moment of the sync instead of in the order they were made.
 */
export async function closeLogCall(input: {
  closeLeadId: string;
  externalId: string;
  direction: 'inbound' | 'outbound';
  durationSec: number;
  disposition: string | null;
  phone: string | null;
  note?: string | null;
  recordingUrl?: string | null;
  occurredAt?: string | null;
}): Promise<CloseResult> {
  if (!closeConfigured()) return { ok: false, skipped: true, error: 'CLOSE_API_KEY missing' };

  const detail = (input.note ?? '').trim();
  const body: Json = {
    lead_id: input.closeLeadId,
    direction: input.direction,
    duration: Math.max(0, Math.round(input.durationSec)),
    status: closeCallStatus(input.disposition, input.durationSec),
    source: 'External',
    note: [closeExternalMarker(input.externalId), detail].filter(Boolean).join(' '),
  };
  if (input.phone) body.phone = input.phone;
  if (input.occurredAt) body.activity_at = input.occurredAt;
  // Close rejects a non-https recording URL outright, which would lose the call
  // record along with the link.
  if (input.recordingUrl?.startsWith('https://')) body.recording_url = input.recordingUrl;

  const res = await api<{ id?: string }>('/activity/call/', { method: 'POST', body });
  return res.ok ? { ok: true, id: res.data?.id, created: true } : { ok: false, status: res.status, error: res.error };
}

/**
 * Log a text sent or received in Aloware onto the Close timeline.
 *
 * Close needs `status` to place it: `sent` for one we sent, `inbox` for one that
 * came in. Both `local_phone` (our line) and `remote_phone` (the lead) are wanted
 * in E.164 — Close drops the message from the contact's thread without them.
 *
 * No dedupe marker on this one, unlike closeLogCall: the text field IS the message
 * a rep reads in Close's SMS thread, and we never re-import SMS from Close, so
 * there's no loop to break and no reason to graffiti the conversation.
 */
export async function closeLogSms(input: {
  closeLeadId: string;
  direction: 'inbound' | 'outbound';
  text: string;
  localPhone?: string | null;
  remotePhone?: string | null;
  occurredAt?: string | null;
}): Promise<CloseResult> {
  if (!closeConfigured()) return { ok: false, skipped: true, error: 'CLOSE_API_KEY missing' };

  const body: Json = {
    lead_id: input.closeLeadId,
    direction: input.direction,
    status: input.direction === 'inbound' ? 'inbox' : 'sent',
    source: 'External',
    text: input.text.trim(),
  };
  if (input.localPhone) body.local_phone = input.localPhone;
  if (input.remotePhone) body.remote_phone = input.remotePhone;
  if (input.occurredAt) body.date_created = input.occurredAt;

  const res = await api<{ id?: string }>('/activity/sms/', { method: 'POST', body });
  return res.ok ? { ok: true, id: res.data?.id, created: true } : { ok: false, status: res.status, error: res.error };
}

/**
 * Pull call activities, newest first.
 *
 * With `leadId` it's one lead's history (the per-lead "Pull calls" button). Without,
 * it's the whole org's recent calls in a single request — which is how the sweep
 * imports everyone's dials without asking Close about 300 leads one at a time.
 */
export async function closeListCalls(
  opts: { leadId?: string | null; since?: string; limit?: number } = {},
): Promise<{ ok: boolean; skipped?: boolean; calls?: CloseCall[]; status?: number; error?: string }> {
  if (!closeConfigured()) return { ok: false, skipped: true };

  // Close caps the activity endpoint at 100 per request, so a bigger window pages.
  const PAGE = 100;
  const want = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
  const calls: CloseCall[] = [];

  for (let skip = 0; calls.length < want; skip += PAGE) {
    const q = new URLSearchParams({ _limit: String(Math.min(PAGE, want - calls.length)), _skip: String(skip) });
    if (opts.leadId) q.set('lead_id', opts.leadId);
    if (opts.since) q.set('date_created__gt', opts.since);
    q.set('_fields', 'id,lead_id,direction,duration,status,disposition,note,note_html,source,date_created,date_updated');

    const res = await api<{ data?: Record<string, unknown>[]; has_more?: boolean }>(`/activity/call/?${q}`);
    if (!res.ok) return { ok: false, status: res.status, error: res.error };

    for (const c of res.data?.data ?? []) {
      calls.push({
        id: String(c.id ?? ''),
        leadId: c.lead_id ? String(c.lead_id) : null,
        direction: String(c.direction ?? 'outbound'),
        duration: Number(c.duration ?? 0),
        disposition: (c.disposition ?? c.status ?? null) as string | null,
        note: String(c.note ?? c.note_html ?? '').replace(/<[^>]+>/g, '').trim(),
        date: String(c.date_created ?? c.date_updated ?? ''),
        source: c.source ? String(c.source) : null,
      });
    }
    if (!res.data?.has_more) break;
  }
  return { ok: true, calls };
}
