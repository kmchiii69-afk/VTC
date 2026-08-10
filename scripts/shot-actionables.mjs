import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const EMAIL = 'info@gohconsulting.com';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: EMAIL, role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'ba_auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.addInitScript((email) => {
  ['portal', 'hub', 'sops', 'assistant', 'select', 'modules', 'roadmap'].forEach((id) => localStorage.setItem(`tour_${id}_${email}`, '1'));
}, EMAIL);

const page = await ctx.newPage();
await page.goto('http://localhost:3000/roadmap?view=acquisition', { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 1500));

// Pick the first real client in the "Viewing" selector so the board un-gates.
const sel = page.locator('select').first();
const values = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
console.log('client options:', values);
if (values.length) { await sel.selectOption(values[0]); await new Promise((r) => setTimeout(r, 1200)); }

// Open the Actionables page from its nav card.
const actionables = page.getByText('Actionables', { exact: true }).last();
if (await actionables.count()) { await actionables.click(); await new Promise((r) => setTimeout(r, 1200)); }

// Flip on bulk mode and drop in a few sample lines.
const toggle = page.getByRole('button', { name: /Add multiple/i });
if (await toggle.count()) {
  await toggle.click();
  await new Promise((r) => setTimeout(r, 400));
  const ta = page.locator('textarea').first();
  await ta.fill('Draft the offer doc p1 w1\nRecord the 5-min VSL p2 w1\nDM 20 warm leads p1 w2\nBook 3 sales calls p2 w2\nPost daily content for a week p3');
  await new Promise((r) => setTimeout(r, 600));
  console.log('bulk mode opened + filled');
} else {
  console.log('bulk toggle not found — capturing whatever is on screen');
}

await page.screenshot({ path: 'scripts/shots/actionables-bulk-add.png', fullPage: false });
console.log('screenshot saved');
await browser.close();
