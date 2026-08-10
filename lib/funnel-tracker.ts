/* Client-side only — generic funnel event stream: multi-touch attribution +
 * stage velocity + cross-funnel journey. Writes to Supabase `funnel_events`
 * via POST /api/track/event. Independent of lib/tracking.ts (which captures
 * a single traffic_source at the moment a lead/application is submitted) —
 * this logs every step so attribution/velocity can be reconstructed later. */

const BOT_RE = /bot|crawl|spider|slurp|Googlebot|Bingbot|Baiduspider|YandexBot|DuckDuckBot|facebookexternalhit|Twitterbot|LinkedInBot|Applebot|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|Bytespider|GPTBot|ChatGPT|ClaudeBot|Headless|Puppeteer|PhantomJS|Selenium|curl|wget|python-requests|Go-http-client/i;

function isBot(): boolean {
  return typeof navigator !== 'undefined' && BOT_RE.test(navigator.userAgent);
}

const PREVIEW_FLAG_KEY = 'funnel_preview_mode';

/** Preview mode — set when a page is opened with `?preview=1` (the admin
 *  "Preview" link from the page-link generator). Persists for the rest of
 *  the tab session so the click-through still works normally, it just skips
 *  writing to `funnel_events` — an admin testing a page shouldn't pollute
 *  view counts / velocity / attribution for that funnel. */
export function isFunnelPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(PREVIEW_FLAG_KEY) === '1') return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1') {
      sessionStorage.setItem(PREVIEW_FLAG_KEY, '1');
      return true;
    }
  } catch { /* private mode */ }
  return false;
}

function safeGet(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}
function safeSet(store: Storage, key: string, value: string): void {
  try { store.setItem(key, value); } catch { /* private mode / quota */ }
}
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function generateId(): string {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getSessionId(): string {
  let sid = safeGet(sessionStorage, 'funnel_session_id');
  if (!sid) {
    sid = `fs_${generateId()}`;
    safeSet(sessionStorage, 'funnel_session_id', sid);
  }
  return sid;
}

function getDevice(): 'mobile' | 'desktop' {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop';
}

// ---------------------------------------------------------------------------
// Attribution — 30-day first-party cookie for first-touch, rolling touchpoint
// log (localStorage) for last-touch + touch count.
// ---------------------------------------------------------------------------
const UTM_COOKIE_DAYS = 30;

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const parts = window.location.hostname.split('.');
  const root = parts.length > 2 ? '.' + parts.slice(-2).join('.') : window.location.hostname;
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;domain=${root};SameSite=Lax;Secure`;
}
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface Touchpoint {
  source: string;
  medium: string;
  referrer: string;
  ts: number;
}

function currentTouch(): Touchpoint {
  const p = new URLSearchParams(window.location.search);
  return {
    source: p.get('utm_source') || '',
    medium: p.get('utm_medium') || '',
    referrer: document.referrer || 'direct',
    ts: Date.now(),
  };
}

function recordTouchpoint(): void {
  const touchpoints: Touchpoint[] = safeParse(safeGet(localStorage, 'funnel_touchpoints'), []);
  const touch = currentTouch();
  const isNew = touch.source || touch.medium ||
    touchpoints.length === 0 ||
    (touch.referrer !== 'direct' && touch.referrer !== touchpoints[touchpoints.length - 1]?.referrer);
  if (isNew) {
    touchpoints.push(touch);
    if (touchpoints.length > 20) touchpoints.shift();
    safeSet(localStorage, 'funnel_touchpoints', JSON.stringify(touchpoints));
  }

  const FT_COOKIE = '_ba_ft';
  if (!getCookie(FT_COOKIE) && (touch.source || touch.medium || touch.referrer !== 'direct')) {
    setCookie(FT_COOKIE, JSON.stringify(touch), UTM_COOKIE_DAYS);
  }
}

function getAttribution(): { first: Touchpoint | null; last: Touchpoint | null; touchCount: number } {
  const touchpoints: Touchpoint[] = safeParse(safeGet(localStorage, 'funnel_touchpoints'), []);
  const firstCookie = safeParse<Touchpoint | null>(getCookie('_ba_ft'), null);
  return {
    first: firstCookie ?? touchpoints[0] ?? null,
    last: touchpoints[touchpoints.length - 1] ?? null,
    touchCount: touchpoints.length,
  };
}

// ---------------------------------------------------------------------------
// Velocity — first-seen timestamp per event, per funnel, this session.
// Stage order is simply chronological (no hardcoded stage map needed).
// ---------------------------------------------------------------------------
function recordAndGetVelocity(funnel: string, event: string): {
  prevStage: string | null; msFromPrev: number | null; msFromEntry: number | null;
} {
  const key = `funnel_velocity_${funnel}`;
  const stages: Record<string, number> = safeParse(safeGet(sessionStorage, key), {});
  const now = Date.now();

  const entries = Object.entries(stages).sort((a, b) => a[1] - b[1]);
  const entryTime = entries.length > 0 ? entries[0][1] : null;
  const prev = entries.length > 0 && !(event in stages) ? entries[entries.length - 1] : null;

  if (!(event in stages)) {
    stages[event] = now;
    safeSet(sessionStorage, key, JSON.stringify(stages));
  }

  return {
    prevStage: prev?.[0] ?? null,
    msFromPrev: prev ? now - prev[1] : null,
    msFromEntry: entryTime ? now - entryTime : null,
  };
}

// ---------------------------------------------------------------------------
// Cross-funnel journey — which funnels this session has touched.
// ---------------------------------------------------------------------------
function recordJourney(funnel: string): string {
  const journey: string[] = safeParse(safeGet(sessionStorage, 'funnel_journey'), []);
  if (!journey.includes(funnel)) {
    journey.push(funnel);
    safeSet(sessionStorage, 'funnel_journey', JSON.stringify(journey));
  }
  return journey.join(',');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
let initialized = false;

export function trackEvent(funnel: string, event: string, metadata?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || isBot() || isFunnelPreviewMode()) return;

  if (!initialized) {
    recordTouchpoint();
    initialized = true;
  }

  const p = new URLSearchParams(window.location.search);
  const velocity = recordAndGetVelocity(funnel, event);
  const attribution = getAttribution();
  const journeyFunnels = recordJourney(funnel);

  const payload = {
    event,
    funnel,
    sessionId: getSessionId(),
    email: (metadata?.email as string) || undefined,
    device: getDevice(),
    referrer: document.referrer || 'direct',
    pathname: window.location.pathname,
    landingPage: safeGet(sessionStorage, 'funnel_landing_page') || (() => {
      const lp = window.location.pathname + window.location.search;
      safeSet(sessionStorage, 'funnel_landing_page', lp);
      return lp;
    })(),
    utmSource: p.get('utm_source') || undefined,
    utmMedium: p.get('utm_medium') || undefined,
    utmCampaign: p.get('utm_campaign') || undefined,
    utmTerm: p.get('utm_term') || undefined,
    utmContent: p.get('utm_content') || undefined,
    fbclid: p.get('fbclid') || undefined,
    gclid: p.get('gclid') || undefined,
    ttclid: p.get('ttclid') || undefined,
    msclkid: p.get('msclkid') || undefined,
    attrFirstSource: attribution.first?.source || undefined,
    attrFirstMedium: attribution.first?.medium || undefined,
    attrLastSource: attribution.last?.source || undefined,
    attrLastMedium: attribution.last?.medium || undefined,
    attrTouchCount: attribution.touchCount,
    velocityPrevStage: velocity.prevStage,
    velocityMsFromPrev: velocity.msFromPrev,
    velocityMsFromEntry: velocity.msFromEntry,
    journeyFunnels,
    metadata,
  };

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/event', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* best-effort */ }
}
