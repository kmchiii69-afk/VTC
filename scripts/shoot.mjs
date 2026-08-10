import fs from 'node:fs';
import path from 'node:path';
import { SignJWT } from 'jose';
import puppeteer from 'puppeteer-core';

// --- read JWT_SECRET from .env.local ---
const env = fs.readFileSync('.env.local', 'utf8');
const secretLine = env.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET='));
// Strip surrounding quotes; if empty, fall back to the same default auth.ts uses.
const rawSecret = (secretLine ? secretLine.slice('JWT_SECRET='.length) : '').trim().replace(/^["']|["']$/g, '');
const SECRET = new TextEncoder().encode(rawSecret || 'ba-portal-jwt-secret-change-in-production');

const token = await new SignJWT({ email: 'info@gohconsulting.com', role: 'admin' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(SECRET);

const OUT = '.screenshots';
fs.mkdirSync(OUT, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

async function shoot(name, { width, height, mobile, url, expandFirst }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: !!mobile, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile });
  await page.setCookie({ name: 'ba_auth_token', value: token, url: 'http://localhost:3000', path: '/' });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  if (expandFirst) {
    // open the first recording bar to reveal the player + new date layout + edit
    await page.evaluate(() => {
      const btn = document.querySelector('.view-in button');
      if (btn) btn.click();
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
  }
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log('saved', file);
  await page.close();
}

const base = 'http://localhost:3000';
await shoot('desktop-dashboard.png',  { width: 1440, height: 900, url: `${base}/portal?view=dashboard` });
await shoot('desktop-recordings.png', { width: 1440, height: 900, url: `${base}/portal?view=recordings`, expandFirst: true });
await shoot('mobile-dashboard.png',   { width: 390,  height: 844, mobile: true, url: `${base}/portal?view=dashboard` });
await shoot('mobile-recordings.png',  { width: 390,  height: 844, mobile: true, url: `${base}/portal?view=recordings`, expandFirst: true });

await browser.close();
console.log('done');
