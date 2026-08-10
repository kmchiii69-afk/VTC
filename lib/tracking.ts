/* Client-side only — call from useEffect */

export interface TrackingData {
  utm_source?:   string;
  utm_medium?:   string;
  utm_campaign?: string;
  utm_content?:  string;
  utm_term?:     string;
  fbclid?:       string;
  gclid?:        string;
  ttclid?:       string;
  msclkid?:      string;
  twclid?:       string;
  traffic_source?: string;
  referrer?:     string;
  landing_page?: string;
}

const KEY = 'goh_tracking';

function detectSource(p: URLSearchParams, ref: string): string {
  if (p.get('fbclid'))  return 'facebook-paid';
  if (p.get('gclid'))   return 'google-paid';
  if (p.get('ttclid'))  return 'tiktok-paid';
  if (p.get('msclkid')) return 'microsoft-paid';

  const src = (p.get('utm_source') ?? '').toLowerCase();
  const med = (p.get('utm_medium') ?? '').toLowerCase();
  const isPaid = med === 'paid' || med === 'cpc' || med === 'ppc';

  const match = (kw: string) => src.includes(kw) || ref.includes(kw + '.com');

  if (match('instagram')) return isPaid ? 'instagram-paid'  : 'instagram-organic';
  if (match('youtube'))   return isPaid ? 'youtube-paid'    : 'youtube-organic';
  if (match('facebook') || match('fb')) return isPaid ? 'facebook-paid' : 'facebook-organic';
  if (match('google'))    return isPaid ? 'google-paid'     : 'google-organic';
  if (match('tiktok'))    return isPaid ? 'tiktok-paid'     : 'tiktok-organic';
  if (match('twitter') || match('x.com')) return 'twitter-organic';
  if (match('linkedin'))  return isPaid ? 'linkedin-paid'   : 'linkedin-organic';

  if (src) return `${src}${med ? '-' + med : ''}`;
  if (ref)  return 'referral';
  return 'direct';
}

/** True once a page has been opened with `?preview=1` (the admin "Preview"
 *  link from the page-link generator) — persists for the tab session so a
 *  step-by-step form still tags every step as preview, not just the first. */
function isPreview(p: URLSearchParams): boolean {
  try {
    if (sessionStorage.getItem('funnel_preview_mode') === '1') return true;
    if (p.get('preview') === '1') { sessionStorage.setItem('funnel_preview_mode', '1'); return true; }
  } catch { /* private mode */ }
  return false;
}

export function captureTracking(): TrackingData {
  const p   = new URLSearchParams(window.location.search);
  const ref = document.referrer ?? '';
  const preview = isPreview(p);

  const data: TrackingData = {
    utm_source:     preview ? 'preview' : (p.get('utm_source')   || undefined),
    utm_medium:     preview ? 'preview' : (p.get('utm_medium')   || undefined),
    utm_campaign:   preview ? 'preview' : (p.get('utm_campaign') || undefined),
    utm_content:    p.get('utm_content')  || undefined,
    utm_term:       p.get('utm_term')     || undefined,
    fbclid:         p.get('fbclid')       || undefined,
    gclid:          p.get('gclid')        || undefined,
    ttclid:         p.get('ttclid')       || undefined,
    msclkid:        p.get('msclkid')      || undefined,
    twclid:         p.get('twclid')       || undefined,
    traffic_source: preview ? 'preview' : detectSource(p, ref),
    referrer:       ref || undefined,
    landing_page:   window.location.href,
  };

  try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  return data;
}

export function getTracking(): TrackingData {
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
