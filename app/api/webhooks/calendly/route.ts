import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { markApplicationBooked, recordBookingToCrm, clearApplicationBooked } from '@/lib/bookings';
import { isCrmBookingCalendar, upsertBookingLead, type CalendlyTracking } from '@/lib/calendly-crm';

const GHL_API   = 'https://services.leadconnectorhq.com';
const GHL_PIT   = 'pit-afc28ad1-981b-4e50-98e7-14d09085cba5';
const GHL_LOC   = 'Y1mpgvgd2Sb5y2LE4PvE';
const GHL_HEADS = { Authorization: `Bearer ${GHL_PIT}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const CAL_BASE  = 'https://api.calendly.com';

function calHeaders() {
  return { Authorization: `Bearer ${process.env.CALENDLY_PAT}`, 'Content-Type': 'application/json' };
}

/* Verify Calendly webhook signature — header format: "t=<ts>,v1=<hex>" */
function verifySignature(rawBody: string, header: string | null): boolean {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(s => s.split('=')));
  const ts = parts['t'];
  const sig = parts['v1'];
  if (!ts || !sig) return false;
  const expected = createHmac('sha256', key).update(`${ts}.${rawBody}`).digest('hex');
  return expected === sig;
}

/* GHL helpers */
async function findGHLContact(email: string): Promise<string | null> {
  const r = await fetch(`${GHL_API}/contacts/?locationId=${GHL_LOC}&email=${encodeURIComponent(email)}`, { headers: GHL_HEADS });
  const d = await r.json().catch(() => ({}));
  return d?.contacts?.[0]?.id ?? null;
}

async function tagContact(id: string, tags: string[]) {
  await fetch(`${GHL_API}/contacts/${id}/tags`, { method: 'POST', headers: GHL_HEADS, body: JSON.stringify({ tags }) });
}

async function untagContact(id: string, tags: string[]) {
  await fetch(`${GHL_API}/contacts/${id}/tags`, { method: 'DELETE', headers: GHL_HEADS, body: JSON.stringify({ tags }) });
}

async function updateGHLContact(id: string, fields: Record<string, string>) {
  await fetch(`${GHL_API}/contacts/${id}`, {
    method: 'PUT', headers: GHL_HEADS,
    body: JSON.stringify(fields),
  });
}

/* Fetch enriched invitee details from Calendly API */
async function getInviteeDetails(inviteeUri: string) {
  try {
    const r = await fetch(inviteeUri, { headers: calHeaders() });
    return await r.json();
  } catch { return null; }
}

async function getScheduledEvent(eventUri: string) {
  try {
    const r = await fetch(eventUri, { headers: calHeaders() });
    return await r.json();
  } catch { return null; }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('calendly-webhook-signature');

  if (!verifySignature(raw, sig)) {
    console.warn('[calendly/webhook] invalid signature');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const event    = payload.event as string;
  const data     = (payload.payload as Record<string, unknown>) ?? {};
  const invitee  = data.invitee  as Record<string, unknown> | undefined;
  const sEvent   = data.scheduled_event as Record<string, unknown> | undefined;

  const email        = invitee?.email        as string | undefined;
  const name         = invitee?.name         as string | undefined;
  const inviteeUri   = invitee?.uri          as string | undefined;
  const eventUri     = sEvent?.uri           as string | undefined;
  const startTime    = sEvent?.start_time    as string | undefined;

  console.log('[calendly/webhook]', event, email, startTime);
  if (!email) return NextResponse.json({ ok: true });

  /* Enrich from Calendly API */
  const [inviteeDetail, eventDetail] = await Promise.all([
    inviteeUri ? getInviteeDetails(inviteeUri) : null,
    eventUri   ? getScheduledEvent(eventUri)   : null,
  ]);

  const qAnswers = (inviteeDetail?.resource?.questions_and_answers as { question: string; answer: string }[] | undefined) ?? [];
  const tracking = (inviteeDetail?.resource?.tracking as CalendlyTracking | undefined) ?? null;

  const eventName  = eventDetail?.resource?.name  as string | undefined;
  const locationInfo = (eventDetail?.resource?.location as Record<string, string> | undefined)?.join_url ?? '';

  /* Persist to OUR database first (independent of GHL). Strategy-call bookings
     become a CRM lead whether or not the person ever filled in an application —
     that gap is why most booked calls never reached the CRM. Other calendars
     (onboarding, check-ins) keep the original application-only behaviour. */
  const strategyCall = isCrmBookingCalendar(eventName);
  const booking = {
    email,
    name,
    firstName: inviteeDetail?.resource?.first_name as string | undefined,
    lastName: inviteeDetail?.resource?.last_name as string | undefined,
    phone: (inviteeDetail?.resource?.text_reminder_number as string | undefined) ?? null,
    calendar: (eventName as string) ?? '',
    startTime: startTime ?? null,
    timezone: (inviteeDetail?.resource?.timezone as string | undefined) ?? null,
    questions: qAnswers,
    tracking,
    eventUri: eventUri ?? null,
  };
  try {
    if (event === 'invitee.created') {
      const res = await markApplicationBooked(email, startTime ?? null);
      if (strategyCall) await upsertBookingLead({ ...booking, funnel: res?.funnel ?? null });
      else if (res) await recordBookingToCrm(res.funnel, res.app, startTime ?? null);
    } else if (event === 'invitee.canceled') {
      await clearApplicationBooked(email);
      // Moves the lead to the pipeline's Cancelled stage — unless it already holds a
      // later call, which is what a reschedule looks like from here.
      if (strategyCall) await upsertBookingLead(booking, { canceled: true });
    }
  } catch (e) {
    console.error('[calendly/webhook] DB persist:', e);
  }

  /* Find GHL contact */
  const contactId = await findGHLContact(email);
  if (!contactId) {
    console.warn('[calendly/webhook] GHL contact not found for', email);
    /* Still return 200 so Calendly doesn't retry */
    return NextResponse.json({ ok: true, note: 'contact not in GHL' });
  }

  if (event === 'invitee.created') {
    await Promise.all([
      tagContact(contactId, ['brand-architect-call-booked', 'vsl-funnel-booked']),
      updateGHLContact(contactId, {
        ...(name       ? { firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') } : {}),
        ...(startTime  ? { customFields: JSON.stringify([{ key: 'call_scheduled_time', field_value: startTime }]) } : {}),
        ...(eventName  ? {} : {}),
        ...(locationInfo ? {} : {}),
      }),
    ]);
    console.log('[calendly/webhook] booked:', name, email, startTime);
  }

  if (event === 'invitee.canceled') {
    const reason = (data.cancellation as Record<string, string> | undefined)?.reason ?? 'unknown';
    await Promise.all([
      untagContact(contactId, ['brand-architect-call-booked']),
      tagContact(contactId,   ['brand-architect-call-canceled']),
      updateGHLContact(contactId, {
        customFields: JSON.stringify([{ key: 'call_cancel_reason', field_value: reason }]),
      }),
    ]);
    console.log('[calendly/webhook] canceled:', email, 'reason:', reason);
  }

  return NextResponse.json({ ok: true });
}
