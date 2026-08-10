import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { isValidEmail } from '@/lib/contact-format';
import { kitTagSubscriber, kitSubscribe } from '@/lib/kit';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

type Params = { params: Promise<{ id: string }> };

// POST → push this lead into Kit.
//   { action: 'tag', tag }               add/upsert subscriber + apply a tag
//   { action: 'sequence', sequenceId }   add subscriber to an email sequence
export async function POST(req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = b.action || 'tag';

  const { data: lead, error } = await db().from('crm_leads').select('*').eq('id', id).single();
  if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.email || !isValidEmail(lead.email)) {
    return NextResponse.json({ error: 'This lead needs a valid email before syncing to Kit.' }, { status: 400 });
  }
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || undefined;

  if (action === 'sequence') {
    if (!b.sequenceId) return NextResponse.json({ error: 'sequenceId required' }, { status: 400 });
    const res = await kitSubscribe({ email: lead.email, firstName, sequenceId: String(b.sequenceId) });
    if (res.skipped) return NextResponse.json({ error: 'Kit is not configured (KIT_API_KEY missing).' }, { status: 503 });
    if (!res.ok) return NextResponse.json({ error: res.error || 'Kit request failed' }, { status: 502 });
    await db().from('crm_touchpoints').insert({ lead_id: id, channel: 'email', direction: 'outbound', content: `Added to Kit sequence #${b.sequenceId}` });
    return NextResponse.json({ ok: true });
  }

  // action === 'tag'
  const tag = String(b.tag || '').trim();
  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });
  const res = await kitTagSubscriber({ email: lead.email, firstName, tag });
  if (res.skipped) return NextResponse.json({ error: 'Kit is not configured (KIT_API_KEY missing).' }, { status: 503 });
  if (!res.ok) return NextResponse.json({ error: res.error || 'Kit request failed' }, { status: 502 });
  await db().from('crm_touchpoints').insert({ lead_id: id, channel: 'email', direction: 'outbound', content: `Synced to Kit · tagged "${tag}"` });
  return NextResponse.json({ ok: true });
}
