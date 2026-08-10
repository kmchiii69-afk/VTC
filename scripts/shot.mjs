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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{
  name: 'ba_auth_token', value: token, domain: 'localhost', path: '/',
  httpOnly: true, sameSite: 'Lax',
}]);
// Skip PageTour overlays for this account.
await ctx.addInitScript((email) => {
  ['hub', 'sops', 'assistant', 'select', 'modules'].forEach((id) =>
    localStorage.setItem(`tour_${id}_${email}`, '1'));
}, EMAIL);

const page = await ctx.newPage();
const shot = async (name) => { await page.screenshot({ path: `scripts/shots/${name}.png` }); console.log('shot', name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. /hub landing
await page.goto('http://localhost:3000/hub', { waitUntil: 'networkidle' });
await wait(1200);
await shot('hub-landing');

// 2. /hub Group Calls submenu (click the heading) — URL should become ?s=group-calls
await page.getByText('Group Calls', { exact: true }).first().click();
await wait(900);
console.log('URL after Group Calls:', page.url());
await shot('hub-group-calls');

// 3. /sops landing
await page.goto('http://localhost:3000/sops', { waitUntil: 'networkidle' });
await wait(1200);
await shot('sops-landing');

// 4. /SooWei-AI (tools visible by default)
await page.goto('http://localhost:3000/SooWei-AI', { waitUntil: 'networkidle' });
await wait(1400);
await shot('soowei-ai');

await browser.close();
console.log('done');
