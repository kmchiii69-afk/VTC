// One-off: render a mock IG DM chat, screenshot it, and feed it to the CRM
// assistant's /extract endpoint to verify vision extraction end-to-end.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { SignJWT } from 'jose';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const SECRET = new TextEncoder().encode(get('JWT_SECRET') || 'ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: get('ADMIN_EMAIL') || 'info@gohconsulting.com', role: 'admin', v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(SECRET);

const HTML = `<html><body style="margin:0;background:#000;font-family:Helvetica,Arial;width:420px">
<div style="padding:14px;color:#fff;border-bottom:1px solid #222;font-weight:600">@jane_fit_coach</div>
<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
  <div style="align-self:flex-start;background:#262626;color:#fff;padding:10px 14px;border-radius:18px;max-width:75%">Hey! Saw your reel on client acquisition, really good stuff</div>
  <div style="align-self:flex-end;background:#3797f0;color:#fff;padding:10px 14px;border-radius:18px;max-width:75%">Thanks Jane! Appreciate you reaching out 🙏 What are you working on right now?</div>
  <div style="align-self:flex-start;background:#262626;color:#fff;padding:10px 14px;border-radius:18px;max-width:75%">I run an online fitness coaching business, doing about 12k a month but stuck there for a while</div>
  <div style="align-self:flex-end;background:#3797f0;color:#fff;padding:10px 14px;border-radius:18px;max-width:75%">Got it — that plateau is super common. Would you be open to a quick call this week to map out what's capping your growth?</div>
  <div style="align-self:flex-start;background:#262626;color:#fff;padding:10px 14px;border-radius:18px;max-width:75%">Yeah I'd be down. How does Thursday look?</div>
</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 640 });
await page.setContent(HTML);
const b64 = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 85 });
await browser.close();

const res = await fetch('http://localhost:3000/api/crm/assistant/extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: `ba_auth_token=${token}` },
  body: JSON.stringify({ images: [b64], source: 'screenshot' }),
});
const d = await res.json();
console.log('HTTP', res.status);
console.log('--- TRANSCRIPT ---');
console.log(d.transcript || d.error);
console.log('--- conversationId:', d.conversationId, '| imageCount:', d.imageCount);
