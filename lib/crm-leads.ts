import { db } from '@/lib/kv';
import { CADENCE_COLUMNS } from '@/lib/crm-followup';
import { writeWithOptionalColumns } from '@/lib/db-write';

/**
 * crm_leads writes.
 *
 * The follow-up cadence needs `last_activity_at` / `reset_at`
 * (`supabase-crm-followup-cadence.sql`). Until that SQL is run by hand in the
 * Supabase editor those columns are dropped from the write and retried, so the
 * CRM keeps saving — `next_followup_at` is an old column, so the Due Today queue
 * still works and only the no-show reset window is missing.
 */

type Row = Record<string, unknown>;

/** Insert (no id) or update (id) a lead, retrying without the cadence columns. */
export async function writeLead(row: Row, id?: string) {
  return writeWithOptionalColumns('crm_leads', row, { id, optional: CADENCE_COLUMNS });
}

/** Fire-and-forget cadence stamp used by side-effect writers (touchpoints, Close sync). */
export async function stampLeadCadence(id: string, patch: Row) {
  if (!Object.keys(patch).length) return;
  await writeLead(patch, id).catch(() => {});
}

/**
 * Match an inbound caller/texter to a lead by phone number.
 *
 * Stored numbers are free text — `+44 7700 900123`, `07700900123`, `978-845-8591`
 * — so the comparison happens here rather than in the query: compare the last 9
 * digits, which survives a missing country code or a trunk 0 while staying long
 * enough not to collide. If two leads share a number the first is returned; the
 * caller only uses this to attach a log line, never to make a decision.
 */
export async function findLeadByPhone(phone: string): Promise<{ id: string; name: string | null } | null> {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  const tail = digits.slice(-9);

  const { data } = await db().from('crm_leads').select('id, name, whatsapp').not('whatsapp', 'is', null);
  const hit = (data ?? []).find((l) => {
    const d = String(l.whatsapp ?? '').replace(/\D/g, '');
    return d.length >= 7 && d.slice(-9) === tail;
  });
  return hit ? { id: hit.id as string, name: (hit.name as string | null) ?? null } : null;
}

/**
 * Label of a stage key within a pipeline — stage classification reads the label
 * too, so a renamed stage ("Didn't Show") still behaves like a no-show.
 */
export async function stageLabelFor(
  pipelineId: string | null | undefined,
  stageKey: string | null | undefined,
): Promise<string | null> {
  if (!pipelineId || !stageKey) return null;
  const { data } = await db().from('crm_pipelines').select('stages').eq('id', pipelineId).single();
  const stages = (data?.stages as Array<{ key: string; label: string }> | undefined) ?? [];
  return stages.find((s) => s.key === stageKey)?.label ?? null;
}
