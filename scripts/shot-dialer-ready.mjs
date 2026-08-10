import { chromium } from 'playwright';
import { SignJWT } from 'jose';
const EMAIL = 'info@gohconsulting.com';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: EMAIL, role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, permissions: ['microphone'] });
await ctx.addCookies([{ name: 'ba_auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/twilio|device|voice|error/i.test(t)) console.log('console:', t.slice(0, 160)); });

await page.goto('http://localhost:3000/admin', { waitUntil: 'commit', timeout: 90_000 });
await page.getByRole('button', { name: 'CRM', exact: true }).first().waitFor({ timeout: 60_000 });
await page.getByRole('button', { name: 'CRM', exact: true }).first().click();

// Poll the panel's status text until it settles.
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const txt = await page.locator('text=/Ready|Setup needed|Phone error|Starting phone/').first().textContent().catch(() => null);
  if (txt) { console.log(`t+${i + 1}s status:`, txt.trim()); if (/Ready|error|Setup/.test(txt)) break; }
}
await page.screenshot({ path: 'scripts/shots/dialer-ready.png' });
console.log('shot dialer-ready');
await browser.close();
