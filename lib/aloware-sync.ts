// Keeping the CRM, Close and Aloware telling the same story.
//
// Aloware is where the calls and texts happen. This module is the two halves that
// keeps the other two systems current:
//
//   in   applyAlowareEvent() — one webhook from Aloware becomes one CRM touchpoint,
//        a dial count, a rolled follow-up date, and one mirrored activity on the
//        Close timeline. Idempotent on crm_touchpoints.external_id, so Aloware's
//        habit of firing several events for a single call (disposed → recording
//        saved → transcription saved) enriches the existing row instead of stacking
//        duplicates.
//   out  syncLeadsToAloware() — pushes CRM leads into Aloware as contacts so a
//        ringing number carries a name. Bounded batches, same shape as
//        syncLeadsToClose, driven by the sweep in app/api/cron/close-sync.
//
// Direction of truth, unchanged from the Close mirror: the CRM owns lead data,
// Aloware owns what happened on the phone. Nothing here reads lead fields back out
// of Aloware.
//
// crm_leads.aloware_contact_id / aloware_synced_at and crm_touchpoints.external_id
// come from supabase/aloware_integration.sql. Until that's run every function here
// degrades to a clear error instead of throwing — the CRM keeps working, and the
// phone keeps working, only the mirror waits.

import { after } from 'next/server';
import { db } from '@/lib/kv';
import { isValidPhone } from '@/lib/contact-format';
import { writeWithOptionalColumns } from '@/lib/db-write';
import { stampLeadCadence, stageLabelFor, findLeadByPhone } from '@/lib/crm-leads';
import { cadencePatch, type CadenceLead } from '@/lib/crm-followup';
import { alowareConfigured, alowareFindContactId, alowareUpsertContact, type AlowareEvent } from '@/lib/aloware';
import { closeConfigured, closeLogCall, closeLogSms } from '@/lib/close';
import { syncLeadToClose } from '@/lib/close-sync';

/** Columns added by supabase/aloware_integration.sql. */
export const ALOWARE_SYNC_COLUMNS = ['aloware_contact_id', 'aloware_synced_at'] as const;

export const MIGRATION_HINT =
  'Aloware sync needs crm_leads.aloware_contact_id / aloware_synced_at and crm_touchpoints.external_id — run supabase/aloware_integration.sql in the Supabase SQL editor.';

/** How many contacts one sweep batch pushes. Each is 1-2 Aloware calls. */
export const ALOWARE_BATCH_SIZE = 50;

/** Aloware rate-limits bursts, so pushes run a few at a time. */
const CONCURRENCY = 4;

/** Postgres unique-violation — an event we've already logged. */
const UNIQUE_VIOLATION = '23505';

type LeadRow = Record<string, unknown> & { id: string };

const str = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};
const isMissingColumn = (message: string) =>
  [...ALOWARE_SYNC_COLUMNS, 'external_id'].some((c) => message.toLowerCase().includes(c));

/* ── Inbound: one Aloware communication ───────────────────────────────────── */

/** `alo:12345` — the value stored in crm_touchpoints.external_id. */
const externalId = (id: string) => `alo:${id}`;

function fmtDuration(sec: number): string {
  if (sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The timeline line for one communication.
 *
 * Written to read like the Twilio dialer's lines ("Dialer call · 2m 14s") so a lead
 * worked on both systems has one legible history rather than two dialects. The
 * recording, transcription and summary are appended as they arrive — that's what a
 * later webhook for the same call updates.
 */
export function describeAlowareEvent(event: AlowareEvent): string {
  const inbound = event.direction === 'inbound';

  if (event.kind === 'sms') {
    const text = (event.body ?? '').trim();
    return `${inbound ? 'SMS received' : 'SMS sent'} (Aloware)${text ? ` · ${text}` : ''}`;
  }

  const kind = inbound ? 'Inbound call' : 'Aloware call';
  const connected = event.talkTimeSec > 0 || event.durationSec > 0;
  const outcome = connected
    ? fmtDuration(event.talkTimeSec || event.durationSec)
    : (event.disposition ?? 'not answered').replace(/[_-]+/g, ' ');

  return [
    `${kind} · ${outcome}`,
    connected && event.disposition ? `· ${event.disposition.replace(/[_-]+/g, ' ')}` : null,
    event.recordingUrl ? `\nRecording: ${event.recordingUrl}` : null,
    event.summary ? `\nSummary: ${event.summary}` : null,
    // Transcripts run long and the timeline is a scannable list, not a document.
    event.transcription ? `\nTranscript: ${event.transcription.slice(0, 1500)}` : null,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/ \n/g, '\n');
}

/** The enrichment lines describeAlowareEvent can append, in display order. */
const DETAIL_PREFIXES = ['Recording:', 'Summary:', 'Transcript:'] as const;

/** Whether a headline records a call that actually connected ("· 2m 14s"). */
const connectedHeadline = (line: string) => /· \d+(?:m \d+)?s\b/.test(line);

/**
 * Fold a later webhook for the same communication into the line already stored.
 *
 * Aloware fires several events per call and does not promise an order: the
 * recording can be saved before the call is disposed, and the transcript can
 * arrive after both. Taking the newest event wholesale would let a
 * recording-only event overwrite a headline that knows the call lasted two
 * minutes, and a bare disposition event overwrite the recording link.
 *
 * So the merge is per-part rather than whole-string: keep whichever headline
 * knows the call connected, and union the enrichment lines, letting the newer
 * event win only where it actually has something to say.
 */
export function mergeAlowareContent(prev: string, next: string): string {
  const parse = (text: string) => {
    const [headline = '', ...rest] = text.split('\n');
    const details = new Map<string, string>();
    for (const line of rest) {
      const prefix = DETAIL_PREFIXES.find((p) => line.startsWith(p));
      if (prefix) details.set(prefix, line);
    }
    return { headline, details };
  };

  const a = parse(prev);
  const b = parse(next);

  // A connected headline outranks "not answered" whichever way round they land;
  // between two equally-informative ones the newer wins.
  const headline = connectedHeadline(b.headline) || !connectedHeadline(a.headline) ? b.headline : a.headline;

  const details = new Map(a.details);
  for (const [prefix, line] of b.details) details.set(prefix, line);

  return [headline, ...DETAIL_PREFIXES.map((p) => details.get(p)).filter(Boolean)].join('\n');
}

export type ApplyEventResult = {
  ok: boolean;
  /** No id, no phone, or no CRM lead on that number — nothing to log. */
  skipped?: boolean;
  reason?: string;
  leadId?: string;
  /** False when a later event for the same communication updated the existing row. */
  created?: boolean;
  /** True when the activity reached Close too. */
  mirrored?: boolean;
  warning?: string;
  error?: string;
};

/** The CRM lead this communication belongs to, by Aloware contact id then phone. */
async function resolveLead(event: AlowareEvent): Promise<LeadRow | null> {
  if (event.contactId) {
    // select('*') on purpose: naming aloware_contact_id would make the read itself
    // fail before the migration is run.
    const { data } = await db().from('crm_leads').select('*').eq('aloware_contact_id', event.contactId).limit(1).maybeSingle();
    if (data) return data as LeadRow;
  }
  if (!event.phone) return null;
  const hit = await findLeadByPhone(event.phone);
  if (!hit) return null;
  const { data } = await db().from('crm_leads').select('*').eq('id', hit.id).single();
  return (data as LeadRow) ?? null;
}

/**
 * Mirror one logged communication onto the Close timeline.
 *
 * Runs after the CRM row exists, and only on first insert — a recording arriving
 * later must not post the call to Close a second time. A lead that has never been
 * pushed to Close is pushed now: without a close_lead_id there's nothing to attach
 * the activity to, and syncLeadToClose is idempotent.
 *
 * Best-effort by design. A failure here leaves the call in the CRM (the source of
 * truth) and absent from Close, which is the right way round to be wrong; it's
 * logged rather than retried, because Aloware gives us no way to re-read the
 * communication later.
 */
async function mirrorToClose(lead: LeadRow, event: AlowareEvent): Promise<{ ok: boolean; error?: string }> {
  if (!closeConfigured() || !event.id) return { ok: false };

  let closeLeadId = str(lead.close_lead_id);
  if (!closeLeadId) {
    const pushed = await syncLeadToClose(lead);
    if (!pushed.ok || !pushed.id) return { ok: false, error: pushed.error ?? 'lead is not in Close yet' };
    closeLeadId = pushed.id;
  }

  const occurredAt = event.createdAt ?? undefined;
  const res =
    event.kind === 'sms'
      ? await closeLogSms({
          closeLeadId,
          direction: event.direction,
          text: event.body ?? '',
          localPhone: event.linePhone,
          remotePhone: event.phone,
          occurredAt,
        })
      : await closeLogCall({
          closeLeadId,
          externalId: event.id,
          direction: event.direction,
          durationSec: event.talkTimeSec || event.durationSec,
          disposition: event.disposition,
          phone: event.phone,
          // Capped: a long call's transcript can run to tens of thousands of
          // characters, and Close rejects an oversized activity outright — which
          // would lose the call record along with the transcript.
          note: [event.summary, event.transcription?.slice(0, 5000)].filter(Boolean).join('\n\n') || null,
          recordingUrl: event.recordingUrl,
          occurredAt,
        });

  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Apply one parsed Aloware webhook to the CRM, then to Close.
 *
 * Never throws: the caller is a webhook that must answer 200 even when the event is
 * about someone who isn't in the CRM, or when a downstream system is down. Aloware
 * retries non-2xx responses, and a retry storm on an event we can never match would
 * be worse than dropping it.
 */
export async function applyAlowareEvent(event: AlowareEvent): Promise<ApplyEventResult> {
  if (!event.id) return { ok: true, skipped: true, reason: 'event carried no communication id' };

  try {
    const lead = await resolveLead(event);
    if (!lead) {
      return { ok: true, skipped: true, reason: `no CRM lead on ${event.phone ?? 'that number'}` };
    }

    const content = describeAlowareEvent(event);
    const insert = await db()
      .from('crm_touchpoints')
      .insert({
        lead_id: lead.id,
        channel: event.kind === 'sms' ? 'sms' : 'call',
        direction: event.direction,
        content,
        external_id: externalId(event.id),
        created_at: event.createdAt || undefined,
      })
      .select('id')
      .single();

    if (insert.error) {
      if (insert.error.code !== UNIQUE_VIOLATION) {
        const missing = isMissingColumn(insert.error.message);
        return { ok: false, leadId: lead.id, error: missing ? MIGRATION_HINT : insert.error.message };
      }

      // A follow-up event for a call we already logged. Fold it into the existing
      // line rather than replacing it: Aloware sends the disposition, the
      // recording and the transcript as separate events in no guaranteed order,
      // so either one can be the newer while the other holds the better detail.
      const { data: existing } = await db()
        .from('crm_touchpoints')
        .select('content')
        .eq('external_id', externalId(event.id))
        .maybeSingle();

      const merged = existing ? mergeAlowareContent(String(existing.content ?? ''), content) : content;
      if (merged !== existing?.content) {
        await db().from('crm_touchpoints').update({ content: merged }).eq('external_id', externalId(event.id));
      }
      return { ok: true, leadId: lead.id, created: false };
    }

    // Bookkeeping happens exactly once, on the insert that won the race. An inbound
    // call is activity but is NOT a dial, and neither is a text — Dials Made counts
    // outbound calls only, same rule as the Twilio dialer.
    const isDial = event.kind === 'call' && event.direction === 'outbound';
    const label = await stageLabelFor(lead.pipeline_id as string | null, lead.stage as string);
    await stampLeadCadence(lead.id, {
      ...cadencePatch(lead as unknown as CadenceLead, { stageLabel: label, activity: true }),
      ...(isDial ? { dials_made: (Number(lead.dials_made) || 0) + 1 } : {}),
    });

    const mirror = await mirrorToClose(lead, event);
    return {
      ok: true,
      leadId: lead.id,
      created: true,
      mirrored: mirror.ok,
      warning: mirror.error ? `logged in the CRM, but not mirrored to Close: ${mirror.error}` : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'aloware event failed' };
  }
}

/* ── Outbound: CRM leads → Aloware contacts ───────────────────────────────── */

export type PushContactResult = {
  ok: boolean;
  skipped?: boolean;
  contactId?: string | null;
  created?: boolean;
  error?: string;
  warning?: string;
};

/**
 * Upsert one CRM lead into Aloware as a contact.
 *
 * The contact id is read back separately because Aloware's upsert answers with a
 * bare `{ message }`. A lookup that fails is only a warning: every other part of
 * this integration matches on the phone number, so the id is a convenience, not a
 * dependency.
 */
export async function pushLeadToAloware(lead: string | LeadRow): Promise<PushContactResult> {
  if (!alowareConfigured()) return { ok: false, skipped: true, error: 'Aloware is not configured (ALOWARE_API_TOKEN missing).' };

  try {
    let row: LeadRow | null = typeof lead === 'string' ? null : lead;
    if (typeof lead === 'string') {
      const { data } = await db().from('crm_leads').select('*').eq('id', lead).single();
      row = (data as LeadRow) ?? null;
    }
    if (!row) return { ok: false, error: 'Lead not found' };

    const phone = str(row.whatsapp);
    // A number Aloware will always reject is stamped as processed rather than
    // left pending. The sweep takes the oldest 100 unpushed leads each run, so
    // without this a handful of junk rows ("asdf", "demo demo") are retried every
    // ten minutes forever and permanently occupy slots real leads need. The stamp
    // records that we've dealt with the lead; aloware_contact_id stays null,
    // which is what distinguishes "nothing to push" from "pushed".
    if (!phone || !isValidPhone(phone)) {
      await writeWithOptionalColumns(
        'crm_leads',
        { aloware_synced_at: new Date().toISOString() },
        { id: row.id, optional: ALOWARE_SYNC_COLUMNS },
      );
      return { ok: true, skipped: true, error: `unusable phone number (${phone ?? 'none'})` };
    }

    const handle = str(row.ig_handle)?.replace(/^@+/, '') ?? null;
    const res = await alowareUpsertContact({
      phone,
      name: str(row.name) || (handle ? `@${handle}` : null),
      email: str(row.email),
      leadSource: str(row.source),
    });
    if (!res.ok) return { ok: false, error: res.error };

    const contactId = str(row.aloware_contact_id) ?? (await alowareFindContactId(phone));

    const write = await writeWithOptionalColumns(
      'crm_leads',
      { aloware_contact_id: contactId, aloware_synced_at: new Date().toISOString() },
      { id: row.id, optional: ALOWARE_SYNC_COLUMNS },
    );

    return {
      ok: true,
      created: res.created,
      contactId,
      warning: write.error
        ? isMissingColumn(write.error.message)
          ? `the Aloware link could not be saved. ${MIGRATION_HINT}`
          : `the Aloware link could not be saved: ${write.error.message}`
        : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'aloware push failed' };
  }
}

/**
 * Push a lead to Aloware without making the caller wait.
 *
 * The 10-minute sweep would get there eventually, but "eventually" is the wrong
 * answer for a VSL booking or a partial submit: those are dialled while the lead
 * is still warm, and a number that rings before the push has run shows up in
 * Aloware as an unknown caller.
 *
 * Runs in `after()` for the same reason queueCloseSync does — a bare floating
 * promise can be cut off when a serverless invocation freezes. Failures are only
 * logged; the sweep is the backstop.
 */
export function queueAlowareSync(leadId: string | null | undefined, context: string): void {
  if (!leadId || !alowareConfigured()) return;
  const push = () => pushLeadToAloware(leadId).then((r) => {
    if (!r.ok && !r.skipped) console.error(`[aloware-sync:${context}] ${leadId}: ${r.error}`);
    else if (r.warning) console.warn(`[aloware-sync:${context}] ${leadId}: ${r.warning}`);
  });
  try {
    after(push);
  } catch {
    // Outside a request scope (a script, a test) after() throws — just run it.
    void push();
  }
}

/** Run `fn` over `items` with at most `size` in flight. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export type AlowareBatchResult = {
  ok: boolean;
  skipped?: boolean;
  pushed: number;
  created: number;
  failed: number;
  /** Phone Aloware would always reject — stamped so it stops being retried. */
  unusable: number;
  /** Leads with a phone that still aren't in Aloware after this batch. */
  pending: number;
  errors: string[];
  error?: string;
};

const emptyBatch: AlowareBatchResult = { ok: true, pushed: 0, created: 0, failed: 0, unusable: 0, pending: 0, errors: [] };

/**
 * Push a bounded batch of never-pushed leads into Aloware.
 *
 * Bounded for the same reason the Close backfill is: a 5,000-row CSV import
 * shouldn't become 5,000 Aloware calls inside one request. Call it until `pending`
 * reaches 0. Leads with no phone number are excluded at the query — Aloware keys
 * contacts on the number and would reject them anyway.
 *
 * Turn the whole push off with ALOWARE_SYNC_CONTACTS=0 and the inbound webhook
 * keeps working: matching falls back to the phone number, which needs nothing here.
 */
export async function syncLeadsToAloware(opts: { limit?: number } = {}): Promise<AlowareBatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? ALOWARE_BATCH_SIZE, 1), 200);
  if (!alowareConfigured()) return { ...emptyBatch, ok: false, skipped: true, error: 'Aloware is not configured (ALOWARE_API_TOKEN missing).' };
  if ((process.env.ALOWARE_SYNC_CONTACTS || '').trim() === '0') {
    return { ...emptyBatch, skipped: true, error: 'Contact push disabled (ALOWARE_SYNC_CONTACTS=0).' };
  }

  const { data, error } = await db()
    .from('crm_leads')
    .select('*')
    .is('aloware_synced_at', null)
    .not('whatsapp', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    return { ...emptyBatch, ok: false, error: isMissingColumn(error.message) ? MIGRATION_HINT : error.message };
  }

  const batch = (data as LeadRow[]) ?? [];
  const out: AlowareBatchResult = { ...emptyBatch, errors: [] };
  if (!batch.length) return out;

  const results = await mapPool(batch, CONCURRENCY, pushLeadToAloware);
  results.forEach((r, i) => {
    if (r.ok && r.skipped) {
      out.unusable += 1;
    } else if (r.ok) {
      out.pushed += 1;
      if (r.created) out.created += 1;
      if (r.warning && out.errors.length < 8) out.errors.push(`${batch[i].name || batch[i].whatsapp || batch[i].id}: ${r.warning}`);
    } else if (!r.ok) {
      out.failed += 1;
      if (out.errors.length < 8) out.errors.push(`${batch[i].name || batch[i].whatsapp || batch[i].id}: ${r.error}`);
    }
  });

  const { count } = await db()
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .is('aloware_synced_at', null)
    .not('whatsapp', 'is', null);
  out.pending = count ?? 0;
  out.ok = out.failed === 0;
  return out;
}
