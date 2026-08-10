// Verification for the Creative Specialist roadmap: lists who carries the tag,
// then drives /roadmap as one of them (or as a temporarily-tagged test member)
// and asserts the creative phases render and a step toggles.
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';

// minimal .env.local loader (same as scripts/verify-migrations.mjs)
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const { data: users, error } = await db.from('portal_users').select('email, name, role, active, features, tags, onboarded_at');
if (error) throw error;

const creative = users.filter((u) => (u.features || []).includes('creative_specialist'));
console.log(`\nMembers tagged creative_specialist: ${creative.length}`);
creative.forEach((u) => console.log(`  - ${u.name || '(no name)'} <${u.email}> role=${u.role} onboarded=${!!u.onboarded_at}`));

// /portal bounces un-onboarded members into the wizard, so prefer an onboarded
// one — that lets this run reach the portal's roadmap view too.
const target = creative.find((u) => u.role !== 'admin' && u.onboarded_at) ?? creative.find((u) => u.role !== 'admin') ?? creative[0];
if (!target) {
  console.log('\nNo member carries the tag yet — nothing to drive. Tag one in /admin → Members → Features.');
  process.exit(0);
}

const SECRET = new TextEncoder().encode(env.JWT_SECRET || 'ba-portal-jwt-secret-change-in-production');
const token = await new SignJWT({ email: target.email, role: target.role, v: 1 })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'ba_auth_token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
await ctx.addInitScript((email) => {
  ['roadmap', 'portal', 'select'].forEach((id) => localStorage.setItem(`tour_${id}_${email}`, '1'));
}, target.email);
const page = await ctx.newPage();

await page.goto('http://localhost:3000/roadmap', { waitUntil: 'networkidle', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4500));

// What the API says this member's roadmap is (fetched in-page so it rides the
// same session cookie the app uses).
const readProgress = () => page.evaluate(() => fetch('/api/progress/roadmap', { cache: 'no-store' }).then((r) => r.json()));
const payload = await readProgress();
console.log(`\n/api/progress/roadmap → variant=${payload.variant} open=${payload.open} completed=${(payload.completed || []).length}`);

const body = await page.locator('body').innerText();
const expectedTabs = ['Strategy & Foundations', 'The System', 'Pre Production', 'Filming', 'Post Production', 'Leadership', 'Feedback Loop & Scaling'];
console.log('\nPhase tabs present:');
for (const t of expectedTabs) console.log(`  ${body.includes(t) ? '✓' : '✗'} ${t}`);
// innerText applies CSS text-transform, so these headings arrive uppercased.
const lower = body.toLowerCase();
console.log(`\nHeader says "Creative Specialist Roadmap": ${lower.includes('creative specialist roadmap') ? '✓' : '✗'}`);
console.log(`Tech stack strip rendered: ${lower.includes('our tech stack') && lower.includes('wispr flow') ? '✓' : '✗'}`);
console.log(`Resource link pills rendered: ${lower.includes('executing with intention (canva)') ? '✓' : '✗'}`);
console.log(`  Visual Identity doc pill:   ${lower.includes('visual identity (doc)') ? '✓' : '✗'}`);
// "Existing Client" members have an open roadmap, so locks are expected absent.
console.log(payload.open
  ? `Phase locking: n/a (open roadmap — "Existing Client") ${body.includes('🔒') ? '✗ locks shown anyway' : '✓'}`
  : `Phase 2+ locked until Phase 1 done: ${body.includes('🔒') ? '✓' : '✗'}`);
console.log(`Standard roadmap leaked in: ${/Content Foundation|Optimise your IG profile/.test(body) ? '✗ YES (bug)' : '✓ no'}`);

// Toggle the first step and confirm it persists through the API.
const firstCheck = page.locator('button[title="Mark complete"]').first();
if (await firstCheck.count()) {
  await firstCheck.click();
  await new Promise((r) => setTimeout(r, 4500));
  const after = await readProgress();
  const csIds = (after.completed || []).filter((id) => id.startsWith('cs1'));
  console.log(`\nToggle persisted: ${csIds.length > 0 ? `✓ (${csIds.join(', ')})` : '✗ nothing saved'}`);
  // Put it back so this run leaves no trace on a real member's progress.
  await page.locator('button[title="Mark incomplete"]').first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 4500));
  const cleaned = await readProgress();
  console.log(`Cleaned up: ${(cleaned.completed || []).filter((id) => id.startsWith('cs1')).length === 0 ? '✓' : '✗ left rows behind'}`);
}

await page.screenshot({ path: 'scripts/shots/creative-roadmap.png', fullPage: false });
// Second shot: the bottom of the page, where the tech stack strip sits.
await page.evaluate(() => document.querySelector('main > div[style*="overflow"]')?.scrollTo(0, 99999));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: 'scripts/shots/creative-roadmap-techstack.png' });
console.log('\nScreenshots → scripts/shots/creative-roadmap.png, creative-roadmap-techstack.png');

// Phase 2's Content Production Workflow doc lives one tab over.
await page.getByText('The System', { exact: false }).first().click();
await new Promise((r) => setTimeout(r, 1200));
const p2body = (await page.locator('body').innerText()).toLowerCase();
console.log(`  Content Workflow doc pill:  ${p2body.includes('content production workflow (doc)') ? '✓' : '✗'}`);

// ── The /portal surface (sidebar counter + phase cards) for the same member ──
await page.goto('http://localhost:3000/portal?view=roadmap', { waitUntil: 'networkidle', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4500));
const pb = (await page.locator('body').innerText()).toLowerCase();
console.log(`\n/portal roadmap view:`);
console.log(`  Creative phase cards:  ${pb.includes('strategy & foundations') && pb.includes('feedback loop & scaling') ? '✓' : '✗'}`);
console.log(`  Counts out of 31:      ${pb.includes('/ 31') || pb.includes('/31') ? '✓' : '✗'}`);
console.log(`  Standard phases gone:  ${/content foundation/.test(pb) ? '✗ LEAKED (bug)' : '✓'}`);
await page.screenshot({ path: 'scripts/shots/creative-roadmap-portal.png' });

// ── Regression: an untagged member must still get the STANDARD roadmap ──────
const plain = users.find((u) => u.role !== 'admin' && u.active && !(u.features || []).includes('creative_specialist'));
if (plain) {
  const t2 = await new SignJWT({ email: plain.email, role: plain.role, v: 1 })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(SECRET);
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx2.addCookies([{ name: 'ba_auth_token', value: t2, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx2.addInitScript((email) => { localStorage.setItem(`tour_roadmap_${email}`, '1'); }, plain.email);
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:3000/roadmap', { waitUntil: 'networkidle', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4500));
  const b2 = (await p2.locator('body').innerText()).toLowerCase();
  const v2 = await p2.evaluate(() => fetch('/api/progress/roadmap', { cache: 'no-store' }).then((r) => r.json()));
  console.log(`\nUntagged member (${plain.email}) → variant=${v2.variant}`);
  console.log(`  Standard phases shown:      ${b2.includes('content foundation') && b2.includes('messaging') ? '✓' : '✗'}`);
  console.log(`  Creative roadmap kept out:  ${/strategy & foundations|our tech stack/.test(b2) ? '✗ LEAKED (bug)' : '✓'}`);
}

await browser.close();
