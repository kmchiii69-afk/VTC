import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// Funnel application tables → display label.
const FUNNELS: { funnel: string; table: string; label: string }[] = [
  { funnel: 'vsl',              table: 'vsl_applications',                 label: 'VSL' },
  { funnel: 'under-100k',       table: 'ads_under_100k_applications',      label: 'Ads · Under $100k' },
  { funnel: 'over-100k-ads',    table: 'ads_over_100k_ads_applications',   label: 'Ads · $100k+ (Running Ads)' },
  { funnel: 'over-100k-no-ads', table: 'ads_over_100k_noads_applications', label: 'Ads · $100k+ (No Ads)' },
];

interface Row {
  email: string; first_name: string | null; last_name: string | null; phone: string | null;
  instagram: string | null; business_description: string | null;
  current_revenue: string | null; target_revenue: string | null; blocker: string | null;
  commitment: string | null; investment_range: string | null; decision_maker: string | null;
  qualified: boolean | null; completed: boolean | null;
  booked_at: string | null; scheduled_at: string | null; last_step: number | null;
  submitted_at: string | null;
}

// GET /api/admin/applicants?from&to — every applicant per funnel with answers +
// completed/partial + booked status (booked_at, set by the Calendly webhook or
// the sync-bookings endpoint).
export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = Date.now();
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const fromISO = new Date(from ? parseInt(from, 10) : now - 30 * 86400000).toISOString();
  const toISO = new Date(to ? parseInt(to, 10) : now).toISOString();

  const funnels = await Promise.all(FUNNELS.map(async ({ funnel, table, label }) => {
    const { data, error } = await db()
      .from(table)
      .select('email, first_name, last_name, phone, instagram, business_description, current_revenue, target_revenue, blocker, commitment, investment_range, decision_maker, qualified, completed, booked_at, scheduled_at, last_step, submitted_at')
      .gte('submitted_at', fromISO)
      .lte('submitted_at', toISO)
      .order('submitted_at', { ascending: false })
      .limit(2000);

    if (error) {
      // Table/columns may not exist yet (migration not run) — return empty, not 500.
      return { funnel, label, applicants: [], counts: { total: 0, completed: 0, partial: 0, booked: 0 }, error: error.message };
    }

    const rows = (data ?? []) as Row[];
    const applicants = rows.map(r => ({
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      phone: r.phone, instagram: r.instagram,
      business: r.business_description,
      current_revenue: r.current_revenue, target_revenue: r.target_revenue,
      investment_range: r.investment_range, commitment: r.commitment,
      blocker: r.blocker, decision_maker: r.decision_maker,
      qualified: r.qualified, completed: !!r.completed,
      booked: !!r.booked_at, scheduled_at: r.scheduled_at,
      last_step: r.last_step, submitted_at: r.submitted_at,
    }));

    const counts = {
      total: applicants.length,
      completed: applicants.filter(a => a.completed).length,
      partial: applicants.filter(a => !a.completed).length,
      booked: applicants.filter(a => a.booked).length,
    };
    return { funnel, label, applicants, counts };
  }));

  return NextResponse.json({ configured: true, from: parseInt(from || '0', 10) || null, to: parseInt(to || '0', 10) || null, funnels });
}
