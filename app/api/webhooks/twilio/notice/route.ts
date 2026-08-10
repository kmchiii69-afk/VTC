import { NextRequest } from 'next/server';
import { TWILIO_ENV, basesFromHeaders, parseTwilioBody, validateTwilioRequest, twimlReject, twimlSay } from '@/lib/twilio';

/**
 * Whisper played to the LEAD when they pick up — used only when
 * TWILIO_RECORDING_NOTICE is set. Attached as the <Number url="…"> of the dial,
 * which is the only way to address the called party rather than the setter.
 * When the env var is empty this route is never referenced.
 */
const PATH = '/api/webhooks/twilio/notice';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return new Response(twimlReject(), { status: 403, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  }

  // Falling off the end of this TwiML returns the leg to the bridge.
  return new Response(twimlSay(TWILIO_ENV.recordingNotice()), {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
