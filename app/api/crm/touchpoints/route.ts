import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { stampLeadCadence, stageLabelFor } from '@/lib/crm-leads';
import { cadencePatch, type CadenceLead } from '@/lib/crm-followup';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const leadId = req.nextUrl.searchParams.get('lead_id');
  if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const { data, error } = await db()
    .from('crm_touchpoints')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
  if (!b.content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const { data, error } = await db()
    .from('crm_touchpoints')
    .insert({
      lead_id: b.lead_id,
      channel: b.channel || 'ig_dm',
      direction: b.direction || 'outbound',
      content: b.content.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A logged touchpoint IS the setter's activity log — stamp Last Activity and
  // roll the next follow-up date off it (bumping updated_at as a side effect).
  // select('*') so the read works before the cadence columns exist (see the lead
  // PATCH route for why naming them would break it).
  const { data: lead } = await db().from('crm_leads').select('*').eq('id', b.lead_id).single();

  if (lead) {
    const label = await stageLabelFor(lead.pipeline_id as string | null, lead.stage as string);
    await stampLeadCadence(b.lead_id, cadencePatch(lead as unknown as CadenceLead, { stageLabel: label, activity: true }));
  } else {
    await db().from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', b.lead_id);
  }

  return NextResponse.json(data);
}
