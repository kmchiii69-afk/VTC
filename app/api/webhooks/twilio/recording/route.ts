import { NextRequest } from 'next/server';
import { db } from '@/lib/kv';
import { basesFromHeaders, parseTwilioBody, recordingProxyPath, validateTwilioRequest } from '@/lib/twilio';

/**
 * Recording-complete callback. Stores the sid and OUR proxy path rather than
 * Twilio's media URL — the raw URL needs account credentials to fetch, so it
 * can't be handed to a browser.
 */
const PATH = '/api/webhooks/twilio/recording';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return new Response('forbidden', { status: 403 });
  }

  const recordingSid = params.RecordingSid || '';
  // The recording belongs to the parent (browser) leg for a dual-channel dial.
  const callSid = params.CallSid || '';
  if (!recordingSid || !callSid) return new Response(null, { status: 204 });

  const patch = {
    recording_sid: recordingSid,
    recording_url: recordingProxyPath(recordingSid),
    ...(params.RecordingDuration ? { duration_sec: parseInt(params.RecordingDuration, 10) || 0 } : {}),
  };

  // Match either leg — which sid arrives depends on where the recording was started.
  const { data: byParent } = await db().from('crm_calls').select('id').eq('call_sid', callSid).maybeSingle();
  if (byParent) await db().from('crm_calls').update(patch).eq('id', byParent.id);
  else await db().from('crm_calls').update(patch).eq('child_call_sid', callSid);

  return new Response(null, { status: 204 });
}
