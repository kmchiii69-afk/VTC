import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const EMAIL = 'info@gohconsulting.com';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: EMAIL, role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await ctx.addCookies([{ name: 'ba_auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();

await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 1200));

// Switch to the CRM tab.
await page.getByRole('button', { name: 'CRM', exact: true }).click();
await new Promise((r) => setTimeout(r, 1500));

// Click the first lead visible in the Priority Queue (a test lead).
await page.getByText('@demoinsta', { exact: false }).first().click();
await new Promise((r) => setTimeout(r, 1500));

// Scroll the new Close/Kit panel into view.
await page.getByText('Close · Calling', { exact: false }).first().scrollIntoViewIfNeeded();
await new Promise((r) => setTimeout(r, 600));

await page.screenshot({ path: 'scripts/shots/crm-close-kit.png', fullPage: false });
console.log('screenshot saved');
await browser.close();
