import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN || '';
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_EVENT_CODE || '';

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function getCookie(cookieHeader: string, name: string): string | undefined {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/* Server-side mirror of the browser Meta Pixel event, for iOS14+ / ad-blocker
 * accuracy. No-ops (200 OK, does nothing) until META_PIXEL_ID + a CAPI access
 * token are set in env — see .env.local.example. */
export async function POST(req: Request) {
  let body: { eventName?: string; email?: string; value?: number; contentName?: string; eventSourceUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return NextResponse.json({ ok: true, skipped: 'CAPI not configured' });
  }
  if (!body.eventName) {
    return NextResponse.json({ error: 'eventName required' }, { status: 400 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const fbp = getCookie(cookieHeader, '_fbp');
  const fbc = getCookie(cookieHeader, '_fbc');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ua = req.headers.get('user-agent') || undefined;

  const userData: Record<string, unknown> = {
    client_ip_address: ip,
    client_user_agent: ua,
    fbp,
    fbc,
  };
  if (body.email) userData.em = [sha256(body.email)];

  const payload = {
    data: [{
      event_name: body.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: body.eventSourceUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: {
        currency: body.value ? 'USD' : undefined,
        value: body.value,
        content_name: body.contentName,
      },
    }],
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[track/capi] Meta CAPI error:', res.status, err);
      return NextResponse.json({ ok: false }, { status: 502 });
    }
  } catch (err) {
    console.error('[track/capi] request failed:', err);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
