/** Normalizes a raw traffic_source/utm_source value into a channel bucket for
 *  reporting. Shared by funnel-analytics, page-funnel-stats, and the Living
 *  Funnel Sankey so the same visit is always classified the same way
 *  everywhere. The 3 ads-gate segments are checked first, off `source` (an
 *  unambiguous funnel identity) rather than `traffic_source` (a marketing-
 *  channel guess) — that way "which ad funnel a lead applied through" always
 *  wins as its own distinct color, regardless of what UTM/referrer got them
 *  there. Palette validated via the dataviz skill's validate_palette.js
 *  (dark surface, categorical, all 6 checks pass on the 8 hue-based slots;
 *  Preview/Other are muted utility grays, excluded from that check on
 *  purpose since they're de-emphasized, not compared categories). */
export function classifyChannel(traffic_source?: string | null, source?: string | null): string {
  const src = (source || '').toLowerCase();
  if (src === 'ads-under-100k')       return 'Ads · Under $100k';
  if (src === 'ads-over-100k-ads')    return 'Ads · $100k+ (Ads)';
  if (src === 'ads-over-100k-no-ads') return 'Ads · $100k+ (No Ads)';
  if (src === 'vsl')                  return 'VSL';

  const ts = (traffic_source || source || '').toLowerCase();
  if (!ts || ts === 'direct') return 'Direct';
  if (ts === 'preview') return 'Preview';
  if (ts.includes('youtube')) return 'YouTube';
  if (ts === 'ig' || ts.includes('instagram')) return 'Instagram';
  if (ts.includes('-organic') || ts === 'organic') return 'Organic';
  if (ts === 'referral') return 'Referral';
  return 'Other';
}

export const CHANNEL_ORDER = [
  'Instagram', 'YouTube', 'Ads · Under $100k', 'Ads · $100k+ (No Ads)',
  'Organic', 'Ads · $100k+ (Ads)', 'Direct', 'Referral', 'VSL', 'Preview', 'Other',
];

export const CHANNEL_COLORS: Record<string, string> = {
  'Instagram':               '#d55181',
  'YouTube':                 '#e66767',
  'Ads · Under $100k':       '#3987e5',
  'Ads · $100k+ (No Ads)':   '#199e70',
  'Organic':                 '#008300',
  'Ads · $100k+ (Ads)':      '#9085e9',
  'Direct':                  '#d95926',
  'Referral':                '#c98500',
  'VSL':                     '#1a9bb8',
  'Preview':                 '#6b6b6b',
  'Other':                   '#4a4a4a',
};
