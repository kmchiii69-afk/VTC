import { NextRequest } from 'next/server';
import { db } from '@/lib/kv';
import {
  TWILIO_ENV, basesFromHeaders, parseTwilioBody, pickCallerId, toE164, validateTwilioRequest,
  twimlDial, twimlReject, twimlSayHangup,
} from '@/lib/twilio';

/**
 * The TwiML App's Voice URL. Twilio fetches this the moment the browser places a
 * call, and the XML we return IS the call: <Dial> bridges the setter to the lead.
 *
 * Lives under /api/webhooks/ so proxy.ts leaves it unauthenticated — it's Twilio
 * calling us, not a browser, so it's secured by the X-Twilio-Signature instead.
 */

const PATH = '/api/webhooks/twilio/voice';

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return xml(twimlReject(), 403);
  }

  // Custom params the browser passed to device.connect(); `To` is the lead's number.
  const to = toE164(params.To || '');
  const leadId = params.LeadId || null;
  // Identity of the token that placed the call — set by Twilio, not the browser.
  const setter = params.From?.replace(/^client:/, '') || params.Caller?.replace(/^client:/, '') || null;

  if (!to) return xml(twimlSayHangup('That number is not in a diallable format. Please check the country code.'));

  const callerId = pickCallerId(to);
  if (!callerId) return xml(twimlSayHangup('No caller ID is configured for the dialer yet.'));

  // Log the attempt up front so a dial that never connects is still visible.
  await db().from('crm_calls').insert({
    lead_id: leadId,
    call_sid: params.CallSid || null,
    setter_email: setter,
    direction: 'outbound',
    from_number: callerId,
    to_number: to,
    status: 'initiated',
  }).then(() => {}, () => {});   // non-fatal: never fail a live call over logging

  const base = TWILIO_ENV.appUrl() || (basesFromHeaders(req.headers)[0] ?? '');
  const notice = TWILIO_ENV.recordingNotice();

  return xml(twimlDial({
    to,
    callerId,
    record: TWILIO_ENV.record(),
    recordingStatusCallback: `${base}/api/webhooks/twilio/recording`,
    statusCallback: `${base}/api/webhooks/twilio/status`,
    // A notice, when configured, is played to the LEAD on answer (a <Say> before
    // <Dial> would only be heard by the setter). Empty by default.
    numberUrl: notice ? `${base}/api/webhooks/twilio/notice` : undefined,
  }));
}
