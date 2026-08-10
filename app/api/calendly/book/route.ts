import { NextRequest, NextResponse } from 'next/server';
import { markApplicationBooked, recordBookingToCrm } from '@/lib/bookings';

const CAL_BASE = 'https://api.calendly.com';

function calHeaders() {
  return { Authorization: `Bearer ${process.env.CALENDLY_PAT}`, 'Content-Type': 'application/json' };
}

// POST /api/calendly/book
// body: { name, email, phone, answers, startTime, timezone, eventTypeUri }
//   startTime MUST be the exact UTC start of an available slot as returned by
//   /api/calendly/available-times (Calendly rejects anything that isn't a real
//   open slot).
//
// Creates the booking SERVER-SIDE via Calendly's Create Event Invitee endpoint
// (POST /invitees) — no Calendly-hosted page, no iframe, no confirmation popup.
// The invitee is scheduled the instant this returns 201. Requires a paid
// Calendly plan (free plans get 403 on this endpoint).
export async function POST(req: NextRequest) {
  const { name, email, phone, answers, startTime, timezone, eventTypeUri, tracking } = await req.json().catch(() => ({}));
  if (!name || !email || !startTime || !eventTypeUri) {
    return NextResponse.json({ error: 'name, email, startTime, eventTypeUri required' }, { status: 400 });
  }
  if (!process.env.CALENDLY_PAT) return NextResponse.json({ error: 'CALENDLY_PAT not configured' }, { status: 500 });

  // Fetch the event type so we can map the application answers onto its custom
  // questions BY POSITION — the create endpoint keys answers by position and
  // rejects the whole request if any REQUIRED question is left unanswered.
  const etRes = await fetch(eventTypeUri, { headers: calHeaders() });
  if (!etRes.ok) {
    return NextResponse.json({ error: await etRes.text() }, { status: etRes.status });
  }
  const et = await etRes.json();

  const a: Record<string, string> = answers ?? {};
  const tz = timezone ?? 'UTC';

  /* Single-select answers only match if they EXACTLY equal a Calendly option;
   * the app's wording differs (comma + en dash "–" vs Calendly's "-"). */
  const VALUE_MAP: Record<string, string> = {
    '$5,000 – $20,000': '$5000 - $20,000',
    '$20,000 – $50,000': '$20,000 - $50,000',
    '$50,000 – $100,000': '$50,000 - $100,000',
    '$30,000 – $50,000': '$30,000 - $50,000',
    '$100,000 – $200,000': '$100,000 - $200,000',
    'I have/am willing to invest $0 – $5,000': 'I have/am willing to invest $0 - $5000',
    'I have/am willing to invest $5,000 – $15,000': 'I have/am willing to invest $5000 - $15,000',
    'I have/am willing to invest $15,000 – $30,000': 'I have/am willing to invest $15,000 - $30,000',
    'I have/am willing to invest $30,000 – $50,000': 'I have/am willing to invest $30,000 - $50,000',
    'I have/am willing to invest $50,000+': 'I have/am willing to invest $50,000+',
  };
  const toCalendly = (v: string) => VALUE_MAP[v] ?? v;

  /* Map each of the event's custom questions to the matching application answer
   * (same best-effort label matching the URL prefill used). */
  const pickFor = (label: string): string => {
    const nm = label.toLowerCase();
    if (/^add guest/.test(nm)) return '';
    if (/instagram|handle/.test(nm)) return a.instagram || '';
    if (/phone|mobile|whatsapp|cell/.test(nm)) return a.phone || phone || '';
    if (/stopping|achieving|bottleneck|challeng|blocker|struggl|lack of growth|closing rate/.test(nm)) return a.blocker || '';
    if (/target/.test(nm) && /revenue|income/.test(nm)) return a.targetRevenue || '';
    if (/current/.test(nm) && /revenue|income/.test(nm)) return a.currentRevenue || '';
    if (/revenue|income|turnover/.test(nm)) return a.currentRevenue || '';
    if (/scale of|committed|how committed|1 to 10|readiness|ready to (make|decide)/.test(nm)) return a.commitment || '';
    if (/invest|budget|afford|how much could you/.test(nm)) return a.investment || '';
    if (/deliver|get them results|results once|fulfil/.test(nm)) return a.canDeliverResults || '';
    if (/watched|youtube|client interview|familiar with/.test(nm)) return a.watchedYoutube || '';
    if (/decision|sole decision|do you have partners/.test(nm)) return a.decisionMaker || '';
    if (/business|company|brand|describe|what services|what do you|who do you|provide|offer/.test(nm)) return a.business || '';
    return '';
  };

  const customQuestions: { name?: string; enabled?: boolean; required?: boolean; position?: number }[] =
    (et.resource?.custom_questions ?? []).filter((q: { enabled?: boolean }) => q.enabled !== false);

  const questions_and_answers = customQuestions
    .map((q) => ({ position: q.position ?? 0, question: q.name ?? '', answer: toCalendly(pickFor(q.name ?? '')) }))
    .filter((qa) => qa.answer); // omit unanswered optional questions

  // Surface a clear error before hitting Calendly if a REQUIRED question has no
  // answer (Calendly would 400 anyway, but with a vaguer message).
  const missing = customQuestions
    .filter((q) => q.required)
    .filter((q) => !toCalendly(pickFor(q.name ?? '')))
    .map((q) => q.name);
  if (missing.length) {
    return NextResponse.json({ error: `Missing required answers: ${missing.join(', ')}` }, { status: 400 });
  }

  const invitee: Record<string, unknown> = { email, timezone: tz };
  if (a.firstName) {
    invitee.first_name = a.firstName;
    invitee.last_name = a.lastName || '';
  } else {
    invitee.name = name;
  }
  if (phone) invitee.text_reminder_number = phone;

  /* Forward UTMs to Calendly. Server-side booking never loads Calendly's hosted
   * page, so Calendly can't scrape ?utm_* from the funnel URL — the only way it
   * records attribution is this `tracking` object. NOTE: once `tracking` is
   * present Calendly requires ALL of its keys (utm_* + salesforce_uuid), so we
   * send the full set and default any we don't have to "". We only attach it at
   * all when there's at least one real UTM value (otherwise skip it entirely). */
  const t: Record<string, string> = tracking ?? {};
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
  const hasUtm = utmKeys.some((k) => t[k]);

  const body: Record<string, unknown> = {
    event_type: eventTypeUri,
    start_time: startTime,
    invitee,
    questions_and_answers,
  };
  if (hasUtm) {
    body.tracking = {
      utm_source: t.utm_source || '',
      utm_medium: t.utm_medium || '',
      utm_campaign: t.utm_campaign || '',
      utm_content: t.utm_content || '',
      utm_term: t.utm_term || '',
      salesforce_uuid: '',
    };
  }

  const res = await fetch(`${CAL_BASE}/invitees`, {
    method: 'POST',
    headers: calHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Bubble Calendly's own message up so the UI/logs show exactly why (e.g.
    // "start_time is not available", plan restriction, bad answer option).
    console.error('[calendly:book] create invitee failed', res.status, JSON.stringify(data));
    const msg = data?.message || data?.details?.[0]?.message || 'Booking failed';
    return NextResponse.json({ error: msg, calendly: data }, { status: res.status });
  }

  const resource = data.resource ?? {};

  /* Reconcile our own funnel data at booking time rather than depending on the
   * Calendly webhook (which needs a signing key + subscription pointed at prod).
   * markApplicationBooked finds the application across every funnel table by
   * email and stamps booked_at/scheduled_at; recordBookingToCrm upserts the lead
   * into its VSL/Ads pipeline at stage "booked". Both are idempotent, so if the
   * webhook also fires later it just re-applies the same state. Non-fatal: a
   * reconciliation error must never fail an already-created booking. */
  try {
    const rec = await markApplicationBooked(email, startTime);
    if (rec) await recordBookingToCrm(rec.funnel, rec.app, startTime);
  } catch (e) {
    console.error('[calendly:book] post-booking reconcile failed', e);
  }

  return NextResponse.json({
    ok: true,
    inviteeUri: resource.uri ?? null,
    eventUri: resource.event ?? null,
    cancelUrl: resource.cancel_url ?? null,
    rescheduleUrl: resource.reschedule_url ?? null,
  });
}
