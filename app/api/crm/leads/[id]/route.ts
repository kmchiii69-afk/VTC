import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { writeLead, stageLabelFor } from '@/lib/crm-leads';
import { cadencePatch, isDqStage, type CadenceLead } from '@/lib/crm-followup';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { data, error } = await db().from('crm_leads').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const allowed = ['ig_handle', 'whatsapp', 'has_whatsapp', 'name', 'email', 'makes_money', 'source', 'icp_tier', 'status', 'revenue', 'business', 'tags', 'pipeline_id', 'dials_made', 'stage', 'next_followup_at', 'last_activity_at', 'reset_at', 'ai_summary', 'ai_next_move', 'notes'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in b) updates[k] = b[k];
  }
  // Normalize tags to a clean string[] whenever provided.
  if ('tags' in updates) {
    updates.tags = Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [];
  }

  // ── Follow-up cadence ──
  // The setter only ever reports what happened: a stage change, or `log_activity`
  // (a logged touch). Either one re-stamps Last Activity and recomputes the next
  // follow-up date; nothing else touches the schedule, so a hand-picked date
  // survives unrelated edits (tags, notes, …).
  const stageChanging = typeof updates.stage === 'string';
  if (stageChanging || b.log_activity) {
    // select('*') on purpose: naming last_activity_at / reset_at here would make
    // the read itself fail before supabase-crm-followup-cadence.sql is run, which
    // would silently skip the cadence instead of degrading to the fallback.
    const { data: cur } = await db().from('crm_leads').select('*').eq('id', id).single();

    if (cur) {
      const nextStage = stageChanging ? String(updates.stage) : undefined;
      const pipelineId = 'pipeline_id' in updates ? (updates.pipeline_id as string | null) : (cur.pipeline_id as string | null);
      const label = await stageLabelFor(pipelineId, nextStage ?? (cur.stage as string));

      Object.assign(updates, cadencePatch(cur as unknown as CadenceLead, {
        stage: nextStage,
        stageLabel: label,
        activity: !!b.log_activity,
      }));

      // An explicit date from the caller always wins over the computed one.
      if ('next_followup_at' in b) updates.next_followup_at = b.next_followup_at;

      // Marking the DQ stage keeps the Qualified/DQ status field honest — it's
      // what the funnel + call analytics read.
      if (nextStage && isDqStage(nextStage, label) && !('status' in b)) updates.status = 'DQ';
    }
  }

  if (!Object.keys(updates).length) {
    const { data } = await db().from('crm_leads').select('*').eq('id', id).single();
    return NextResponse.json(data);
  }

  const { data, error } = await writeLead(updates, id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Keep the Close mirror in step — a stage drag here moves the lead's opportunity
  // on the matching Close pipeline (fire-and-forget; the sweep is the net).
  queueCloseSync(id, 'crm-edit');
  queueAlowareSync(id, 'crm-edit');
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { error } = await db().from('crm_leads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
