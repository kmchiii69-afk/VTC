import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { syncBookingsFromCalendly } from '@/lib/bookings';
import { syncCalendlyBookingsToCrm } from '@/lib/calendly-crm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// POST /api/admin/sync-bookings — pull Calendly bookings and reconcile, in two passes:
//   1. CRM: every booking on the strategy-call calendars becomes a lead, routed by
//      UTM. Backfills the last 30 days by default (?days=N) plus everything upcoming,
//      since a call already on the calendar is the whole point.
//   2. applications: mark the matching funnel application booked (last 90 days →
//      next 120, overridable via ?from / ?to as ms epoch).
//
// The CRM pass runs FIRST because the applications pass walks every event in a
// 7-month window and is what makes this slow; if the request runs out of time, the
// bookings are already committed. `?only=crm` / `?only=apps` runs one pass alone.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = Date.now();
  const only = req.nextUrl.searchParams.get('only');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const minStart = new Date(from ? parseInt(from, 10) : now - 90 * 86400000).toISOString();
  const maxStart = new Date(to ? parseInt(to, 10) : now + 120 * 86400000).toISOString();

  const days = Math.max(1, Math.min(365, parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30));
  const crmMin = new Date(now - days * 86400000).toISOString();

  const bookings = only === 'apps'
    ? null
    : await syncCalendlyBookingsToCrm(crmMin, maxStart);

  const result = only === 'crm'
    ? { events: 0, invitees: 0, matched: 0, crm: 0 }
    : await syncBookingsFromCalendly(minStart, maxStart);

  return NextResponse.json({
    ok: !result.error && !bookings?.error,
    ...result,
    ...(bookings ? { bookings: { ...bookings, days } } : {}),
  });
}
