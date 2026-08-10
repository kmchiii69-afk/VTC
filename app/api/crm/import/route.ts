import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { stageLabelFor } from '@/lib/crm-leads';
import { newLeadCadence, CADENCE_COLUMNS } from '@/lib/crm-followup';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

interface ImportRow {
  name?: string;
  email?: string;
  whatsapp?: string;
  ig_handle?: string;
  revenue?: string;
  status?: string;
  makes_money?: string;
  source?: string;
  notes?: string;
  tags?: string[];
}

const MAX_ROWS = 5000;

const clean = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};
const normIg = (v: unknown) => {
  const s = clean(v);
  return s ? s.replace(/^@/, '').trim() || null : null;
};
const cleanTags = (v: unknown) =>
  Array.isArray(v) ? Array.from(new Set(v.map((t) => String(t).trim()).filter(Boolean))) : [];

// POST /api/crm/import
// body: { pipeline_id, stage, rows: ImportRow[] }
// Dedups against existing leads by ig_handle (then email): existing leads get
// their tags merged and blank fields filled in — their stage/pipeline are left
// untouched so an import never drags a lead backwards. New leads are inserted.
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const pipelineId: string | null = b.pipeline_id || null;
  const stage: string = (b.stage && String(b.stage).trim()) || 'new';
  const rows: ImportRow[] = Array.isArray(b.rows) ? b.rows : [];
  // Opt-in: a list you intend to actually work enters the follow-up cadence
  // (first touch tomorrow). Off by default — a bulk freebie/opt-in list would
  // otherwise land in Due Today all at once and bury the real queue.
  const startFollowups: boolean = b.start_followups === true;

  if (rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 400 });

  // Normalize incoming rows; drop rows with no usable identity.
  const incoming = rows
    .map((r) => ({
      ig_handle: normIg(r.ig_handle),
      email: clean(r.email),
      whatsapp: clean(r.whatsapp),
      name: clean(r.name),
      revenue: clean(r.revenue),
      status: clean(r.status),
      makes_money: clean(r.makes_money),
      source: clean(r.source) || 'freebie',
      notes: clean(r.notes),
      tags: cleanTags(r.tags),
    }))
    .filter((r) => r.ig_handle || r.email || r.whatsapp || r.name);

  if (incoming.length === 0) return NextResponse.json({ error: 'No valid rows (each needs a name, email, phone, or IG handle)' }, { status: 400 });

  // Look up existing leads that match by handle or email.
  const handles = Array.from(new Set(incoming.map((r) => r.ig_handle).filter(Boolean))) as string[];
  const emails = Array.from(new Set(incoming.map((r) => r.email).filter(Boolean))) as string[];

  const existing: { id: string; ig_handle: string | null; email: string | null; name: string | null; whatsapp: string | null; revenue: string | null; status: string | null; makes_money: string | null; tags: string[] | null }[] = [];
  const fields = 'id, ig_handle, email, name, whatsapp, revenue, status, makes_money, tags';
  if (handles.length) {
    const { data } = await db().from('crm_leads').select(fields).in('ig_handle', handles);
    if (data) existing.push(...data);
  }
  if (emails.length) {
    const { data } = await db().from('crm_leads').select(fields).in('email', emails);
    if (data) existing.push(...data);
  }
  const byHandle = new Map(existing.filter((e) => e.ig_handle).map((e) => [e.ig_handle!.toLowerCase(), e]));
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]));

  const idOf = (r: typeof incoming[number]) => r.ig_handle ? `@${r.ig_handle}` : r.email || r.whatsapp || r.name || '(row)';
  const skippedExamples: string[] = [];

  // Collapse duplicate rows WITHIN the CSV (same ig_handle, else same email) so
  // the batch insert can't violate the unique ig_handle index against itself.
  const mergedMap = new Map<string, typeof incoming[number]>();
  const identityless: typeof incoming = [];
  for (const r of incoming) {
    const key = r.ig_handle ? `ig:${r.ig_handle.toLowerCase()}`
      : r.email ? `em:${r.email.toLowerCase()}` : null;
    if (!key) { identityless.push(r); continue; }
    const prev = mergedMap.get(key);
    if (!prev) { mergedMap.set(key, { ...r, tags: [...r.tags] }); continue; }
    if (skippedExamples.length < 20) skippedExamples.push(`${idOf(r)} — duplicate in sheet`);
    prev.tags = Array.from(new Set([...prev.tags, ...r.tags]));
    prev.name = prev.name || r.name;
    prev.email = prev.email || r.email;
    prev.whatsapp = prev.whatsapp || r.whatsapp;
    prev.revenue = prev.revenue || r.revenue;
    prev.status = prev.status || r.status;
    prev.makes_money = prev.makes_money || r.makes_money;
  }
  const deduped = [...mergedMap.values(), ...identityless];
  const duplicatesInSheet = incoming.length - deduped.length;

  const cadence = startFollowups
    ? newLeadCadence(stage, await stageLabelFor(pipelineId, stage))
    : {};

  const toInsert: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const touchedIds = new Set<string>();

  for (const r of deduped) {
    const match =
      (r.ig_handle && byHandle.get(r.ig_handle.toLowerCase())) ||
      (r.email && byEmail.get(r.email.toLowerCase())) ||
      null;

    if (match && !touchedIds.has(match.id)) {
      touchedIds.add(match.id);
      const mergedTags = Array.from(new Set([...(match.tags || []), ...r.tags]));
      const patch: Record<string, unknown> = { tags: mergedTags };
      // Only fill fields that are currently empty — never overwrite real data.
      if (!match.name && r.name) patch.name = r.name;
      if (!match.email && r.email) patch.email = r.email;
      if (!match.whatsapp && r.whatsapp) patch.whatsapp = r.whatsapp;
      if (!match.revenue && r.revenue) patch.revenue = r.revenue;
      if (!match.status && r.status) patch.status = r.status;
      if (!match.makes_money && r.makes_money) patch.makes_money = r.makes_money;
      updates.push({ id: match.id, patch });
    } else if (!match) {
      toInsert.push({
        ig_handle: r.ig_handle,
        email: r.email,
        whatsapp: r.whatsapp,
        name: r.name,
        revenue: r.revenue,
        status: r.status,
        makes_money: r.makes_money,
        source: r.source,
        notes: r.notes,
        tags: r.tags,
        stage,
        pipeline_id: pipelineId,
        updated_at: new Date().toISOString(),
        ...cadence,
      });
    }
  }

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  if (toInsert.length) {
    // ignoreDuplicates: if a handle already exists but slipped past the match
    // (e.g. differing case), skip it rather than erroring the whole batch.
    const upsert = (batch: Record<string, unknown>[]) => db()
      .from('crm_leads')
      .upsert(batch, { onConflict: 'ig_handle', ignoreDuplicates: true })
      .select('id');

    let { data, error } = await upsert(toInsert);
    // Retry without the cadence columns if supabase-crm-followup-cadence.sql
    // hasn't been run yet (see lib/db-write.ts for the same fallback).
    if (error && CADENCE_COLUMNS.some((c) => error!.message.toLowerCase().includes(c))) {
      ({ data, error } = await upsert(toInsert.map((r) => {
        const copy = { ...r };
        for (const c of CADENCE_COLUMNS) delete copy[c];
        return copy;
      })));
    }
    if (error) errors.push(`insert: ${error.message}`);
    else inserted = data?.length ?? 0;
  }
  // Rows we tried to insert but the DB already had (handle collision, e.g. a
  // capitalisation difference the matcher missed). Can't pinpoint which without
  // an extra query, so report the count only.
  const alreadyInCrm = Math.max(0, toInsert.length - inserted);

  // Apply merges (chunked to avoid a giant burst of concurrent requests).
  for (let i = 0; i < updates.length; i += 25) {
    const chunk = updates.slice(i, i + 25);
    const results = await Promise.all(
      chunk.map((u) =>
        db().from('crm_leads').update(u.patch).eq('id', u.id).then(
          (res) => (res.error ? { ok: false, msg: res.error.message } : { ok: true }),
        ),
      ),
    );
    results.forEach((res) => (res.ok ? (updated += 1) : errors.push(`update: ${res.msg}`)));
  }

  const skipped = incoming.length - inserted - updated;
  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    updated,
    skipped,
    total: incoming.length,
    skippedBreakdown: {
      duplicatesInSheet,
      alreadyInCrm,
      other: Math.max(0, skipped - duplicatesInSheet - alreadyInCrm),
    },
    skippedExamples: skippedExamples.slice(0, 20),
    errors: errors.slice(0, 5),
  });
}
