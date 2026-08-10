import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { writeLead, stageLabelFor } from '@/lib/crm-leads';
import { newLeadCadence } from '@/lib/crm-followup';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const stage = req.nextUrl.searchParams.get('stage');
  const pipelineId = req.nextUrl.searchParams.get('pipeline_id');
  const followupDue = req.nextUrl.searchParams.get('followup_due') === '1';

  let q = db()
    .from('crm_leads')
    .select('*')
    .order('updated_at', { ascending: false });

  if (stage) q = q.eq('stage', stage);
  if (pipelineId) q = q.eq('pipeline_id', pipelineId);
  // A follow-up is due for the whole calendar day it lands on, not from its
  // timestamp onwards — so the bound is the end of today, not "now".
  if (followupDue) {
    const day = 86_400_000;
    const endOfToday = new Date(Math.floor(Date.now() / day) * day + day - 1).toISOString();
    q = q.lte('next_followup_at', endOfToday).not('next_followup_at', 'is', null);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.ig_handle?.trim() && !b.whatsapp?.trim() && !b.name?.trim()) {
    return NextResponse.json({ error: 'At least one of ig_handle, whatsapp, or name is required' }, { status: 400 });
  }

  // Cadence starts the moment a lead enters: activity = now, so the first
  // follow-up is tomorrow (unless the stage already clears follow-ups, or the
  // form supplied an explicit date).
  const stage = b.stage || 'new';
  const label = await stageLabelFor(b.pipeline_id, stage);
  const cadence = newLeadCadence(stage, label);
  if (b.next_followup_at) cadence.next_followup_at = b.next_followup_at;

  const { data, error } = await writeLead(
    {
      ig_handle: b.ig_handle?.trim() || null,
      whatsapp: b.whatsapp?.trim() || null,
      has_whatsapp: !!b.has_whatsapp,
      name: b.name?.trim() || null,
      email: b.email?.trim() || null,
      makes_money: b.makes_money?.trim() || null,
      source: b.source || 'other',
      icp_tier: b.icp_tier || null,
      status: b.status || null,
      revenue: b.revenue || null,
      business: b.business || null,
      tags: Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
      pipeline_id: b.pipeline_id || null,
      dials_made: Number.isFinite(Number(b.dials_made)) && b.dials_made !== null && b.dials_made !== '' ? Math.trunc(Number(b.dials_made)) : null,
      stage,
      notes: b.notes?.trim() || null,
      ...cadence,
    },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Mirror into Close (fire-and-forget — the cron sweep is the net).
  queueCloseSync(data?.id, 'crm-create');
  queueAlowareSync(data?.id, 'crm-create');
  return NextResponse.json(data);
}
