// Screenshots the hero headline on every funnel landing page (dev server on :3000).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['funnel-vsl', '/funnel/vsl'],
  ['funnel-ads-gate', '/funnel/ads'],
  ['funnel-under-100k', '/funnel/ads/under-100k'],
  ['funnel-over-100k-ads', '/funnel/ads/over-100k-ads'],
  ['funnel-over-100k-no-ads', '/funnel/ads/over-100k-no-ads'],
  ['funnel-ig', '/funnel/ig'],
  ['funnel-clipping', '/funnel/clipping'],
  ['funnel-buyer-mirror', '/funnel/buyer-mirror'],
];

for (const [name, path] of PAGES) {
  try {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(3500);
    const h1 = await page.locator('h1').first().innerText().catch(() => '(no h1)');
    await page.screenshot({ path: `scripts/shots/${name}.png` });
    console.log(`OK   ${path}\n     h1 = ${h1.replace(/\s+/g, ' ')}`);
  } catch (e) {
    console.log(`FAIL ${path} — ${e.message.split('\n')[0]}`);
  }
}

await browser.close();
console.log('done');
