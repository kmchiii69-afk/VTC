// Aloware (app.aloware.io) — the phone system the team dials and texts on.
//
// Two directions, deliberately asymmetric:
//
//   out  We upsert each CRM lead into Aloware as a contact, so a number that rings
//        carries a name and the rep sees who they're calling. Aloware's form/lead
//        endpoint is an upsert keyed on phone_number.
//   in   Aloware posts a webhook for every communication it completes. That's the
//        only inbound path — Aloware publishes no "list communications since X"
//        endpoint — so app/api/webhooks/aloware has to be idempotent rather than
//        reconciled by a sweep. See lib/aloware-sync.ts.
//
// Env-gated + best-effort, same shape as lib/close.ts and lib/kit.ts: with no
// ALOWARE_API_TOKEN every call is a no-op ({ skipped: true }) and nothing throws,
// so a missing or misconfigured Aloware account can never break the CRM.
//
//   ALOWARE_API_TOKEN      — Aloware → Integrations → API. Sent in the body/query,
//                            not a header; that's Aloware's scheme, not a mistake.
//   ALOWARE_LINE_ID        — the line new SMS goes out on (or ALOWARE_FROM_NUMBER).
//   ALOWARE_FROM_NUMBER    — an owned number to send from, if you'd rather pin one.
//   ALOWARE_WEBHOOK_SECRET — the Bearer token configured on the Aloware webhook.
//                            Required: without it the receiver refuses everything,
//                            because that URL is public.
//
// The MCP server (.mcp.json → https://app.aloware.io/mcp) is a separate, OAuth-based
// channel for driving Aloware from Claude by hand. It shares nothing with this file
// and does not run in production.

import { normalizePhone } from '@/lib/contact-format';

const BASE = 'https://app.aloware.io/api/v1/webhook';

function token(): string | null {
  return (process.env.ALOWARE_API_TOKEN || '').trim() || null;
}

/** Whether Aloware is wired up at all — lets callers skip work before building payloads. */
export function alowareConfigured(): boolean {
  return !!token();
}

export type AlowareResult = {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
};

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Aloware API call.
 *
 * Retried on 429/5xx like the Close client, so a batch contact push isn't derailed
 * by a single throttled request. Aloware answers errors as
 * `{ message, errors: { field: [...] } }`.
 */
async function api<T = Json>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Json; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const key = token();
  if (!key) return { ok: false, status: 0, error: 'ALOWARE_API_TOKEN missing' };

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const method = init.method ?? 'GET';
  // The token rides in the body on POST and the query string on GET — Aloware
  // accepts no Authorization header on these endpoints.
  if (method === 'GET') url.searchParams.set('api_token', key);
  const body = method === 'POST' ? JSON.stringify({ api_token: key, ...(init.body ?? {}) }) : undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body,
      });
      const payload = (await res.json().catch(() => ({}))) as Json;

      if (res.status === 429 || res.status >= 500) {
        if (attempt === 2) return { ok: false, status: res.status, error: `Aloware ${res.status}` };
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const detail = [payload.message, payload.error, payload.errors]
          .filter((v) => v != null && (typeof v !== 'object' || Object.keys(v as object).length))
          .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
          .join(' ')
          .slice(0, 200);
        return { ok: false, status: res.status, error: `Aloware ${res.status}${detail ? `: ${detail}` : ''}` };
      }
      return { ok: true, status: res.status, data: payload as T };
    } catch (e) {
      if (attempt === 2) return { ok: false, status: 0, error: e instanceof Error ? e.message : 'aloware request failed' };
      await sleep(500);
    }
  }
  return { ok: false, status: 0, error: 'aloware request failed' };
}

/* ── Contacts ─────────────────────────────────────────────────────────────── */

export type AlowareContactInput = {
  phone: string;
  name?: string | null;
  email?: string | null;
  /** Where the lead came from, shown on the Aloware contact. */
  leadSource?: string | null;
  notes?: string | null;
  tagId?: string | null;
};

/**
 * Create or update the Aloware contact for a lead.
 *
 * `force_update: true` is what makes this an upsert — without it Aloware answers
 * an existing phone number with a 400 and leaves the record untouched, so a name
 * corrected in the CRM would never reach the dialer.
 */
export async function alowareUpsertContact(input: AlowareContactInput): Promise<AlowareResult & { created?: boolean }> {
  if (!alowareConfigured()) return { ok: false, skipped: true, error: 'ALOWARE_API_TOKEN missing' };
  const phone = normalizePhone(input.phone || '');
  if (!phone) return { ok: false, error: 'no phone number' };

  const body: Json = { phone_number: phone, force_update: true };
  const name = (input.name ?? '').trim();
  if (name) {
    body.name = name;
    // Aloware splits the list view on first/last, so send both when the CRM has
    // something that looks like a full name.
    const parts = name.split(/\s+/);
    body.first_name = parts[0];
    if (parts.length > 1) body.last_name = parts.slice(1).join(' ');
  }
  if (input.email) body.email = input.email;
  if (input.leadSource) body.lead_source = input.leadSource;
  if (input.notes) body.notes = input.notes;
  if (input.tagId) body.tag_id = input.tagId;

  const res = await api<{ message?: string }>('/forms', { method: 'POST', body });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  return { ok: true, status: res.status, created: res.status === 201 };
}

/**
 * Aloware's contact id for a phone number, or null.
 *
 * The upsert endpoint answers with a bare `{ message }`, so the id has to be read
 * back separately. Aloware doesn't document the lookup's success shape, so the id
 * is dug out of whichever envelope comes back rather than assumed — and a miss is
 * harmless: everything else in this integration matches on the phone number.
 */
export async function alowareFindContactId(phone: string): Promise<string | null> {
  if (!alowareConfigured()) return null;
  const normalized = normalizePhone(phone || '');
  if (!normalized) return null;

  const res = await api<Json>('/contact/phone-number', { query: { phone_number: normalized } });
  if (!res.ok || !res.data) return null;

  const envelope = res.data;
  const candidates = [envelope, envelope.contact, envelope.data].filter(
    (v): v is Json => !!v && typeof v === 'object' && !Array.isArray(v),
  );
  for (const c of candidates) {
    const id = c.id ?? c.contact_id;
    if (id != null && String(id).trim()) return String(id).trim();
  }
  return null;
}

/** The contact's page inside Aloware — where a rep clicks to see the history. */
export function alowareContactUrl(contactId: string): string {
  return `https://app.aloware.io/contacts/${contactId}`;
}

/* ── Outbound SMS ─────────────────────────────────────────────────────────── */

/**
 * Send an SMS (or MMS, with `imageUrl`) through Aloware.
 *
 * Aloware caps a single message at 160 characters and rejects anything longer
 * outright, so the text is trimmed here rather than losing the send.
 */
export async function alowareSendSms(input: {
  to: string;
  message: string;
  imageUrl?: string | null;
}): Promise<AlowareResult> {
  if (!alowareConfigured()) return { ok: false, skipped: true, error: 'ALOWARE_API_TOKEN missing' };

  const to = normalizePhone(input.to || '');
  const message = (input.message || '').trim().slice(0, 160);
  if (!to) return { ok: false, error: 'no recipient' };
  if (!message) return { ok: false, error: 'empty message' };

  const lineId = (process.env.ALOWARE_LINE_ID || '').trim();
  const from = (process.env.ALOWARE_FROM_NUMBER || '').trim();
  if (!lineId && !from) return { ok: false, error: 'set ALOWARE_LINE_ID or ALOWARE_FROM_NUMBER to send SMS' };

  const body: Json = { to, message };
  if (lineId) body.line_id = lineId;
  else body.from = normalizePhone(from);
  if (input.imageUrl) body.image_url = input.imageUrl;

  const res = await api('/sms-gateway/send', { method: 'POST', body });
  return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: res.error };
}

/* ── Inbound webhooks ─────────────────────────────────────────────────────── */

/**
 * Whether a webhook request really came from our Aloware account.
 *
 * Aloware signs nothing — its webhook auth is a static Bearer token you type into
 * the integration screen — so this is a constant-time compare of that shared
 * secret. Fails closed when the secret is unset: /api/webhooks/ is exempt from the
 * app's auth proxy, so an unguarded receiver would let anyone forge call history.
 */
export function verifyAlowareWebhook(authorization: string | null): boolean {
  const secret = (process.env.ALOWARE_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const got = (authorization || '').trim();
  const want = `Bearer ${secret}`;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export type AlowareEvent = {
  /** Aloware's communication id — the dedupe key for everything downstream. */
  id: string | null;
  kind: 'call' | 'sms';
  direction: 'inbound' | 'outbound';
  /** The lead's number, E.164 where Aloware gave us one. */
  phone: string | null;
  /** Our own number/line the communication ran on. */
  linePhone: string | null;
  contactId: string | null;
  name: string | null;
  email: string | null;
  durationSec: number;
  talkTimeSec: number;
  disposition: string | null;
  /** SMS body. */
  body: string | null;
  recordingUrl: string | null;
  transcription: string | null;
  summary: string | null;
  /** ISO timestamp of the communication itself, not of the webhook delivery. */
  createdAt: string | null;
};

const asString = (v: unknown): string | null => {
  // Objects must never stringify to "[object Object]". Aloware nests the whole
  // communication under `body`, so on a call event `c.body` IS that object rather
  // than an SMS's text — coercing it would put junk on the timeline.
  if (v == null || typeof v === 'object') return null;
  const s = String(v).trim();
  return s || null;
};
const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/**
 * Aloware's timestamps as a real ISO instant.
 *
 * They arrive as `2026-08-10 08:14:22` — no `T`, no zone. Handed to `new Date()`
 * that's read as the *server's* local time, so the same call would land at a
 * different moment depending on where the function ran, and Close would order its
 * timeline wrongly. A zone-less Aloware timestamp is UTC, so say so explicitly.
 */
const asInstant = (v: unknown): string | null => {
  const raw = asString(v);
  if (!raw) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const t = Date.parse(hasZone ? raw : `${raw.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * Normalise one Aloware webhook body.
 *
 * Aloware encodes direction and type as numeric strings ("1"/"2") and varies the
 * envelope by event — some events post the communication flat, others nest it —
 * so every field is read defensively and through its known aliases. An event we
 * can't read at all still parses; it just lands with a null id, which the caller
 * treats as "nothing to log" instead of throwing inside a webhook.
 */
export function parseAlowareEvent(payload: unknown): AlowareEvent {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Json;
  // Aloware posts `{ body: <the communication>, event: "<EventName>" }`. The other
  // keys are fallbacks for event shapes that post it flat or under another name.
  const nested = (root.body ?? root.communication ?? root.data ?? root.call) as Json | undefined;
  const c = nested && typeof nested === 'object' && !Array.isArray(nested) ? { ...root, ...nested } : root;
  const contact = (c.contact && typeof c.contact === 'object' ? c.contact : {}) as Json;

  // The event name spells out kind and direction in words
  // ("OutboundPhoneCall-DispositionCompleted") for events that omit the numeric
  // fields — which is most of the enrichment ones.
  const eventName = String(root.event ?? c.event ?? '').toLowerCase();

  // "1" = inbound, "2" = outbound. Aloware also sends the words on some events.
  const rawDirection = String(c.direction ?? '').toLowerCase();
  const direction: AlowareEvent['direction'] =
    rawDirection === '1' || rawDirection === 'inbound' ? 'inbound'
      : rawDirection === '2' || rawDirection === 'outbound' ? 'outbound'
      : eventName.includes('inbound') ? 'inbound'
      : 'outbound';

  // "1" = call, "2" = SMS, then the event name, then whether any text came at all.
  const rawType = String(c.type ?? '').toLowerCase();
  const body = asString(c.body ?? c.message ?? c.text);
  const kind: AlowareEvent['kind'] =
    rawType === '2' || rawType === 'sms' || rawType === 'message' ? 'sms'
      : rawType === '1' || rawType === 'call' ? 'call'
      : /sms|message|text/.test(eventName) ? 'sms'
      : /call|voicemail/.test(eventName) ? 'call'
      : body ? 'sms' : 'call';

  const phone = asString(c.phone_number ?? contact.phone_number ?? c.contact_phone_number ?? c.to ?? c.from);
  const recording = asString(c.direct_recording_url ?? c.recording_url ?? c.direct_voicemail_url ?? c.voicemail_url);

  const parts = [asString(c.first_name ?? contact.first_name), asString(c.last_name ?? contact.last_name)];
  const name = asString(c.contact_name ?? contact.name) ?? asString(parts.filter(Boolean).join(' '));

  return {
    id: asString(c.id ?? c.communication_id ?? c.uuid),
    kind,
    direction,
    phone: phone ? normalizePhone(phone) : null,
    linePhone: asString(c.line_number ?? c.incoming_number ?? c.outgoing_number),
    contactId: asString(c.contact_id ?? contact.id),
    name,
    email: asString(c.email ?? contact.email),
    durationSec: asNumber(c.duration),
    talkTimeSec: asNumber(c.talk_time),
    disposition: asString(c.disposition_status ?? c.disposition ?? c.status),
    body,
    // Close rejects a non-https recording URL, so a bare http link is dropped
    // rather than failing the whole activity write.
    recordingUrl: recording && recording.startsWith('https://') ? recording : null,
    transcription: asString(c.transcription ?? c.transcription_text),
    summary: asString(c.summary ?? c.ai_summary ?? c.call_summary),
    createdAt: asInstant(c.created_at ?? c.updated_at ?? c.date),
  };
}
