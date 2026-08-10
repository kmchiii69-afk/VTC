import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { dialerStatus, mintVoiceToken } from '@/lib/twilio';

// Short-lived browser Voice token for the signed-in setter. The identity IS the
// setter's email, which comes back on the TwiML webhook — that's how each dial
// gets attributed without the browser being trusted to say who it is.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = dialerStatus();
  if (!status.ready) {
    // 200 with ready:false — the UI shows the setup reason instead of an error.
    return NextResponse.json({ ready: false, reason: status.reason, recording: status.recording });
  }

  try {
    return NextResponse.json({
      ready: true,
      token: await mintVoiceToken(auth.email),
      identity: auth.email,
      callerIds: status.callerIds,
      recording: status.recording,
      // Tokens are valid for an hour; the client refreshes a minute early.
      expiresInSec: 3600,
    });
  } catch (e) {
    return NextResponse.json({ ready: false, reason: `Token mint failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
