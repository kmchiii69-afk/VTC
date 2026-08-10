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
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  permissions: ['microphone'],
});
await ctx.addCookies([{
  name: 'ba_auth_token', value: token, domain: 'localhost', path: '/',
  httpOnly: true, sameSite: 'Lax',
}]);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 300)));
const shot = async (name) => { await page.screenshot({ path: `scripts/shots/${name}.png` }); console.log('shot', name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:3000/admin', { waitUntil: 'commit', timeout: 90_000 });
await page.getByRole('button', { name: 'CRM', exact: true }).first().waitFor({ timeout: 60_000 });
await wait(2500);
await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
// Wait for the CRM to actually paint, not just for the click to land.
await page.getByText('COMMAND QUEUE').first().waitFor({ timeout: 60_000 });
await page.getByText(/Due Today \(/).first().waitFor({ timeout: 60_000 });
await wait(4000);
await shot('dialer-panel');

// Open a lead so the Dial button + cadence panel are both visible.
const lead = page.getByText(/^@|^ZZ /).first();
if (await lead.count()) { await lead.click(); await wait(1800); await shot('dialer-lead-drawer'); }

await browser.close();
console.log('done');
