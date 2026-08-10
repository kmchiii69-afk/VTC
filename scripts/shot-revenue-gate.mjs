/**
 * Drives the real funnel applications to prove the sub-$20k/mo gate.
 *
 * The submit POST is intercepted and fulfilled locally, so this never writes a
 * test applicant to the live Supabase project or fires Discord/Kit side effects.
 * Everything after the POST is the genuine client path: onDone → gate → route.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Fulfil every funnel submission locally — no DB writes, no webhooks.
await ctx.route('**/api/funnel/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'test' }) }));

const page = await ctx.newPage();

async function clickOption(label) {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await wait(500);
}
async function fillNext(value) {
  const ta = page.locator('textarea');
  if (await ta.count()) await ta.first().fill(value);
  else await page.locator('input:visible').last().fill(value);
  await page.getByRole('button', { name: /Next →|Submit Application →/ }).click();
  await wait(500);
}

/** Walk the SegmentFunnel application, choosing `revenue` at the revenue step. */
async function runSegment(path, revenue) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(2500);
  await page.getByRole('button', { name: /APPLY|SCALE|START|BOOK/i }).first().click().catch(() => {});
  await wait(1200);

  await fillNext('Test');                       // firstName
  await fillNext('Applicant');                  // lastName
  await fillNext('test@example.com');            // email
  await fillNext('+14155550132');                // phone
  await fillNext('@testhandle');                 // instagram
  await fillNext('I help coaches scale.');       // business
  await clickOption(revenue);                    // currentRevenue  ← the gate input
  await clickOption('$30,000 – $50,000');        // targetRevenue
  await fillNext('Not enough qualified leads.'); // blocker
  await clickOption('8');                        // commitment
  await clickOption('Yes — I can deliver results once I have the leads');
  await clickOption('I have/am willing to invest $15,000 – $30,000');
  await clickOption("Yes — I'm the sole decision maker and ready to decide today");
  await fillNext('');                            // guests (optional) → submits
  await wait(3500);
  return page.url();
}

/** Walk the IG funnel, choosing `revenue` on step 2. */
async function runIg(revenue) {
  await page.goto(`${BASE}/funnel/ig`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(2000);
  await page.getByRole('button', { name: /Get My Free Strategy Session/i }).click();
  await wait(800);
  await page.locator('input[placeholder="Your full name"]').fill('Test Applicant');
  await page.locator('input[placeholder="Email address"]').fill('test@example.com');
  await page.locator('input[type="tel"]').fill('+14155550132');
  // IG's option buttons prefix a ●/○ bullet, so match on contained text.
  await page.locator('button').filter({ hasText: revenue }).first().click();
  await wait(300);
  await page.getByRole('button', { name: /Next →/ }).click();
  await wait(800);
  await page.locator('button').filter({ hasText: 'Getting attention / content' }).first().click();
  await wait(300);
  await page.getByRole('button', { name: /Book My Free Session/i }).click();
  await wait(4000);
  return page.url();
}

const results = [];
function check(label, url, expectNotReady) {
  const onNotReady = url.includes('/funnel/not-ready');
  const ok = onNotReady === expectNotReady;
  results.push(ok);
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}\n        → ${url}`);
}

// Below the floor → not-ready
check('under-100k · $5,000 – $20,000 (below floor)',
  await runSegment('/funnel/ads/under-100k', '$5,000 – $20,000'), true);
await page.screenshot({ path: 'scripts/shots/funnel-not-ready.png', fullPage: false });

// At/above the floor → normal booking path
check('under-100k · $20,000 – $50,000 (at floor)',
  await runSegment('/funnel/ads/under-100k', '$20,000 – $50,000'), false);
await page.screenshot({ path: 'scripts/shots/funnel-qualified-calendar.png' });

check('vsl · $5,000 – $20,000 (below floor)',
  await runSegment('/funnel/vsl', '$5,000 – $20,000'), true);

check('ig · $10K – $20K/mo (below floor)', await runIg('$10K – $20K/mo'), true);
check('ig · $20K – $50K/mo (at floor)',    await runIg('$20K – $50K/mo'), false);

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} pass`);
process.exit(pass === results.length ? 0 : 1);
