// Demo-shot the Creative Specialist weekly report + the Creative Specialist
// onboarding, against a local dev server on :3000.
//
//   node scripts/shot-weekly-report.mjs weekly      -- the member's report, filled in
//   node scripts/shot-weekly-report.mjs admin       -- the read-only review (CSM view)
//   node scripts/shot-weekly-report.mjs overview    -- the digest card on the client profile
//   node scripts/shot-weekly-report.mjs onboarding  -- the one-form CD onboarding
//
// The report runs STUB the API so the UI can be seen before
// supabase-creative-weekly-reports.sql has been run by hand. Everything rendered
// (every auto-calculated field, the commitment read-out, the escalation banner) is
// the real component computing off the real schema — only the DB round-trip is faked.
import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const TARGET = process.argv[2] || 'weekly';
const EMAIL = process.env.SHOT_EMAIL || 'info@gohconsulting.com';
const ROLE = process.env.SHOT_ROLE || 'admin';
const SECRET = new TextEncoder().encode('ba-portal-jwt-secret-change-in-production');

const token = await new SignJWT({ email: EMAIL, role: ROLE, v: 1 })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(SECRET);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([{
  name: 'ba_auth_token', value: token, domain: 'localhost', path: '/',
  httpOnly: true, sameSite: 'Lax',
}]);
await ctx.addInitScript((email) => {
  ['hub', 'sops', 'assistant', 'select', 'modules'].forEach((id) =>
    localStorage.setItem(`tour_${id}_${email}`, '1'));
  localStorage.setItem(`ob_tour_${email}`, '1');
}, EMAIL);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, full = true) => {
  await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: full });
  console.log('shot', name);
};
// Clip to one section card so the detail is actually readable.
const crop = async (name, heading) => {
  const card = page.locator('section', { has: page.locator('h3', { hasText: heading }) }).first();
  const box = await card.boundingBox();
  if (!box) return;
  await page.screenshot({
    path: `scripts/shots/${name}.png`, fullPage: true,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  console.log('shot', name);
};

const WEEK = '2026-08-03';

// A realistic week: 8 booked / 6 taken / 3 closed, IG carrying reach, YouTube
// building watch time, 2 of 3 assigned to-dos done.
const ANSWERS = {
  qualified_booked_calls: '8', closed: '3', taken: '6', no_shows: '2',
  revenue_generated: '30000', total_cash: '12500', new_cash: '9000',
  payment_plans_collected: '3500', icps_this_week: '10',

  ig_views_7d: '412000', ig_follower_growth: '1240', ig_views_month: '1600000',
  ig_top_reels: [
    { name: 'Founder story — "I almost quit"', views: '184000', followers: '620' },
    { name: 'Client win breakdown', views: '61000', followers: '210' },
    { name: 'Studio B-roll + VO', views: '28000', followers: '95' },
  ],
  ig_reels_pipeline: [
    { name: 'Hook test — cold open vs question' },
    { name: 'Client win #2' },
    { name: 'Behind the shoot' },
    { name: 'Offer explainer' },
  ],

  yt_views: '22000', yt_watch_hours: '910', yt_subscribers_net: '340',
  yt_avg_view_duration: '4:32', yt_ctr: '6.4',
  yt_pipeline: [
    { name: 'Long form — the full system' },
    { name: 'Case study interview' },
  ],

  missed_reasons: { t3: 'Founder was travelling Tue–Thu, no footage to cut.' },
};

const ACTION_ITEMS = [
  { id: 't1', text: 'Ship 8 Instagram reels', done: true, assignedDate: '2026-08-03', completedAt: '2026-08-06T10:00:00Z' },
  { id: 't2', text: 'Film two sessions with the founder', done: true, assignedDate: '2026-08-03', completedAt: '2026-08-05T09:00:00Z' },
  { id: 't3', text: 'Edit and publish the YouTube long form', done: false, assignedDate: '2026-08-04', completedAt: null },
];

const ESCALATION = 'Commitment completion under 70% two weeks running (64% → 67%) — this is the intervention point.';

if (TARGET === 'weekly') {
  await page.route('**/api/me/weekly-report*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ json: { ok: true, saved: true } });
    return route.fulfill({
      json: {
        weekStart: WEEK, weekLabel: 'Aug 3–9', weekNumber: 8,
        answers: ANSWERS,
        actionItems: ACTION_ITEMS,
        submittedAt: null, sentAt: null,
        derived: {}, missing: [],
        escalations: [ESCALATION],
        history: [
          { weekStart: '2026-08-03', weekLabel: 'Aug 3–9', submittedAt: null, sentAt: null },
          { weekStart: '2026-07-27', weekLabel: 'Jul 27 – Aug 2', submittedAt: '2026-07-31T09:02:00Z', sentAt: '2026-07-31T17:20:00Z' },
          { weekStart: '2026-07-20', weekLabel: 'Jul 20–26', submittedAt: '2026-07-24T08:55:00Z', sentAt: '2026-07-24T16:10:00Z' },
        ],
      },
    });
  });
  await page.goto(`http://localhost:3000/weekly-report?week=${WEEK}`, { waitUntil: 'networkidle' });
  await wait(1500);
  console.log('sections:', (await page.locator('h3').allTextContents()).join(' | '));
  await shot('weekly-report-filled');
  await crop('wr-crop-1-sales', 'Sales');
  await crop('wr-crop-2-content', 'Content');
  await crop('wr-crop-3-commitment', 'Commitment');
} else if (TARGET === 'admin' || TARGET === 'overview') {
  const report = {
    id: '00000000-0000-4000-8000-000000000001',
    weekStart: WEEK, weekLabel: 'Aug 3–9',
    answers: ANSWERS, actionItems: ACTION_ITEMS,
    submittedAt: '2026-08-07T09:12:00Z', sentAt: null,
    derived: {
      weekNumber: 8, rangeLabel: 'Aug 3–9',
      showRate: 75, closeRate: 50, noShowRate: 25,
      revenue: 30000, totalCash: 12500, newCash: 9000,
      igViewsPerDay: 58857, igViews7d: 412000, igFollowerGrowth: 1240,
      ytViews: 22000, ytWatchHours: 910, reelsInPipeline: 4, videosInPipeline: 2,
      commitment: { assigned: 3, completed: 2, completionRate: 67, missed: [ACTION_ITEMS[2]] },
    },
    missing: [],
  };

  if (TARGET === 'admin') {
    await page.route('**/weekly-reports', async (route) => route.fulfill({
      json: {
        onWeeklyReport: true, currentWeek: WEEK, escalations: [ESCALATION],
        reports: [
          report,
          { ...report, id: '...2', weekStart: '2026-07-27', weekLabel: 'Jul 27 – Aug 2', sentAt: '2026-07-31T17:20:00Z' },
          { ...report, id: '...3', weekStart: '2026-07-20', weekLabel: 'Jul 20–26', sentAt: '2026-07-24T16:10:00Z' },
        ],
      },
    }));
  } else {
    // Patch the digest + a submission event into the real journey response.
    await page.route('**/journey', async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      const wk = (weekStart, weekLabel, rate, done, sent) => ({
        weekStart, weekLabel, submittedAt: '2026-08-07T09:12:00Z', sentAt: sent,
        completionRate: rate, todosAssigned: 3, todosCompleted: done,
        bookedCalls: 8, closed: 3, closeRate: 50, totalCash: 12500, newCash: 9000,
        igViews7d: 412000, igFollowerGrowth: 1240, ytViews: 22000, ytWatchHours: 910,
      });
      j.weeklyReports = {
        escalations: [ESCALATION],
        awaitingSubmission: false, awaitingSend: true,
        weeks: [
          wk('2026-08-03', 'Aug 3–9', 67, 2, null),
          wk('2026-07-27', 'Jul 27 – Aug 2', 64, 2, '2026-07-31T17:20:00Z'),
          wk('2026-07-20', 'Jul 20–26', 100, 3, '2026-07-24T16:10:00Z'),
        ],
      };
      j.events = [{
        id: 'stub-wr', event_type: 'weekly_report_submitted',
        title: 'Weekly report · Aug 3–9',
        summary: '50% close rate · $12,500 cash · 412,000 IG views · 67% of to-dos',
        metadata: null, occurred_at: new Date(Date.now() - 3600_000).toISOString(),
      }, ...(j.events ?? [])];
      return route.fulfill({ response: res, json: j });
    });
  }

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle' });
  await wait(2000);
  await page.getByRole('button', { name: 'Client Success', exact: true }).first().click();
  await wait(2000);
  const search = page.locator('input[placeholder*="Search" i]').first();
  if (await search.count()) { await search.fill('sggreene'); await wait(900); }
  await page.locator('text=sggreene2@gmail.com').first().click();
  await wait(2500);

  if (TARGET === 'admin') {
    await page.getByRole('button', { name: /Weekly reports/i }).first().click();
    await wait(1800);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await wait(700);
    await page.screenshot({ path: 'scripts/shots/weekly-report-admin-review.png' });
    console.log('shot weekly-report-admin-review');
  } else {
    const b = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('div'))
        .find((d) => d.textContent?.trim() === 'Weekly reports');
      const card = label?.parentElement?.parentElement;
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
    });
    if (b) {
      await page.screenshot({
        path: 'scripts/shots/wr-csm-overview-card.png', fullPage: true,
        clip: { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 },
      });
      console.log('shot wr-csm-overview-card');
    }
  }
} else {
  // Never write to this real account: the form only POSTs on the final Submit,
  // but stub it anyway so a stray click can't reach the DB.
  await page.route('**/api/me/forms/creative', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ json: { ok: true } });
    return route.continue();
  });
  await page.goto('http://localhost:3000/onboarding', { waitUntil: 'networkidle' });
  await wait(1500);
  console.log('h1:', await page.locator('h1').first().textContent());
  await shot('cd-onboarding-welcome', false);
  const start = page.getByRole('button', { name: /start the form/i });
  if (await start.count()) { await start.first().click(); await wait(1200); }
  await shot('cd-onboarding-form', false);

  const stop = process.env.SHOT_CARD ? Number(process.env.SHOT_CARD) : 3;
  for (let card = 1; card < stop; card++) {
    for (const input of await page.locator('input[type="text"], input[type="date"], input[type="tel"], input[type="email"], input[type="number"], textarea').all()) {
      if ((await input.inputValue()).trim() !== '') continue;
      const isArea = (await input.evaluate((el) => el.tagName)) === 'TEXTAREA';
      await input.fill(isArea
        ? 'Sample answer long enough to clear the minimum-length gate on written questions, describing the current workflow end to end in detail.'
        : 'Sample');
    }
    await page.evaluate(() => {
      const skip = /^(Continue|Back|Back to onboarding|Submit form)$/;
      const seen = new Set();
      for (const b of Array.from(document.querySelectorAll('button'))) {
        const t = (b.textContent || '').trim();
        if (!t || skip.test(t)) continue;
        const p = b.parentElement;
        if (!p || seen.has(p) || p.querySelectorAll(':scope > button').length < 2) continue;
        seen.add(p);
        b.click();
      }
    });
    await wait(300);
    const next = page.getByRole('button', { name: /^Continue$/ });
    if (!(await next.count()) || (await next.first().isDisabled())) break;
    await next.first().click(); await wait(500);
  }
  console.log('card labels:', (await page.locator('label').allTextContents()).join(' | '));
  await shot('cd-onboarding-form-questions', false);
}

await browser.close();
