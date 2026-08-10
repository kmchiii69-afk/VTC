import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

const MC_API = 'https://api.manychat.com';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

function mcHeaders() {
  return {
    Authorization: `Bearer ${process.env.MANYCHAT_API_KEY || ''}`,
    'Content-Type': 'application/json',
  };
}

// Extract [mc:{id}] from notes field
function extractMcId(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[mc:([^\]]+)\]/);
  return m ? m[1] : null;
}

// Find ManyChat subscriber by IG handle using findBySystemField
async function findSubscriberByIg(igHandle: string): Promise<string | null> {
  try {
    const res = await fetch(`${MC_API}/fb/subscriber/findBySystemField`, {
      method: 'POST',
      headers: mcHeaders(),
      body: JSON.stringify({ field_name: 'ig_username', field_value: igHandle }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.data?.id ? String(d.data.id) : null;
  } catch {
    return null;
  }
}

async function resolveSubscriberId(lead: { notes: string | null; ig_handle: string | null }): Promise<string | null> {
  // Try stored ID first
  const stored = extractMcId(lead.notes);
  if (stored) return stored;
  // Fall back to IG handle lookup
  if (lead.ig_handle) return findSubscriberByIg(lead.ig_handle);
  return null;
}

// POST /api/crm/manychat
// body: { lead_id, action: 'add_tag'|'remove_tag'|'send_flow', tag_name?, flow_ns? }
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { lead_id, action, tag_name, flow_ns } = await req.json().catch(() => ({}));
  if (!lead_id || !action) return NextResponse.json({ error: 'lead_id and action required' }, { status: 400 });

  const { data: lead } = await db().from('crm_leads').select('ig_handle, notes').eq('id', lead_id).single();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const mcKey = process.env.MANYCHAT_API_KEY;
  if (!mcKey) return NextResponse.json({ error: 'MANYCHAT_API_KEY not set' }, { status: 500 });

  const subscriberId = await resolveSubscriberId(lead as { notes: string | null; ig_handle: string | null });
  if (!subscriberId) return NextResponse.json({ error: 'Could not resolve ManyChat subscriber ID for this lead' }, { status: 404 });

  let endpoint = '';
  let payload: Record<string, unknown> = { subscriber_id: subscriberId };

  if (action === 'add_tag') {
    if (!tag_name) return NextResponse.json({ error: 'tag_name required' }, { status: 400 });
    endpoint = '/fb/subscriber/addTag';
    payload.tag_name = tag_name;
  } else if (action === 'remove_tag') {
    if (!tag_name) return NextResponse.json({ error: 'tag_name required' }, { status: 400 });
    endpoint = '/fb/subscriber/removeTag';
    payload.tag_name = tag_name;
  } else if (action === 'send_flow') {
    if (!flow_ns) return NextResponse.json({ error: 'flow_ns required' }, { status: 400 });
    endpoint = '/fb/sending/sendFlow';
    payload.flow_ns = flow_ns;
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const mcRes = await fetch(`${MC_API}${endpoint}`, {
    method: 'POST',
    headers: mcHeaders(),
    body: JSON.stringify(payload),
  });
  const mcData = await mcRes.json().catch(() => ({}));

  if (!mcRes.ok) {
    return NextResponse.json({ error: mcData.message || 'ManyChat API error', details: mcData }, { status: 502 });
  }

  // Log as a touchpoint
  await db().from('crm_touchpoints').insert({
    lead_id,
    channel: 'ig_dm',
    direction: 'outbound',
    content: action === 'add_tag'
      ? `ManyChat tag added: ${tag_name}`
      : action === 'remove_tag'
      ? `ManyChat tag removed: ${tag_name}`
      : `ManyChat flow triggered: ${flow_ns}`,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, subscriberId, mcData });
}

// GET /api/crm/manychat?lead_id=... — fetch live ManyChat profile
export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const lead_id = req.nextUrl.searchParams.get('lead_id');
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const { data: lead } = await db().from('crm_leads').select('ig_handle, notes').eq('id', lead_id).single();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const subscriberId = await resolveSubscriberId(lead as { notes: string | null; ig_handle: string | null });
  if (!subscriberId) return NextResponse.json({ error: 'No ManyChat subscriber found' }, { status: 404 });

  const mcRes = await fetch(`${MC_API}/fb/subscriber/getInfo?subscriber_id=${subscriberId}`, {
    headers: mcHeaders(),
  });
  if (!mcRes.ok) return NextResponse.json({ error: 'ManyChat API error' }, { status: 502 });

  const mcData = await mcRes.json();
  return NextResponse.json({ subscriberId, profile: mcData.data });
}
