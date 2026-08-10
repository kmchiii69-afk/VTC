// Mirrors the CRM into Close — the backfill of everything already there, and the
// ongoing push for every new lead (ads / VSL / freebie / IG / manual).
//
// What gets mirrored, per lead:
//   • the lead itself — name + a contact carrying email/phone so Close can dial
//   • its notes, as one Close note activity that's kept up to date
//   • its tags, source and stage, as Close lead custom fields
//   • an opportunity parked on the Close pipeline stage matching its CRM stage
//
// Each crm_pipelines row is mirrored as a Close opportunity pipeline of the same
// name with the same stages, so the Close pipeline board reads like the CRM board.
//
// One-way by design: this app's CRM is the source of truth for lead data, Close is
// where the calling happens. Nothing here reads lead fields back out of Close; call
// activity comes back separately (closeListCalls, see lib/close.ts).
//
// Two triggers, both idempotent:
//   1. Entry points call queueCloseSync() the moment a lead lands, so a fresh ad or
//      VSL lead is dialable in Close within seconds.
//   2. app/api/cron/close-sync sweeps anything the hooks missed (CSV imports,
//      ManyChat, direct DB edits) and re-pushes leads edited since their last sync.
//
// crm_leads.close_lead_id / close_opportunity_id / close_synced_at come from
// supabase/close_kit_integration.sql. Until that's run every function here degrades
// to a clear error instead of throwing — the CRM keeps working, only the mirror waits.

import { after } from 'next/server';
import { db } from '@/lib/kv';
import { normalizePhone } from '@/lib/contact-format';
import {
  closeConfigured, closeEnsurePipeline, closeFindLeadId, closeListCalls, closeSyncNote,
  closeUpsertLead, closeUpsertOpportunity, isCloseExternalEcho,
  type CloseCall, type CloseStatusType,
} from '@/lib/close';
import { writeWithOptionalColumns } from '@/lib/db-write';
import { stampLeadCadence, stageLabelFor } from '@/lib/crm-leads';
import { cadencePatch, type CadenceLead } from '@/lib/crm-followup';

/** Columns added by supabase/close_kit_integration.sql. */
export const CLOSE_SYNC_COLUMNS = ['close_lead_id', 'close_opportunity_id', 'close_synced_at'] as const;

export const MIGRATION_HINT =
  'Close sync needs crm_leads.close_lead_id, close_opportunity_id and close_synced_at — run supabase/close_kit_integration.sql in the Supabase SQL editor.';

/**
 * Our own link-write bumps updated_at (the set_crm_leads_updated_at trigger fires
 * on every UPDATE), landing it a hair after close_synced_at. Without a skew window
 * every lead would look "edited since last sync" forever and the cron would re-push
 * the whole table every run.
 */
const SYNC_SKEW_MS = 60_000;

/** How many leads one sweep/backfill batch pushes. Each lead is 3-5 Close calls. */
export const CLOSE_BATCH_SIZE = 50;

/** Close rate-limits bursts, so pushes run a few at a time (never all at once). */
const CONCURRENCY = 4;

type LeadRow = Record<string, unknown> & { id: string };

const str = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};
const tagsOf = (l: LeadRow) => (Array.isArray(l.tags) ? l.tags.map((t) => String(t).trim()).filter(Boolean) : []);
const isMissingColumn = (message: string) => CLOSE_SYNC_COLUMNS.some((c) => message.toLowerCase().includes(c));

/* ── Pipeline mirroring ───────────────────────────────────────────────────── */

export type PipelineInfo = {
  name: string;
  /** CRM stage key → stage label. */
  labels: Map<string, string>;
  /** CRM stage key → Close opportunity status id. */
  statuses: Map<string, string>;
};
export type PipelineMap = Map<string, PipelineInfo>;

/**
 * Which kind of Close status a CRM stage is: Close marks each pipeline stage
 * active / won / lost, and its reporting counts on that being right.
 *
 * Lost is tested first on purpose — "No-Close" would otherwise read as a win off
 * the word "close". Cancelled stays active: those leads get re-booked, they aren't
 * dead.
 */
export function stageStatusType(stageKey: string, label: string): CloseStatusType {
  const n = `${stageKey} ${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (/(^|_)(closed_lost|lost|ghosted|dq|disqualified|no_close)(_|$)/.test(n)) return 'lost';
  if (/(^|_)(closed_won|won|customer|closed)(_|$)/.test(n)) return 'won';
  return 'active';
}

export type MirrorResult = {
  ok: boolean;
  pipelines: PipelineMap;
  created: string[];
  addedStages: string[];
  errors: string[];
};

/**
 * Ensure every CRM pipeline exists in Close with the same stages, and return the
 * stage-key → Close-status-id map each lead's opportunity needs.
 *
 * Idempotent: a pipeline that already matches costs one read and no writes, so this
 * is safe to call on every single-lead sync.
 */
export async function mirrorPipelinesToClose(): Promise<MirrorResult> {
  const out: MirrorResult = { ok: true, pipelines: new Map(), created: [], addedStages: [], errors: [] };
  if (!closeConfigured()) return { ...out, ok: false, errors: ['Close is not configured (CLOSE_API_KEY missing).'] };

  const { data, error } = await db().from('crm_pipelines').select('id, name, stages');
  if (error) return { ...out, ok: false, errors: [error.message] };

  for (const row of data ?? []) {
    const name = String(row.name ?? '').trim() || 'Pipeline';
    const stages = ((row.stages as { key: string; label: string }[] | null) ?? [])
      .filter((s) => s?.key && String(s.label ?? '').trim());
    const labels = new Map(stages.map((s) => [s.key, String(s.label).trim()]));
    const info: PipelineInfo = { name, labels, statuses: new Map() };
    out.pipelines.set(row.id as string, info);
    if (!stages.length) continue;

    const ensured = await closeEnsurePipeline(
      name,
      stages.map((s) => ({ label: String(s.label).trim(), type: stageStatusType(s.key, String(s.label)) })),
    );
    // A pipeline we couldn't mirror isn't fatal: its leads still sync as Close
    // leads, they just don't land on a board until the pipeline is fixed.
    if (!ensured.ok) { out.ok = false; out.errors.push(`${name}: ${ensured.error}`); }
    if (ensured.created) out.created.push(name);
    for (const stage of ensured.addedStages ?? []) out.addedStages.push(`${name} › ${stage}`);

    for (const [key, label] of labels) {
      const statusId = ensured.statuses?.get(label.toLowerCase());
      if (statusId) info.statuses.set(key, statusId);
    }
  }
  return out;
}

/* ── When the lead first came in ──────────────────────────────────────────── */

/** Funnel tables that record a dated submission, keyed by the lead's email. */
const FUNNEL_TABLES = [
  'freebie_optins',
  'vsl_applications',
  'ads_under_100k_applications',
  'ads_over_100k_ads_applications',
  'ads_over_100k_noads_applications',
] as const;

/**
 * email → earliest funnel submission date.
 *
 * `crm_leads.created_at` is when the ROW appeared, which for a CSV-imported list is
 * the import date, not the opt-in. Where the person also has a funnel submission on
 * file, the earlier of the two is closer to the truth. Loaded once per batch; a
 * live single-lead sync skips it, because a lead arriving through a funnel right now
 * has a created_at that already IS its opt-in moment.
 */
export async function funnelSubmissionDates(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const table of FUNNEL_TABLES) {
    const { data, error } = await db().from(table).select('email, submitted_at');
    if (error) continue; // a funnel table that doesn't exist yet simply adds nothing
    for (const row of data ?? []) {
      const email = String(row.email ?? '').trim().toLowerCase();
      const at = String(row.submitted_at ?? '');
      if (!email || !at) continue;
      const prev = out.get(email);
      if (!prev || at < prev) out.set(email, at);
    }
  }
  return out;
}

/** The date this lead first came in, as Close wants it (YYYY-MM-DD), plus the full
 *  timestamp for Close's own date_created. */
function firstSeen(lead: LeadRow, funnel?: Map<string, string>): { iso: string | null; day: string | null } {
  const created = str(lead.created_at);
  const email = str(lead.email)?.toLowerCase();
  const submitted = email && funnel ? funnel.get(email) : undefined;

  const candidates = [created, submitted].filter((v): v is string => !!v && Number.isFinite(Date.parse(v)));
  if (!candidates.length) return { iso: null, day: null };
  const iso = candidates.sort()[0];
  return { iso, day: new Date(iso).toISOString().slice(0, 10) };
}

/* ── Field mapping ────────────────────────────────────────────────────────── */

/** "VSL Pipeline › Booked" — where this lead sits, in words a caller understands. */
function stagePath(lead: LeadRow, pipelines: PipelineMap): string {
  const stageKey = String(lead.stage ?? '');
  const pipeline = lead.pipeline_id ? pipelines.get(String(lead.pipeline_id)) : undefined;
  // No pipeline row (or a stage key the pipeline dropped) → prettify the key itself.
  const label = pipeline?.labels.get(stageKey) ?? stageKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return pipeline ? `${pipeline.name} › ${label}` : label;
}

/**
 * Which of the org's Close lead statuses this lead belongs in.
 *
 * Matched on both our free-text status and the stage, since either can carry the
 * signal. A label the Close org doesn't have is dropped by closeStatusId(), so a
 * renamed status just leaves the lead on Close's default.
 */
export function closeStatusLabelFor(lead: LeadRow): string {
  const status = String(lead.status ?? '').toLowerCase();
  const stage = String(lead.stage ?? '').toLowerCase();
  const tags = tagsOf(lead).map((t) => t.toLowerCase());

  if (stage === 'closed_won' || status.includes('client') || status.includes('customer') || status.includes('won')) return 'Customer';
  if (status === 'dq' || status.includes('disqualif') || status.includes('bad fit') || tags.includes('disqualified')) return 'Bad Fit';
  if (stage === 'closed_lost' || stage === 'ghosted' || stage.includes('nurtur')) return 'Long-Term Nurture';
  return 'Potential';
}

/** Strip the internal ManyChat subscriber marker — it means nothing in Close. */
const cleanNotes = (lead: LeadRow) => (str(lead.notes) ?? '').replace(/\[mc:[^\]]+\]\s*/g, '').trim() || null;

/** The CRM context, as Close's lead description — everything a setter wants on
 *  screen before the line connects. */
export function describeLead(lead: LeadRow, stageText: string): string {
  const followUp = str(lead.next_followup_at)?.slice(0, 10) ?? null;
  const dials = Number(lead.dials_made);
  const handle = str(lead.ig_handle)?.replace(/^@+/, '') ?? null;

  const lines: (string | null)[] = [
    `Stage: ${stageText}`,
    lead.source ? `Source: ${str(lead.source)}` : null,
    lead.status ? `Qualification: ${str(lead.status)}` : null,
    lead.revenue ? `Revenue: ${str(lead.revenue)}` : null,
    lead.makes_money ? `Makes money from content: ${str(lead.makes_money)}` : null,
    lead.business ? `Business: ${str(lead.business)}` : null,
    lead.icp_tier ? `ICP tier: ${str(lead.icp_tier)}` : null,
    handle ? `Instagram: @${handle}` : null,
    tagsOf(lead).length ? `Tags: ${tagsOf(lead).join(', ')}` : null,
    Number.isFinite(dials) && dials > 0 ? `Dials logged: ${dials}` : null,
    followUp ? `Next follow-up: ${followUp}` : null,
    lead.ai_summary ? `\nAI summary: ${str(lead.ai_summary)}` : null,
    lead.ai_next_move ? `AI next move: ${str(lead.ai_next_move)}` : null,
  ];
  return [...lines.filter(Boolean), '\n(Synced from the Goh Consulting CRM.)'].join('\n');
}

/**
 * The Close lead this row should write to: its saved link, or an existing Close
 * lead worth adopting.
 *
 * Adoption is guarded on the Close lead being unclaimed. Matching on phone alone
 * finds strangers who share a number (an agency line, a partner's phone, a setter's
 * own mobile in test data) — without the guard those distinct CRM rows collapse
 * onto one Close lead and then fight over its fields and notes on every sync. One
 * CRM row, one Close lead; a genuine duplicate in the CRM shows up as a duplicate
 * in Close, which is honest and fixable in the CRM.
 */
async function resolveCloseLeadId(lead: LeadRow, email: string | null, phone: string | null): Promise<string | null> {
  const linked = str(lead.close_lead_id);
  if (linked) return linked;

  const found = await closeFindLeadId({ email, phone });
  if (!found) return null;

  const { data: claimed } = await db()
    .from('crm_leads')
    .select('id')
    .eq('close_lead_id', found)
    .neq('id', lead.id)
    .limit(1)
    .maybeSingle();
  return claimed ? null : found;
}

/** Everything closeUpsertLead needs for one lead. */
function closeInputFor(lead: LeadRow, stageText: string, closeLeadId: string | null, funnel?: Map<string, string>) {
  const handle = str(lead.ig_handle)?.replace(/^@+/, '') ?? null;
  const phone = str(lead.whatsapp);
  const tags = tagsOf(lead);
  const statusLabel = closeStatusLabelFor(lead);
  const linked = !!closeLeadId;
  const seen = firstSeen(lead, funnel);
  return {
    name: str(lead.name) || (handle ? `@${handle}` : null) || str(lead.email) || phone,
    email: str(lead.email),
    phone: phone ? normalizePhone(phone) : null,
    description: describeLead(lead, stageText),
    // Close's lead status is a field the team also sets by hand while working the
    // lead. A CRM decision (won → Customer, DQ → Bad Fit) still propagates, but a
    // re-sync never drags an already-linked lead back to the default "Potential" —
    // that would undo a setter's own call. The CRM stage still rules the pipeline
    // placement below, which is what the board reads.
    statusLabel: linked && statusLabel === 'Potential' ? null : statusLabel,
    custom: {
      // Close has no native lead tags, so the CRM's tags live in a text field —
      // which is what Close's smart views filter on anyway.
      'CRM Tags': tags.length ? tags.join(', ') : undefined,
      'CRM Stage': stageText,
      'CRM Source': str(lead.source) ?? undefined,
      // "Socials" is an existing text field in the Close org — reused, not created.
      Socials: handle ? `https://instagram.com/${handle}` : undefined,
    },
    // A real date field, so Close can sort and filter smart views on it. Needed
    // because Close won't let us correct date_created on a lead that already
    // exists — for the leads already pushed, this field is the opt-in date.
    customDates: { 'Opted In': seen.day ?? undefined },
    dateCreated: seen.iso,
    closeLeadId,
    // Resolution (and the unclaimed check) already happened in resolveCloseLeadId.
    matchExisting: false,
  };
}

/* ── Single lead ──────────────────────────────────────────────────────────── */

export type SyncOneResult = {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  created?: boolean;
  /** True when the lead's CRM stage has no matching Close pipeline stage. */
  unplaced?: boolean;
  error?: string;
  warning?: string;
};

/**
 * Push one lead to Close — lead, notes, opportunity — and remember the links.
 *
 * Accepts an id or an already-loaded row. Never throws: entry points call this as a
 * side effect and must not fail a funnel submission because Close is down.
 */
export async function syncLeadToClose(
  lead: string | LeadRow,
  opts: { pipelines?: PipelineMap; funnelDates?: Map<string, string> } = {},
): Promise<SyncOneResult> {
  if (!closeConfigured()) return { ok: false, skipped: true, error: 'Close is not configured (CLOSE_API_KEY missing).' };

  try {
    let row: LeadRow | null = typeof lead === 'string' ? null : lead;
    if (typeof lead === 'string') {
      // select('*') on purpose: naming close_lead_id would make the read itself
      // fail before the migration is run.
      const { data } = await db().from('crm_leads').select('*').eq('id', lead).single();
      row = (data as LeadRow) ?? null;
    }
    if (!row) return { ok: false, error: 'Lead not found' };

    const pipelines = opts.pipelines ?? (await mirrorPipelinesToClose()).pipelines;
    const stageText = stagePath(row, pipelines);

    const phone = str(row.whatsapp);
    const closeLeadId = await resolveCloseLeadId(row, str(row.email), phone ? normalizePhone(phone) : null);

    const res = await closeUpsertLead(closeInputFor(row, stageText, closeLeadId, opts.funnelDates));
    if (res.skipped) return { ok: false, skipped: true, error: 'Close is not configured (CLOSE_API_KEY missing).' };
    if (!res.ok || !res.id) return { ok: false, error: res.error || 'Close request failed' };

    const warnings: string[] = [];
    // Surface bad contact data instead of hiding it — an unreachable lead in Close
    // looks identical to a reachable one.
    if (res.droppedEmail) warnings.push(`Close rejected the email (${str(row.email)}) — synced without it`);
    if (res.droppedPhone) warnings.push(`Close rejected the phone (${phone}) — synced without it`);

    // Notes → a note on the Close timeline.
    const note = await closeSyncNote(res.id, cleanNotes(row));
    if (!note.ok) warnings.push(`notes not synced: ${note.error}`);

    // Pipeline placement: an opportunity on the Close stage matching the CRM stage.
    const statusId = row.pipeline_id ? pipelines.get(String(row.pipeline_id))?.statuses.get(String(row.stage)) : undefined;
    let opportunityId = str(row.close_opportunity_id);
    if (statusId) {
      const opp = await closeUpsertOpportunity({ closeLeadId: res.id, statusId, opportunityId });
      if (opp.ok && opp.id) opportunityId = opp.id;
      else warnings.push(`not placed on the Close pipeline: ${opp.error}`);
    }

    const { error } = await writeWithOptionalColumns(
      'crm_leads',
      {
        close_lead_id: res.id,
        close_opportunity_id: opportunityId,
        close_synced_at: new Date().toISOString(),
      },
      { id: row.id, optional: CLOSE_SYNC_COLUMNS },
    );
    // The link is what stops the next push creating a duplicate — a failure to save
    // it is reported, never swallowed as success.
    if (error) {
      warnings.push(
        isMissingColumn(error.message)
          ? `the Close link could not be saved. ${MIGRATION_HINT} Until then, re-syncing creates duplicates.`
          : `the Close link could not be saved: ${error.message}`,
      );
    }

    return {
      ok: true,
      id: res.id,
      created: res.created,
      unplaced: !!row.pipeline_id && !statusId,
      warning: warnings.length ? `Pushed to Close, but ${warnings.join('; ')}` : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'close sync failed' };
  }
}

/**
 * Push a lead to Close without making the caller wait.
 *
 * Runs in `after()` so the work happens once the response is sent but is still
 * awaited by the platform — a bare floating promise can be cut off when a
 * serverless invocation freezes. The lead is already saved in our CRM by the time
 * this runs, so a failure is only logged and the request still returns 200; the
 * cron sweep picks the lead up on its next pass either way.
 */
export function queueCloseSync(leadId: string | null | undefined, context: string): void {
  if (!leadId || !closeConfigured()) return;
  const push = () => syncLeadToClose(leadId).then((r) => {
    if (!r.ok && !r.skipped) console.error(`[close-sync:${context}] ${leadId}: ${r.error}`);
    else if (r.warning) console.warn(`[close-sync:${context}] ${leadId}: ${r.warning}`);
  });
  try {
    after(push);
  } catch {
    // Outside a request scope (a script, a test) after() throws — just run it.
    void push();
  }
}

/* ── Calls back from Close (the dialer feeding the CRM) ───────────────────── */

/** Close call ids already on each lead's timeline, keyed by CRM lead id. */
async function loggedCallIds(leadIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!leadIds.length) return out;
  const { data } = await db()
    .from('crm_touchpoints')
    .select('lead_id, content')
    .in('lead_id', leadIds)
    .eq('channel', 'call');
  for (const t of data ?? []) {
    const id = String(t.content ?? '').match(/\[close:([^\]]+)\]/)?.[1];
    if (!id) continue;
    const key = String(t.lead_id);
    if (!out.has(key)) out.set(key, new Set());
    out.get(key)!.add(id);
  }
  return out;
}

/**
 * Log a lead's Close calls on its CRM timeline and count the dials.
 *
 * Deduped on the `[close:<id>]` marker each touchpoint carries, so re-importing the
 * same call is a no-op. A real dial in Close is activity: it bumps dials_made and
 * rolls the follow-up date, which is what puts the lead back in Due Today — the
 * dialer feeds the cadence without anyone logging the call twice.
 */
export async function applyCloseCalls(
  lead: LeadRow,
  calls: CloseCall[],
  seen: Set<string> = new Set(),
): Promise<{ added: number; dials: number }> {
  // Calls we pushed into Close ourselves are already on this timeline — they came
  // from Aloware's webhook, which logged the touchpoint before mirroring it out.
  // Re-importing them would double every dial the team makes.
  const fresh = calls.filter((c) => c.id && !seen.has(c.id) && !isCloseExternalEcho(c.note));
  if (!fresh.length) return { added: 0, dials: 0 };

  await db().from('crm_touchpoints').insert(fresh.map((c) => ({
    lead_id: lead.id,
    channel: 'call',
    direction: c.direction === 'inbound' ? 'inbound' : 'outbound',
    content: `[close:${c.id}] ${c.disposition || 'call'} · ${c.duration}s${c.note ? ` · ${c.note}` : ''}`,
    created_at: c.date || undefined,
  })));

  const dials = fresh.filter((c) => c.direction !== 'inbound').length;
  const label = await stageLabelFor(lead.pipeline_id as string | null, lead.stage as string);
  await stampLeadCadence(lead.id, {
    ...cadencePatch(lead as unknown as CadenceLead, { stageLabel: label, activity: true }),
    ...(dials ? { dials_made: (Number(lead.dials_made) || 0) + dials } : {}),
  });
  return { added: fresh.length, dials };
}

export type CallImportResult = {
  ok: boolean;
  skipped?: boolean;
  calls: number;      // calls Close returned
  matched: number;    // …that belong to a lead we mirror
  added: number;      // …that weren't already on the timeline
  dials: number;      // of those, outbound
  leads: number;      // leads touched
  error?: string;
};

/**
 * Import everyone's recent Close dials in one pass.
 *
 * One org-wide request rather than one per lead, then fanned out to the CRM rows
 * holding those close_lead_ids. Calls Close couldn't attribute to a lead (lead_id
 * null) and calls on leads we don't mirror are skipped. Overlapping windows are
 * harmless — the marker dedupe makes a re-run a no-op — so the sweep just re-reads
 * the last few hundred calls instead of tracking a watermark that could skip one.
 */
export async function importCloseCalls(opts: { limit?: number; since?: string } = {}): Promise<CallImportResult> {
  const empty: CallImportResult = { ok: true, calls: 0, matched: 0, added: 0, dials: 0, leads: 0 };
  if (!closeConfigured()) return { ...empty, ok: false, skipped: true, error: 'Close is not configured (CLOSE_API_KEY missing).' };

  const res = await closeListCalls({ limit: opts.limit ?? 200, since: opts.since });
  if (!res.ok) return { ...empty, ok: false, error: res.error };
  const calls = (res.calls ?? []).filter((c) => c.leadId);
  empty.calls = res.calls?.length ?? 0;
  if (!calls.length) return empty;

  const byCloseLead = new Map<string, CloseCall[]>();
  for (const c of calls) {
    if (!byCloseLead.has(c.leadId!)) byCloseLead.set(c.leadId!, []);
    byCloseLead.get(c.leadId!)!.push(c);
  }

  const { data: rows, error } = await db()
    .from('crm_leads')
    .select('*')
    .in('close_lead_id', [...byCloseLead.keys()]);
  if (error) {
    return { ...empty, ok: false, error: isMissingColumn(error.message) ? MIGRATION_HINT : error.message };
  }
  const leads = (rows as LeadRow[]) ?? [];
  const seen = await loggedCallIds(leads.map((l) => l.id));

  const out = { ...empty, matched: 0 };
  for (const lead of leads) {
    const mine = byCloseLead.get(String(lead.close_lead_id)) ?? [];
    out.matched += mine.length;
    const applied = await applyCloseCalls(lead, mine, seen.get(lead.id) ?? new Set());
    out.added += applied.added;
    out.dials += applied.dials;
    if (applied.added) out.leads += 1;
  }
  return out;
}

/* ── Batch ────────────────────────────────────────────────────────────────── */

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

export type CloseSyncStatus = {
  configured: boolean;
  migrated: boolean;
  total: number;
  linked: number;
  pending: number;
  stale: number;
  error?: string;
};

/** Counts for the admin panel: how much of the CRM is mirrored into Close. */
export async function closeSyncStatus(): Promise<CloseSyncStatus> {
  const base: CloseSyncStatus = { configured: closeConfigured(), migrated: true, total: 0, linked: 0, pending: 0, stale: 0 };

  const { count: total } = await db().from('crm_leads').select('id', { count: 'exact', head: true });
  base.total = total ?? 0;

  // Probe with a real (non-head) select: a head request has no response body, so
  // PostgREST's "column does not exist" never reaches us and a missing migration
  // would read as a healthy zero.
  const probe = await db().from('crm_leads').select(`id, ${CLOSE_SYNC_COLUMNS.join(', ')}`).limit(1);
  if (probe.error) {
    const missing = isMissingColumn(probe.error.message);
    return { ...base, migrated: !missing, pending: base.total, error: missing ? MIGRATION_HINT : probe.error.message };
  }

  const { count: linked, error } = await db()
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .not('close_lead_id', 'is', null);
  if (error) return { ...base, pending: base.total, error: error.message || 'Could not count linked leads' };
  base.linked = linked ?? 0;
  base.pending = Math.max(0, base.total - base.linked);
  base.stale = (await staleLeads(500)).length;
  return base;
}

/** Linked leads edited since their last push (see SYNC_SKEW_MS). */
async function staleLeads(scan: number): Promise<LeadRow[]> {
  // PostgREST can't compare two columns, so the freshness test happens here. The
  // scan is bounded and ordered newest-edit-first: anything further back was
  // already swept.
  const { data, error } = await db()
    .from('crm_leads')
    .select('*')
    .not('close_lead_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(scan);
  if (error) return [];
  return ((data as LeadRow[]) ?? []).filter((l) => {
    const updated = Date.parse(String(l.updated_at ?? ''));
    const synced = Date.parse(String(l.close_synced_at ?? ''));
    if (!Number.isFinite(updated)) return false;
    if (!Number.isFinite(synced)) return true; // linked before we tracked sync times
    return updated - synced > SYNC_SKEW_MS;
  });
}

export type BatchResult = {
  ok: boolean;
  skipped?: boolean;
  pushed: number;
  created: number;
  updated: number;
  failed: number;
  unplaced: number;          // synced, but their CRM stage has no Close stage
  pending: number;           // never-synced leads still waiting after this batch
  pipelinesCreated: string[];
  stagesAdded: string[];
  errors: string[];
  error?: string;
};

const emptyBatch: BatchResult = {
  ok: true, pushed: 0, created: 0, updated: 0, failed: 0, unplaced: 0, pending: 0,
  pipelinesCreated: [], stagesAdded: [], errors: [],
};

/**
 * Push a bounded batch of leads to Close: never-synced ones first (the backfill),
 * then leads edited since their last push if there's room.
 *
 * Bounded on purpose — a 5,000-row CSV import shouldn't become 5,000 Close API
 * calls inside one request. Call it until `pending` reaches 0.
 */
export async function syncLeadsToClose(opts: { limit?: number; includeStale?: boolean } = {}): Promise<BatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? CLOSE_BATCH_SIZE, 1), 200);
  if (!closeConfigured()) return { ...emptyBatch, ok: false, skipped: true, error: 'Close is not configured (CLOSE_API_KEY missing).' };

  // Oldest leads first, so the backfill runs in the order they came in.
  const { data: fresh, error } = await db()
    .from('crm_leads')
    .select('*')
    .is('close_lead_id', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    return { ...emptyBatch, ok: false, error: isMissingColumn(error.message) ? MIGRATION_HINT : error.message };
  }

  const batch = [...((fresh as LeadRow[]) ?? [])];
  if (opts.includeStale && batch.length < limit) {
    batch.push(...(await staleLeads(500)).slice(0, limit - batch.length));
  }

  // Mirror the pipelines even when there's nothing to push — a new CRM pipeline or
  // stage should appear in Close whether or not a lead moved into it.
  const mirror = await mirrorPipelinesToClose();
  const out: BatchResult = {
    ...emptyBatch,
    pipelinesCreated: mirror.created,
    stagesAdded: mirror.addedStages,
    errors: [...mirror.errors],
  };
  if (!batch.length) {
    out.ok = mirror.ok;
    return out;
  }

  // Loaded once for the whole batch — this is the historical correction that a
  // per-lead sync doesn't need.
  const funnelDates = await funnelSubmissionDates();
  const results = await mapPool(batch, CONCURRENCY, (lead) => syncLeadToClose(lead, { pipelines: mirror.pipelines, funnelDates }));
  results.forEach((r, i) => {
    if (r.ok) {
      out.pushed += 1;
      if (r.created) out.created += 1; else out.updated += 1;
      if (r.unplaced) out.unplaced += 1;
      if (r.warning && out.errors.length < 8) out.errors.push(`${batch[i].name || batch[i].email || batch[i].id}: ${r.warning}`);
    } else {
      out.failed += 1;
      if (out.errors.length < 8) out.errors.push(`${batch[i].name || batch[i].email || batch[i].id}: ${r.error}`);
    }
  });

  const { count } = await db().from('crm_leads').select('id', { count: 'exact', head: true }).is('close_lead_id', null);
  out.pending = count ?? 0;
  out.ok = out.failed === 0 && mirror.ok;
  return out;
}
