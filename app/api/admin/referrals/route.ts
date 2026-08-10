import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db()
    .from('referrals')
    .select('*')
    .order('referral_date', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.referrer_name?.trim() || !b.referred_name?.trim()) {
    return NextResponse.json({ error: 'Both names are required' }, { status: 400 });
  }
  const { data, error } = await db().from('referrals').insert({
    referrer_name: b.referrer_name.trim(),
    referred_name: b.referred_name.trim(),
    referral_date: b.referral_date || null,
    cash_collected: Number(b.cash_collected) || 0,
    commission: Number(b.commission) || 0,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
