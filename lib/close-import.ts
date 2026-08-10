// Close → CRM: the one place the mirror runs backwards.
//
// lib/close-sync.ts states the rule this file breaks: the CRM owns lead data and
// nothing reads it back out of Close. That held while every Close lead had come
// from the CRM. It stopped being true when ~740 contacts were created directly in
// Close — a bulk import plus a daily trickle from the team — and those people were
// invisible here.
//
// That invisibility is not cosmetic. The Aloware webhook attaches a call to a *CRM
// lead*; a contact that exists only in Close gets no timeline entry, no dial count,
// and nothing mirrored back, so Close's own call counter never moves for them
// either. Importing them is what makes calling them work at all.
//
// Deliberately narrow, so this stays a one-time-shaped operation rather than a
// second source of truth:
//   • only leads with a phone number — Aloware keys contacts on the number and
//     rejects the rest, and a lead nobody can dial isn't what this is for
//   • never a lead already linked to a CRM row
//   • never a lead bearing our own sync markers. Those are leads the CRM pushed
//     and whose CRM row has since been deleted; re-importing would resurrect them
//   • one CRM row per phone number. Close has 59 numbers spread across 205 leads,
//     and findLeadByPhone() returns the first match — duplicates here would
//     scatter a person's calls across several rows at random
//
// Imported leads land with next_followup_at null on purpose. The Due Today queue
// filters on that stored column (app/admin/page.tsx), so a few hundred imported
// leads appear on the board and in Aloware without stampeding the setters' queue.
// They join the cadence the moment someone actually touches one.

import { db } from '@/lib/kv';
import { normalizePhone } from '@/lib/contact-format';
import { writeWithOptionalColumns } from '@/lib/db-write';
import { CADENCE_COLUMNS } from '@/lib/crm-followup';
import { closeConfigured, closeListLeads, type CloseLeadRecord } from '@/lib/close';
import { CLOSE_SYNC_COLUMNS } from '@/lib/close-sync';
import { ALOWARE_SYNC_COLUMNS } from '@/lib/aloware-sync';

/** How many CRM rows one run may create. The backfill drains over several passes. */
export const IMPORT_BATCH_SIZE = 100;

/** Safety cap on how many Close leads a single run will page through. */
const MAX_SCAN = 5000;

/** The pipeline imported leads land in — these are leads the team dials. */
const TARGET_PIPELINE = 'Sales Pipeline';

/** Fallback stage when Close's status says nothing more specific. */
const DEFAULT_STAGE = 'new';

const str = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

/** Last 9 digits — the same key findLeadByPhone matches on. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-9) : null;
}

/**
 * Whether this Close lead was written by our own sync.
 *
 * Checked before importing: a lead carrying our markers but with no CRM row means
 * the CRM row was deleted after being pushed. Importing it would undo that
 * deletion, which is the opposite of what whoever deleted it wanted.
 */
export function isOwnSyncArtifact(lead: CloseLeadRecord): boolean {
  const custom = (lead.custom ?? {}) as Record<string, unknown>;
  const nested = (custom.custom ?? {}) as Record<string, unknown>;
  return /Synced from the Goh Consulting CRM/.test(lead.description ?? '') || !!nested['CRM Stage'];
}

/**
 * Close's lead status → a CRM stage and qualification.
 *
 * Close's vocabulary is its own ("Dialed - No Answer", "No Dial - Disqualified")
 * and doesn't line up with our stage keys, so this is a mapping rather than a
 * copy. Tested longest-signal-first: "Dialed - Disqualified" has to read as
 * disqualified, not as a dial.
 */
export function stageFromCloseStatus(statusLabel: string | null | undefined): { stage: string; status: string | null } {
  const s = (statusLabel ?? '').toLowerCase();
  if (/disqualif/.test(s)) return { stage: 'dq', status: 'DQ' };
  if (/not interested/.test(s)) return { stage: 'closed_lost', status: null };
  if (/not good time|no availability|nurtur/.test(s)) return { stage: 'nurturing', status: null };
  if (/booked|confirmed/.test(s)) return { stage: 'call_booked', status: null };
  if (/dialed|no answer|contacted/.test(s)) return { stage: 'contacted', status: null };
  return { stage: DEFAULT_STAGE, status: null };
}

/** The lead's best phone: a mobile if Close labelled one, else the first on file. */
function pickPhone(lead: CloseLeadRecord): string | null {
  const phones = (lead.contacts ?? []).flatMap((c) => c.phones ?? []).filter((p) => str(p.phone));
  const mobile = phones.find((p) => /mobile|cell/i.test(p.type ?? ''));
  const chosen = str((mobile ?? phones[0])?.phone);
  return chosen ? normalizePhone(chosen) : null;
}

function pickEmail(lead: CloseLeadRecord): string | null {
  return str((lead.contacts ?? []).flatMap((c) => c.emails ?? []).map((e) => e.email).find(Boolean));
}

/** Instagram handle out of the Socials custom field, when Close has one. */
function pickHandle(lead: CloseLeadRecord): string | null {
  const nested = ((lead.custom ?? {}) as Record<string, unknown>).custom as Record<string, unknown> | undefined;
  const socials = str(nested?.['Socials']);
  const handle = socials?.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
  return handle ?? null;
}

/** The subset of an existing CRM lead the merge needs to see. */
type ExistingLead = {
  id: string;
  name: string | null;
  email: string | null;
  ig_handle: string | null;
  notes: string | null;
  source: string | null;
  tags: string[] | null;
  close_lead_id: string | null;
};

/** A freshly-built crm_leads row, seen as an existing lead for in-run merging. */
const asExisting = (id: string, row: Record<string, unknown>): ExistingLead => ({
  id,
  name: (row.name as string | null) ?? null,
  email: (row.email as string | null) ?? null,
  ig_handle: (row.ig_handle as string | null) ?? null,
  notes: (row.notes as string | null) ?? null,
  source: (row.source as string | null) ?? null,
  tags: (row.tags as string[] | null) ?? null,
  close_lead_id: (row.close_lead_id as string | null) ?? null,
});

/**
 * What to change on a CRM lead that already holds this Close lead's phone number.
 *
 * Fills gaps only — never overwrites a value the CRM already has. The CRM is the
 * source of truth for lead data, and a name or note someone typed here outranks
 * whatever Close was seeded with. Stage, status, pipeline and the cadence columns
 * are untouched on purpose: those are working state, and a Close status from
 * months ago shouldn't silently move a lead across the board.
 *
 * Returns an empty patch when there is nothing to add, so a re-run is a no-op
 * rather than a write.
 */
export function backfillPatch(existing: ExistingLead, lead: CloseLeadRecord): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const fill = (key: keyof ExistingLead, value: string | null) => {
    if (value && !str(existing[key] as string | null)) patch[key] = value;
  };

  fill('name', str(lead.display_name) ?? str((lead.contacts ?? [])[0]?.name));
  fill('email', pickEmail(lead));
  fill('ig_handle', pickHandle(lead));
  fill('notes', str(lead.description));

  const nested = ((lead.custom ?? {}) as Record<string, unknown>).custom as Record<string, unknown> | undefined;
  fill('source', str(nested?.['CRM Source']));
  if (!existing.tags?.length) {
    const tags = str(nested?.['CRM Tags'])?.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags?.length) patch.tags = tags;
  }

  // Linking matters most: an unlinked CRM lead whose phone is already in Close
  // would otherwise have a *second* Close lead created for it on the next push.
  // Only ever fills an empty link — never repoints an existing one.
  if (!str(existing.close_lead_id)) patch.close_lead_id = lead.id;

  return patch;
}

/** Everything one Close lead becomes as a crm_leads row. */
export function crmRowFromCloseLead(lead: CloseLeadRecord, pipelineId: string | null): Record<string, unknown> {
  const { stage, status } = stageFromCloseStatus(lead.status_label);
  const nested = ((lead.custom ?? {}) as Record<string, unknown>).custom as Record<string, unknown> | undefined;
  const tags = str(nested?.['CRM Tags'])?.split(',').map((t) => t.trim()).filter(Boolean);

  return {
    name: str(lead.display_name) ?? str((lead.contacts ?? [])[0]?.name),
    email: pickEmail(lead),
    whatsapp: pickPhone(lead),
    ig_handle: pickHandle(lead),
    // Real provenance, not a label: without it these are indistinguishable from
    // funnel opt-ins and every source-based report silently becomes wrong.
    source: str(nested?.['CRM Source']) ?? 'close',
    status,
    stage,
    pipeline_id: pipelineId,
    tags: tags?.length ? tags : null,
    notes: str(lead.description),
    // When the person actually came in, not when this import ran.
    created_at: str(lead.date_created) ?? undefined,
    last_activity_at: str(lead.date_updated) ?? str(lead.date_created) ?? undefined,
    // Left null so the import doesn't dump hundreds of leads into Due Today.
    next_followup_at: null,
    close_lead_id: lead.id,
    close_opportunity_id: str((lead.opportunities ?? [])[0]?.id),
    // Already in Close by definition — no need for the sweep to push it straight back.
    close_synced_at: new Date().toISOString(),
  };
}

export type CloseImportResult = {
  ok: boolean;
  dryRun: boolean;
  skipped?: boolean;
  scanned: number;
  /** Already linked to a CRM row. */
  alreadyLinked: number;
  /** Bears our sync markers — a deleted CRM row, deliberately not resurrected. */
  ownArtifacts: number;
  noPhone: number;
  /** Phone matched an existing CRM lead, which was filled in rather than duplicated. */
  updated: number;
  /** Phone matched, and the CRM lead already had everything Close knows. */
  unchanged: number;
  created: number;
  failed: number;
  /** Still importable after this batch's limit was reached. */
  pending: number;
  samples: { name: string | null; phone: string | null; stage: string; closeStatus: string | null }[];
  errors: string[];
  error?: string;
};

const emptyResult: CloseImportResult = {
  ok: true, dryRun: true, scanned: 0, alreadyLinked: 0, ownArtifacts: 0, noPhone: 0,
  updated: 0, unchanged: 0, created: 0, failed: 0, pending: 0, samples: [], errors: [],
};

/**
 * Import Close-only contacts into the CRM.
 *
 * Dry-run by default, and the caller has to opt out explicitly. This creates
 * hundreds of rows in the working CRM on its first real pass, which is not
 * something a mistyped query parameter should be able to do.
 */
export async function importCloseLeads(
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<CloseImportResult> {
  const limit = Math.min(Math.max(opts.limit ?? IMPORT_BATCH_SIZE, 1), 500);
  const dryRun = opts.dryRun !== false;
  const out: CloseImportResult = { ...emptyResult, dryRun, samples: [], errors: [] };

  if (!closeConfigured()) return { ...out, ok: false, skipped: true, error: 'Close is not configured (CLOSE_API_KEY missing).' };

  // Which Close leads we already hold, and which CRM lead owns each phone number.
  const { data: existing, error } = await db()
    .from('crm_leads')
    .select('id, name, email, whatsapp, ig_handle, notes, source, tags, close_lead_id')
    .limit(5000);
  if (error) return { ...out, ok: false, error: error.message };

  const linked = new Set((existing ?? []).map((r) => str(r.close_lead_id)).filter(Boolean) as string[]);

  // phone → the CRM lead holding it. Where the CRM already has two rows on one
  // number (14 of them do), the first wins — the same row findLeadByPhone would
  // pick, so a merge lands on whichever lead the call logging would have used.
  const byPhone = new Map<string, ExistingLead>();
  for (const r of existing ?? []) {
    const key = phoneKey(str(r.whatsapp));
    if (key && !byPhone.has(key)) byPhone.set(key, r as ExistingLead);
  }

  const { data: pipeline } = await db().from('crm_pipelines').select('id').eq('name', TARGET_PIPELINE).maybeSingle();
  const pipelineId = (pipeline?.id as string | undefined) ?? null;
  if (!pipelineId) out.errors.push(`No "${TARGET_PIPELINE}" pipeline — imported leads will have no board placement.`);

  for (let skip = 0; skip < MAX_SCAN; skip += 100) {
    const page = await closeListLeads({ limit: 100, skip });
    if (!page.ok) {
      out.ok = false;
      out.errors.push(page.error ?? 'Close request failed');
      break;
    }
    if (!page.leads.length) break;

    for (const lead of page.leads) {
      out.scanned += 1;

      if (linked.has(lead.id)) { out.alreadyLinked += 1; continue; }
      if (isOwnSyncArtifact(lead)) { out.ownArtifacts += 1; continue; }

      const phone = pickPhone(lead);
      const key = phoneKey(phone);
      if (!key) { out.noPhone += 1; continue; }

      // Batch full: count what's left rather than stopping the scan, so the
      // caller knows how many more passes to run.
      if (out.created + out.updated >= limit) { out.pending += 1; continue; }

      // Someone already holds this number. Fill their gaps instead of creating a
      // second row for the same person — a duplicate here would split their call
      // history, because findLeadByPhone picks one row and the other never sees a
      // dial. Covers both "already in the CRM" and "Close lists them twice".
      const hit = byPhone.get(key);
      if (hit) {
        const patch = backfillPatch(hit, lead);
        if (!Object.keys(patch).length) { out.unchanged += 1; continue; }

        if (!dryRun) {
          const write = await writeWithOptionalColumns('crm_leads', patch, {
            id: hit.id,
            optional: [...CLOSE_SYNC_COLUMNS, ...ALOWARE_SYNC_COLUMNS, ...CADENCE_COLUMNS],
          });
          if (write.error) {
            out.failed += 1;
            if (out.errors.length < 8) out.errors.push(`${hit.name ?? hit.id}: ${write.error.message}`);
            continue;
          }
          // Keep the in-memory copy current so a second Close lead on the same
          // number this run sees the merged state and reports unchanged.
          Object.assign(hit, patch);
          if (patch.close_lead_id) linked.add(lead.id);
        }
        out.updated += 1;
        continue;
      }

      const row = crmRowFromCloseLead(lead, pipelineId);
      if (out.samples.length < 5) {
        out.samples.push({ name: row.name as string | null, phone, stage: row.stage as string, closeStatus: str(lead.status_label) });
      }

      if (dryRun) {
        out.created += 1;
        // Register the row this run *would* create, so a second Close lead on the
        // same number is counted as a merge rather than another create and the
        // dry-run totals match what a real run does.
        byPhone.set(key, asExisting(`dry:${lead.id}`, row));
        continue;
      }

      const write = await writeWithOptionalColumns('crm_leads', row, {
        optional: [...CLOSE_SYNC_COLUMNS, ...ALOWARE_SYNC_COLUMNS, ...CADENCE_COLUMNS],
      });
      if (write.error) {
        out.failed += 1;
        if (out.errors.length < 8) out.errors.push(`${row.name ?? lead.id}: ${write.error.message}`);
        continue;
      }
      out.created += 1;
      linked.add(lead.id);
      // Same reason as the dry-run branch: the next Close lead carrying this
      // number must merge into the row we just made, not create a twin.
      byPhone.set(key, asExisting(String((write.data as { id?: string } | null)?.id ?? ''), row));
    }

    if (!page.hasMore) break;
  }

  out.ok = out.ok && out.failed === 0;
  return out;
}
