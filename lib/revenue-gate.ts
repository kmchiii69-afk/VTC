/**
 * Revenue floor for booking a call.
 *
 * Applicants doing less than $20k/mo aren't shown the calendar — they're sent to
 * /funnel/not-ready instead, which thanks them and shows client testimonials.
 * Their application is still submitted first, so the lead is captured and can be
 * followed up with resources.
 *
 * The funnels ask for revenue as a labelled bucket, not a number, so the gate
 * reads the bucket's UPPER bound: "$5,000 – $20,000" tops out at $20k and is
 * therefore a sub-$20k applicant, while "$20,000 – $50,000" is not. Every
 * funnel's options are cut so that $20,000 is a clean boundary — no bucket
 * straddles it.
 */

export const REVENUE_FLOOR = 20_000;

/** Path applicants below the floor are sent to instead of the calendar. */
export const NOT_READY_PATH = '/funnel/not-ready';

/**
 * Highest dollar figure named in a bucket label, handling "k"/"m" suffixes and
 * thousands separators. Returns null when the label carries no number at all.
 *
 *   "$5,000 – $20,000"        → 20000
 *   "$10K – $20K/mo"          → 20000
 *   "Pre-revenue / Under $3K" → 3000
 *   "$1,000,000+"             → 1000000
 */
export function upperBoundOf(label: string): number | null {
  const matches = [...(label || '').matchAll(/([\d][\d,.]*)\s*([kKmM])?/g)];
  let max: number | null = null;
  for (const m of matches) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] || '').toLowerCase();
    const value = suffix === 'k' ? n * 1_000 : suffix === 'm' ? n * 1_000_000 : n;
    if (max === null || value > max) max = value;
  }
  return max;
}

/**
 * True when this revenue answer is below the floor and should skip the calendar.
 *
 * Fails OPEN: an unrecognised label (no number, a renamed option) lets the
 * applicant through to the calendar. Wrongly turning away a $200k/mo founder is
 * far more costly than letting one small applicant book.
 */
export function isBelowRevenueFloor(label: string | null | undefined): boolean {
  if (!label) return false;
  // "+" means open-ended upwards ("$30K+"), so the named figure is a floor, not a cap.
  if (/\+/.test(label)) return false;
  const upper = upperBoundOf(label);
  if (upper === null) return false;
  return upper <= REVENUE_FLOOR;
}
