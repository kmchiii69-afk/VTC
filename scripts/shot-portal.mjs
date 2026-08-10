import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const EMAIL = 'info@gohconsulting.com';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: EMAIL, role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'ba_auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.addInitScript((email) => {
  ['portal', 'hub', 'sops', 'assistant', 'select', 'modules'].forEach((id) => localStorage.setItem(`tour_${id}_${email}`, '1'));
}, EMAIL);

const page = await ctx.newPage();
await page.goto('http://localhost:3000/portal?view=resources&resource=offer-doc', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: 'scripts/shots/portal-resource-deeplink.png' });
const backBtn = await page.getByText('All resources', { exact: false }).count();
console.log('resource-detail open (has "All resources" back button):', backBtn > 0);
await browser.close();
