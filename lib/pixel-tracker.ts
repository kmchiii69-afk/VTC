/* Client-side only — unified Meta Pixel / Google Ads (gtag) / TikTok Pixel
 * firing, mirrored server-side via Meta CAPI (POST /api/track/capi) for
 * iOS14+ accuracy. Every pixel ID / conversion label is env-driven and
 * no-ops if unset, so this ships safe before real ad-account IDs exist —
 * see .env.local.example for the full list to fill in.
 *
 * Base pixel scripts are loaded by app/funnel/layout.tsx, not here. */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  }
}

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || '';

/** Google Ads conversion action labels — one per funnel milestone. Paste the
 *  real "AW-XXXXXXX/LABEL" suffix from Google Ads once conversions are set up. */
export const GOOGLE_ADS_CONVERSIONS: Record<string, string> = {
  lead: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_LEAD || '',
  qualified: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_QUALIFIED || '',
  booked: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_BOOKED || '',
  purchase: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE || '',
};

// ---------------------------------------------------------------------------
// Idempotency — dedupe one-shot conversions across remounts / reloads.
// ---------------------------------------------------------------------------
const firedThisLoad = new Set<string>();

export function fireOnce(key: string): boolean {
  if (firedThisLoad.has(key)) return false;
  firedThisLoad.add(key);
  try {
    const storageKey = `pixel_fired:${key}`;
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, '1');
  } catch { /* private mode — in-memory Set still guards this page load */ }
  return true;
}

// ---------------------------------------------------------------------------
// Per-network firing
// ---------------------------------------------------------------------------
function fireMeta(event: string, params?: Record<string, unknown>): void {
  try { window.fbq?.('track', event, params); } catch { /* pixel not loaded */ }
}
export function fireMetaCustom(event: string, params?: Record<string, unknown>): void {
  try { window.fbq?.('trackCustom', event, params); } catch { /* pixel not loaded */ }
}
function fireGA4(event: string, params?: Record<string, unknown>): void {
  try { window.gtag?.('event', event, params); } catch { /* gtag not loaded */ }
}
function fireGoogleAdsConversion(conversionKey: keyof typeof GOOGLE_ADS_CONVERSIONS, params?: Record<string, unknown>): void {
  const label = GOOGLE_ADS_CONVERSIONS[conversionKey];
  if (!label || !GOOGLE_ADS_ID) return;
  try { window.gtag?.('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${label}`, ...params }); } catch { /* gtag not loaded */ }
}
function fireTikTok(event: string, params?: Record<string, unknown>): void {
  try { window.ttq?.track(event, params); } catch { /* pixel not loaded */ }
}

function fireCapi(eventName: string, data: { email?: string; value?: number; contentName?: string }): void {
  try {
    const body = JSON.stringify({
      eventName,
      email: data.email || undefined,
      value: data.value,
      contentName: data.contentName,
      eventSourceUrl: window.location.href,
    });
    fetch('/api/track/capi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Funnel-milestone helpers — call these from the funnel pages
// ---------------------------------------------------------------------------
export function fireLead(opts: { email?: string; contentName: string; value?: number }): void {
  fireMeta('Lead', { content_name: opts.contentName, value: opts.value, currency: 'USD' });
  fireGA4('generate_lead', { content_name: opts.contentName, value: opts.value });
  fireGoogleAdsConversion('lead', { value: opts.value, currency: 'USD' });
  fireTikTok('SubmitForm', { content_name: opts.contentName, value: opts.value });
  fireCapi('Lead', opts);
}

export function fireQualified(opts: { email?: string; contentName: string; value?: number }): void {
  fireMeta('CompleteRegistration', { content_name: opts.contentName, value: opts.value, currency: 'USD' });
  fireGA4('sign_up', { content_name: opts.contentName });
  fireGoogleAdsConversion('qualified', { value: opts.value, currency: 'USD' });
  fireTikTok('CompleteRegistration', { content_name: opts.contentName });
  fireCapi('CompleteRegistration', opts);
}

export function fireBooked(opts: { email?: string; contentName: string }): void {
  fireMeta('Schedule', { content_name: opts.contentName });
  fireGA4('schedule', { content_name: opts.contentName });
  fireGoogleAdsConversion('booked', {});
  fireTikTok('Schedule', { content_name: opts.contentName });
  fireCapi('Schedule', opts);
}

export function firePurchase(opts: { email?: string; contentName: string; value: number }): void {
  fireMeta('Purchase', { content_name: opts.contentName, value: opts.value, currency: 'USD' });
  fireGA4('purchase', { content_name: opts.contentName, value: opts.value, currency: 'USD' });
  fireGoogleAdsConversion('purchase', { value: opts.value, currency: 'USD' });
  fireTikTok('CompletePayment', { content_name: opts.contentName, value: opts.value });
  fireCapi('Purchase', opts);
}

/** Fallback for view/engagement events that don't map to a standard
 *  conversion — fires only Meta/TikTok custom events + GA4, no CAPI/Ads label. */
export function fireCustom(event: string, params?: Record<string, unknown>): void {
  fireMetaCustom(event, params);
  fireGA4(event, params);
  fireTikTok(event, params);
}

/** Standard-named Meta/TikTok event (e.g. ViewContent, InitiateCheckout) that
 *  doesn't warrant a Google Ads conversion label or CAPI mirror on its own. */
export function fireStandard(event: string, params?: Record<string, unknown>): void {
  fireMeta(event, params);
  fireGA4(event, params);
  fireTikTok(event, params);
}
