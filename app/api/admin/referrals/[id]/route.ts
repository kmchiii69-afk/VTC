import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (typeof b.referrer_name === 'string' && b.referrer_name.trim()) updates.referrer_name = b.referrer_name.trim();
  if (typeof b.referred_name === 'string' && b.referred_name.trim()) updates.referred_name = b.referred_name.trim();
  if (b.referral_date !== undefined) updates.referral_date = b.referral_date || null;
  if (b.cash_collected !== undefined) updates.cash_collected = Number(b.cash_collected) || 0;
  if (b.commission !== undefined) updates.commission = Number(b.commission) || 0;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await db().from('referrals').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const { error } = await db().from('referrals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
