import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

// GET /api/crm/calls?lead_id=…   → that lead's dial history (drawer)
// GET /api/crm/calls?limit=50    → the recent dial log (keypad panel)
export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const leadId = req.nextUrl.searchParams.get('lead_id');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '25', 10) || 25, 200);

  let q = db().from('crm_calls').select('*').order('created_at', { ascending: false }).limit(limit);
  if (leadId) q = q.eq('lead_id', leadId);

  const { data, error } = await q;
  // The table arrives with supabase-crm-dialer.sql; until then report empty
  // rather than erroring, so the CRM renders normally.
  if (error) return NextResponse.json([], { headers: { 'x-crm-calls': 'unavailable' } });
  return NextResponse.json(data ?? []);
}

// PATCH /api/crm/calls  { id, disposition?, notes? }
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof b.disposition === 'string') updates.disposition = b.disposition.trim() || null;
  if (typeof b.notes === 'string') updates.notes = b.notes.trim() || null;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const { data, error } = await db().from('crm_calls').update(updates).eq('id', b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
