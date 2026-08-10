import { NextResponse } from 'next/server';
import { db } from '@/lib/kv';

export const dynamic = 'force-dynamic';

/* Public, unauthenticated funnel-event ingestion (called via sendBeacon from
 * lib/funnel-tracker.ts on every marketing page). Rate-limited per IP since
 * it's open to the internet; best-effort in-memory (resets per serverless
 * instance, same tradeoff as netlify crm-capture's limiter). */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimit = new Map<string, { count: number; resetAt: number }>();
let lastPrune = Date.now();

function allow(ip: string): boolean {
  const now = Date.now();
  if (now - lastPrune > 5 * 60_000) {
    for (const [key, entry] of rateLimit) if (entry.resetAt <= now) rateLimit.delete(key);
    lastPrune = now;
  }
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const MAX_STR = 300;
const clip = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, MAX_STR) : null);

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allow(ip)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const event = clip(body.event);
  const funnel = clip(body.funnel);
  const sessionId = clip(body.sessionId);
  if (!event || !funnel || !sessionId) {
    return NextResponse.json({ error: 'event, funnel, sessionId required' }, { status: 400 });
  }

  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : null;
  if (metadata && JSON.stringify(metadata).length > 4096) {
    return NextResponse.json({ error: 'metadata too large' }, { status: 400 });
  }

  try {
    await db().from('funnel_events').insert({
      event, funnel, session_id: sessionId,
      email: clip(body.email),
      device: clip(body.device),
      referrer: clip(body.referrer),
      pathname: clip(body.pathname),
      landing_page: clip(body.landingPage),
      utm_source: clip(body.utmSource),
      utm_medium: clip(body.utmMedium),
      utm_campaign: clip(body.utmCampaign),
      utm_term: clip(body.utmTerm),
      utm_content: clip(body.utmContent),
      fbclid: clip(body.fbclid),
      gclid: clip(body.gclid),
      ttclid: clip(body.ttclid),
      msclkid: clip(body.msclkid),
      attr_first_source: clip(body.attrFirstSource),
      attr_first_medium: clip(body.attrFirstMedium),
      attr_last_source: clip(body.attrLastSource),
      attr_last_medium: clip(body.attrLastMedium),
      attr_touch_count: typeof body.attrTouchCount === 'number' ? body.attrTouchCount : null,
      velocity_prev_stage: clip(body.velocityPrevStage),
      velocity_ms_from_prev: typeof body.velocityMsFromPrev === 'number' ? body.velocityMsFromPrev : null,
      velocity_ms_from_entry: typeof body.velocityMsFromEntry === 'number' ? body.velocityMsFromEntry : null,
      journey_funnels: clip(body.journeyFunnels),
      metadata,
    });
  } catch (err) {
    // Table may not exist yet if the migration hasn't been run — don't break the funnel page over it.
    console.error('[track/event] insert failed:', err);
  }

  return NextResponse.json({ ok: true });
}
