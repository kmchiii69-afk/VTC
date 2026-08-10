import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { TWILIO_ENV } from '@/lib/twilio';

type Params = { params: Promise<{ sid: string }> };

/**
 * Streams a call recording to an authed admin. Twilio's media URL requires
 * account credentials, so the browser can never fetch it directly — this proxies
 * it with the API key pair and keeps the recording behind our own login.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { sid } = await params;
  if (!/^RE[a-f0-9]{32}$/i.test(sid)) {
    return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
  }

  const account = TWILIO_ENV.accountSid();
  const key = TWILIO_ENV.apiKeySid();
  const secret = TWILIO_ENV.apiKeySecret();
  if (!account || !key || !secret) {
    return NextResponse.json({ error: 'Twilio is not configured' }, { status: 503 });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${account}/Recordings/${sid}.mp3`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
  };
  // Pass Range through so the browser's audio element can seek.
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  const upstream = await fetch(url, { headers });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Recording unavailable (${upstream.status})` }, { status: upstream.status === 404 ? 404 : 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
      ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length') as string } : {}),
      ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range') as string } : {}),
      'Accept-Ranges': 'bytes',
    },
  });
}
