import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/* Server-side WebinarJam registration — lets us render a fully custom,
 * on-brand registration form (app/funnel/webinar/register) instead of the
 * locked-styling embed, while keeping the API key off the client.
 *
 * Requires env:
 *   WEBINARJAM_API_KEY   — WebinarJam → Account → API & Integrations
 *   WEBINARJAM_WEBINAR_ID
 *   WEBINARJAM_SCHEDULE   — optional; specific schedule id (omit = all/next)
 * Until these are set the custom form is gated off (NEXT_PUBLIC_WEBINAR_CUSTOM_FORM),
 * so production keeps using the embed. */

const WJ_REGISTER = 'https://api.webinarjam.com/webinarjam/register';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const email = String(body.email ?? '').trim();
  const phone = String(body.phone ?? '').replace(/[^\d]/g, '');

  if (!firstName) return NextResponse.json({ error: 'Please enter your first name.' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

  const apiKey = process.env.WEBINARJAM_API_KEY;
  const webinarId = process.env.WEBINARJAM_WEBINAR_ID;
  if (!apiKey || !webinarId) {
    return NextResponse.json({ error: 'Registration isn’t configured yet. Please try again shortly.' }, { status: 503 });
  }

  const form = new URLSearchParams();
  form.set('api_key', apiKey);
  form.set('webinar_id', webinarId);
  form.set('first_name', firstName);
  if (lastName) form.set('last_name', lastName);
  form.set('email', email);
  if (process.env.WEBINARJAM_SCHEDULE) form.set('schedule', process.env.WEBINARJAM_SCHEDULE);
  if (phone) { form.set('phone_country_code', '1'); form.set('phone', phone); }

  try {
    const res = await fetch(WJ_REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.status !== 'success') {
      console.error('[webinar/register] WJ error:', JSON.stringify(data));
      return NextResponse.json({ error: data?.message || 'Registration failed. Please try again.' }, { status: 502 });
    }
    // Prefer our own confirmation page; expose WJ URLs in case they're useful.
    return NextResponse.json({
      ok: true,
      redirect: '/funnel/webinar/confirm',
      liveRoomUrl: data.user?.live_room_url ?? null,
      thankYouUrl: data.user?.thank_you_url ?? null,
    });
  } catch (e) {
    console.error('[webinar/register] threw:', e);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 502 });
  }
}
