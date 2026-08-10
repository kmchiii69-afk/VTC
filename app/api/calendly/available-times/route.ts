import { NextRequest, NextResponse } from 'next/server';

const CAL_BASE = 'https://api.calendly.com';
/* Default booking event, matched by exact name first then slug. Individual
 * funnels can override which Calendly event to book via ?eventName=/?eventSlug=
 * (e.g. /funnel/ads/under-100k uses its own "1-on-1 Strategy Call"). There are
 * several near-identical "Strategy Call" events, so matching is EXACT (no fuzzy
 * fallback) to avoid ever resolving the wrong calendar. */
const DEFAULT_EVENT_NAME = '1 on 1 Strategy Call';
const DEFAULT_EVENT_SLUG = '1on1-strategy-call';

function calHeaders() {
  return { Authorization: `Bearer ${process.env.CALENDLY_PAT}`, 'Content-Type': 'application/json' };
}

async function getEventTypeUri(eventName: string, eventSlug: string): Promise<string | null> {
  try {
    const meRes = await fetch(`${CAL_BASE}/users/me`, { headers: calHeaders(), next: { revalidate: 3600 } });
    if (!meRes.ok) return null;
    const me = await meRes.json();
    const userUri: string = me.resource?.uri ?? '';
    const orgUri: string = me.resource?.current_organization ?? '';
    if (!userUri && !orgUri) return null;

    // These are TEAM events — owned by the organization, not the individual
    // user, so they never appear under ?user=. Query the organization's event
    // types (which include team events) and combine with the user's personal ones.
    const urls: string[] = [];
    if (orgUri) urls.push(`${CAL_BASE}/event_types?organization=${encodeURIComponent(orgUri)}&active=true&count=100`);
    if (userUri) urls.push(`${CAL_BASE}/event_types?user=${encodeURIComponent(userUri)}&active=true&count=100`);

    const col: Array<{ name?: string; slug?: string; uri: string }> = [];
    for (const url of urls) {
      const r = await fetch(url, { headers: calHeaders(), next: { revalidate: 3600 } });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.collection)) col.push(...d.collection);
      }
    }
    if (!col.length) return null;

    const norm = (s?: string) => (s ?? '').trim().toLowerCase();
    // Exact match only (name then slug). Several events share similar names
    // ("1 on 1 Strategy Call" vs "1-on-1 Strategy Call" vs "1 - 1 Strategy
    // Call"), so a fuzzy match would risk the wrong calendar.
    const match =
      col.find((e) => norm(e.name) === norm(eventName)) ||
      col.find((e) => e.slug === eventSlug);
    return match?.uri ?? null;
  } catch {
    return null;
  }
}

// GET /api/calendly/available-times?month=2026-07&timezone=...&eventName=...&eventSlug=...
// Returns { slots: { "2026-07-11": ["09:00","09:30",...], ... } }
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const timezone = req.nextUrl.searchParams.get('timezone') ?? 'UTC';
  const eventName = req.nextUrl.searchParams.get('eventName') || DEFAULT_EVENT_NAME;
  const eventSlug = req.nextUrl.searchParams.get('eventSlug') || DEFAULT_EVENT_SLUG;

  const pat = process.env.CALENDLY_PAT;
  if (!pat) return NextResponse.json({ error: 'CALENDLY_PAT not set' }, { status: 500 });

  const eventTypeUri = await getEventTypeUri(eventName, eventSlug);
  if (!eventTypeUri) return NextResponse.json({ error: 'Could not find event type' }, { status: 500 });

  // Clamp the range start to "now" so browsing the current (partially-elapsed)
  // month doesn't send a past start_time, which Calendly rejects with
  // "start_time must be in the future".
  const [year, mo] = month.split('-').map(Number);
  const startOfMonth = new Date(year, mo - 1, 1);
  const endOfMonth = new Date(year, mo, 0, 23, 59, 59);
  const now = new Date();
  // A few minutes' buffer — Calendly rejects start_time if it's not clearly
  // ahead of its own clock at validation time, not just >= our `now`.
  const nowBuffered = new Date(now.getTime() + 5 * 60 * 1000);
  if (endOfMonth <= now) {
    // Entire requested month is already in the past — nothing to fetch.
    return NextResponse.json({ slots: {}, eventTypeUri });
  }
  const rangeStart = startOfMonth < nowBuffered ? nowBuffered : startOfMonth;

  // Calendly's event_type_available_times endpoint only accepts a date range of
  // up to 7 days per call, so page the whole month in sub-7-day windows and
  // merge them — a single month-long request just returns a 400 (which showed
  // up as an empty calendar). Each window is fetched independently so one bad
  // window can't wipe out the others.
  const WINDOW_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 1000; // just under 7 days
  const windows: Array<[string, string]> = [];
  for (let cursor = rangeStart.getTime(); cursor < endOfMonth.getTime(); ) {
    const wEnd = Math.min(cursor + WINDOW_MS, endOfMonth.getTime());
    windows.push([new Date(cursor).toISOString(), new Date(wEnd).toISOString()]);
    cursor = wEnd;
  }

  try {
    const collections = await Promise.all(
      windows.map(async ([s, e]) => {
        const res = await fetch(
          `${CAL_BASE}/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${encodeURIComponent(s)}&end_time=${encodeURIComponent(e)}`,
          { headers: calHeaders(), next: { revalidate: 300 } }
        );
        if (!res.ok) {
          console.error('[calendly:available-times] window failed', s, e, await res.text());
          return [];
        }
        const data = await res.json();
        return (data.collection ?? []) as Array<{ status: string; start_time: string }>;
      })
    );

    // Group by local date in the requested timezone. Each slot keeps its exact
    // UTC start_time (`iso`) alongside the display label — server-side booking
    // (POST /invitees) must send the precise slot time, not a reconstructed one.
    const slots: Record<string, { time: string; iso: string }[]> = {};
    for (const collection of collections) {
      for (const item of collection) {
        if (item.status !== 'available') continue;
        const startUTC = new Date(item.start_time);
        if (isNaN(startUTC.getTime())) continue;

        const localDate = startUTC.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
        const localTime = startUTC.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true });

        if (!slots[localDate]) slots[localDate] = [];
        if (!slots[localDate].some((s) => s.iso === item.start_time)) {
          slots[localDate].push({ time: localTime, iso: item.start_time });
        }
      }
    }
    // Chronological order within each day.
    for (const k of Object.keys(slots)) slots[k].sort((x, y) => x.iso.localeCompare(y.iso));

    return NextResponse.json({ slots, eventTypeUri });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
