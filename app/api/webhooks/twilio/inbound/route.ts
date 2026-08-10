import { NextRequest } from 'next/server';
import { db } from '@/lib/kv';
import {
  TWILIO_ENV, basesFromHeaders, parseTwilioBody, toE164, validateTwilioRequest,
  twimlDial, twimlReject, twimlSayHangup,
} from '@/lib/twilio';
import { findLeadByPhone } from '@/lib/crm-leads';

/**
 * Inbound calls to our Twilio numbers — a lead ringing back after a dial.
 *
 * Point the number's "A call comes in" webhook here (it ships pointing at
 * Twilio's demo greeting). We forward to TWILIO_FORWARD_NUMBER and log the
 * callback against the lead; with no forward number set, the caller hears a
 * short "we'll call you back" instead of the demo message.
 *
 * The crm_calls row is keyed on this leg's CallSid, which is the ParentCallSid
 * the <Number statusCallback> reports — so /webhooks/twilio/status finishes the
 * row exactly as it does for an outbound dial.
 */

const PATH = '/api/webhooks/twilio/inbound';

const NO_FORWARD_MESSAGE =
  "Thanks for calling Goh Consulting. We can't pick up right now, but we've got your number and we'll call you straight back.";

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return xml(twimlReject(), 403);
  }

  const caller = toE164(params.From || '');
  const ourNumber = toE164(params.To || '') || params.To || '';
  const lead = caller ? await findLeadByPhone(caller) : null;

  // Log the callback up front, so it's visible even if nobody answers.
  await db().from('crm_calls').insert({
    lead_id: lead?.id ?? null,
    call_sid: params.CallSid || null,
    direction: 'inbound',
    from_number: caller || params.From || null,
    to_number: ourNumber || 'unknown',
    status: 'initiated',
  }).then(() => {}, () => {});

  const forward = toE164(TWILIO_ENV.forwardNumber());
  if (!forward) return xml(twimlSayHangup(NO_FORWARD_MESSAGE));

  const base = TWILIO_ENV.appUrl() || (basesFromHeaders(req.headers)[0] ?? '');

  return xml(twimlDial({
    to: forward,
    // The caller's own number, so whoever picks up sees who is ringing. This is
    // the one case Twilio allows a callerId we don't own — it's <Dial>'s default
    // for a forwarded call. Falls back to our number if the caller withheld it.
    callerId: caller || ourNumber,
    // Longer than an outbound dial: this is a mobile in someone's pocket.
    timeout: 30,
    record: TWILIO_ENV.record(),
    recordingStatusCallback: `${base}/api/webhooks/twilio/recording`,
    statusCallback: `${base}/api/webhooks/twilio/status`,
  }));
}
