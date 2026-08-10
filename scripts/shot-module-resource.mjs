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
await ctx.addInitScript((email) => {
  ['hub', 'sops', 'assistant', 'select', 'modules'].forEach((id) =>
    localStorage.setItem(`tour_${id}_${email}`, '1'));
}, EMAIL);

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
const shot = async (name) => { await page.screenshot({ path: `scripts/shots/${name}.png` }); console.log('shot', name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:3000/modules', { waitUntil: 'networkidle' });
await wait(1500);
await shot('modules-landing');

// Open a module that has an attached resource (title → slug map in page.tsx).
const pmf = page.getByText('Product Market Fit', { exact: true }).first();
if (await pmf.count()) {
  await pmf.click();
  await wait(1500);
  await shot('modules-pmf');
  const pill = page.locator('main button, button').filter({ hasText: /Market Research|Offer Doc|Product Market Fit/ }).last();
  if (await pill.count()) {
    await pill.click();
    await wait(1200);
    await shot('modules-resource-popup');
    const dl = page.getByRole('link', { name: /Download/ }).first();
    console.log('download link count:', await page.getByRole('link', { name: /Download/ }).count());
    if (await dl.count()) console.log('download href:', await dl.getAttribute('href'));
  } else {
    console.log('no resource pill found');
  }
} else {
  console.log('no Product Market Fit module found');
}

await browser.close();
console.log('done');
