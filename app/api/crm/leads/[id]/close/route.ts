import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { closeListCalls, closeLeadUrl } from '@/lib/close';
import { applyCloseCalls, syncLeadToClose } from '@/lib/close-sync';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

type Params = { params: Promise<{ id: string }> };

// POST → sync this lead with Close.
//   { action: 'push' }        (default) create/refresh the lead in Close
//   { action: 'sync_calls' }  pull Close call activity into the timeline
export async function POST(req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { action = 'push' } = await req.json().catch(() => ({}));

  const { data: lead, error } = await db().from('crm_leads').select('*').eq('id', id).single();
  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  if (action === 'sync_calls') {
    if (!lead.close_lead_id) return NextResponse.json({ error: 'Lead is not linked to Close yet — sync it first.' }, { status: 400 });
    const res = await closeListCalls({ leadId: lead.close_lead_id });
    if (res.skipped) return NextResponse.json({ error: 'Close is not configured (CLOSE_API_KEY missing).' }, { status: 503 });
    if (!res.ok) return NextResponse.json({ error: res.error || 'Close request failed' }, { status: 502 });

    // Dedupe against calls already on the timeline (each carries a [close:<id>] tag).
    const { data: existing } = await db().from('crm_touchpoints').select('content').eq('lead_id', id).eq('channel', 'call');
    const seen = new Set(
      (existing ?? [])
        .map((t: { content: string }) => t.content.match(/\[close:([^\]]+)\]/)?.[1])
        .filter((v): v is string => !!v),
    );
    const { added, dials } = await applyCloseCalls(lead as { id: string }, res.calls ?? [], seen);
    return NextResponse.json({ ok: true, added, dials_added: dials, total: res.calls?.length ?? 0 });
  }

  // action === 'push' — the lead, its notes, and its place on the Close pipeline.
  const res = await syncLeadToClose(lead as { id: string });
  if (res.skipped) return NextResponse.json({ error: res.error }, { status: 503 });
  if (!res.ok || !res.id) return NextResponse.json({ error: res.error || 'Close request failed' }, { status: 502 });

  // First push only — a re-sync shouldn't add a timeline entry every time.
  if (!lead.close_lead_id) {
    await db().from('crm_touchpoints').insert({ lead_id: id, channel: 'other', direction: 'outbound', content: 'Synced to Close CRM' });
  }
  return NextResponse.json({
    ok: true,
    close_lead_id: res.id,
    url: closeLeadUrl(res.id),
    // The CRM stage has no matching stage in the Close pipeline (renamed, or the
    // lead is on a stage its pipeline dropped) — it synced, it just isn't on a board.
    ...(res.unplaced ? { warning: 'Synced, but this lead’s stage has no matching stage in its Close pipeline.' } : {}),
    ...(res.warning ? { warning: res.warning } : {}),
  });
}
