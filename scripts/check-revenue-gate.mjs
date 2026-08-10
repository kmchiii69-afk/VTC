// Sanity table: how every real revenue option in the funnels routes.
// Mirrors lib/revenue-gate.ts so it can run without a TS loader.
const REVENUE_FLOOR = 20_000;

function upperBoundOf(label) {
  const matches = [...(label || '').matchAll(/([\d][\d,.]*)\s*([kKmM])?/g)];
  let max = null;
  for (const m of matches) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const s = (m[2] || '').toLowerCase();
    const v = s === 'k' ? n * 1_000 : s === 'm' ? n * 1_000_000 : n;
    if (max === null || v > max) max = v;
  }
  return max;
}

function isBelowRevenueFloor(label) {
  if (!label) return false;
  if (/\+/.test(label)) return false;
  const upper = upperBoundOf(label);
  if (upper === null) return false;
  return upper <= REVENUE_FLOOR;
}

const OPTIONS = [
  ['under-100k / vsl', '$5,000 – $20,000'],
  ['under-100k / vsl', '$20,000 – $50,000'],
  ['under-100k / vsl', '$50,000 – $100,000'],
  ['over-100k-*',      '$100,000 – $250,000'],
  ['over-100k-*',      '$250,000 – $500,000'],
  ['over-100k-*',      '$1,000,000+'],
  ['ig',               'Pre-revenue / Under $3K'],
  ['ig',               '$3K – $10K/mo'],
  ['ig',               '$10K – $20K/mo'],
  ['ig',               '$20K – $50K/mo'],
  ['ig',               '$50K+/mo'],
  ['edge: empty',      ''],
  ['edge: no number',  'Prefer not to say'],
];

console.log(`floor = $${REVENUE_FLOOR.toLocaleString()}\n`);
for (const [funnel, opt] of OPTIONS) {
  const gated = isBelowRevenueFloor(opt);
  console.log(`${(gated ? 'NOT-READY' : ' calendar ').padEnd(10)} ${funnel.padEnd(18)} ${JSON.stringify(opt)}`);
}
