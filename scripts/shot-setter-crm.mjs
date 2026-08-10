import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const EMAIL = 'info@gohconsulting.com';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');

const token = await new SignJWT({ email: EMAIL, role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([{
  name: 'ba_auth_token', value: token, domain: 'localhost', path: '/',
  httpOnly: true, sameSite: 'Lax',
}]);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 300)));
const shot = async (name) => { await page.screenshot({ path: `scripts/shots/${name}.png` }); console.log('shot', name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// /admin streams and polls continuously, so neither networkidle nor
// domcontentloaded settles — commit the navigation, then wait for the tab bar.
await page.goto('http://localhost:3000/admin', { waitUntil: 'commit', timeout: 90_000 });
await page.getByRole('button', { name: 'CRM', exact: true }).first().waitFor({ timeout: 60_000 });
await wait(3000);

// ── CRM → Due Today ──
await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
await wait(3000);
await shot('setter-due-today');

// Open a lead drawer (cadence panel + Log outcome buttons). Click the lead's
// NAME, not the row — the row's own buttons would log an outcome.
const leadName = page.getByText(/^ZZ Test /).first();
if (await leadName.count()) {
  await leadName.click();
  await wait(2000);
  await shot('setter-lead-drawer');
} else {
  console.log('no due leads to open');
}

// ── Sales Calls → one profile per person ──
await page.getByRole('button', { name: 'Sales Calls', exact: true }).first().click();
await wait(4000);
await shot('sales-calls-by-person');

// Expand the first multi-call profile, if there is one.
const profile = page.getByText(/\d+ calls$/).first();
if (await profile.count()) {
  await profile.click();
  await wait(1200);
  await shot('sales-calls-expanded');
} else {
  console.log('no multi-call profiles in the visible set');
}

await browser.close();
console.log('done');
