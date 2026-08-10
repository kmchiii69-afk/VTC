# Session handoff — resume here

## 🆕 2026-07-30 (later) — Calendly bookings in the CRM, upload deletion, Twilio inbound

### Shipped and deployed (on `origin/main`)
1. **`ef04066` — deleting an uploaded document now deletes the file.** Every upload
   path kept only the public URL, so "Remove" deleted the reference and left the PDF
   downloadable by link. `lib/storage-cleanup.ts` works off the URL rather than the
   shape that stored it (`storageRefsIn` / `removeStoredFiles` / `pruneRemovedFiles`),
   wired into acquisition blobs, onboarding uploads, creative SOPs, Resources and
   BA-beta rows. The SooWei AI attachment had no delete path at all — now
   `DELETE /api/me/content-context/upload` + a Remove link, and the page reads
   `hasOffer` on load so it shows on a return visit.
   - **Gotcha:** public storage URLs are edge-cached, so a URL still 200s for a
     while after deletion — check the bucket LISTING, not the URL.
   - Cleanup is best-effort and swallows errors: it's awaited after the caller's
     write, so throwing would report a good save as a 500 (it did, once).
2. **`65ae711` + `78556e5` — every strategy-call booking lands in the CRM.** Before,
   a Calendly booking only reached the CRM if the person had a funnel application:
   16 of 141 people over 60 days. `lib/calendly-crm.ts` files all five strategy-call
   calendars, routed by UTM (`vsl` → VSL Pipeline, `ads` → Ads Pipeline, else Sales),
   never demoting a lead already worked in VSL/Ads. Notes get the calendar, time in
   the invitee's timezone, every UTM and every Q&A; phone / Instagram / revenue are
   lifted into the real columns when blank. Cancelled bookings create leads in a new
   `cancelled` stage (added to each pipeline on demand) with **no** follow-up date —
   the cadence treats `/cancel/` as a reset stage, so a date would dump them all into
   Due Today. Reschedules stay put (Calendly sends canceled+created).
   - Backfill ran: CRM 223 → 280 leads. 14 Sales/Call Booked, 3 VSL/Booked, 58
     Cancelled (50 Sales, 6 VSL, 2 Ads); all 58 cancelled have a phone number.
   - `POST /api/admin/sync-bookings?only=crm&days=N` (the ↻ Sync button). CRM pass
     runs first — the applications pass walks a 7-month window and is the slow one.

### ⚠️ Run this SQL, then click ↻ Sync bookings from Calendly once
`supabase-crm-calendly-bookings.sql` — adds `utm_source/medium/campaign/content/term`,
`booked_at`, `calendar`, `calendly_event_uri` to `crm_leads`. Until it runs, the write
drops those columns and retries, so the UTMs live only in the notes text.

### On hold, NOT pushed — `b866b3f` (Twilio inbound)
Forwards inbound calls to `TWILIO_FORWARD_NUMBER` (unset → plays "we'll call you
straight back") and logs inbound SMS on the lead's timeline. **The live number still
plays Twilio's demo greeting** — nothing changes until this deploys AND
`+19788458591`'s webhooks are repointed at `/api/webhooks/twilio/{inbound,sms}`.
Needs `supabase-crm-inbound.sql` (adds `'sms'` to the touchpoint channel check; until
then texts log as `other`).

### Open
- Outbound Twilio **geo permissions still OFF** for IE, IT, NL, NO, PL, PT, AT, BE,
  FI, CZ (US/GB/DE/FR/ES/SE/DK/CH/AU on). Dials to those fail.
- "Strategy Call" exists 5× in Calendly; only the 3 owned by **SooWei Goh** are
  synced. The ones owned by "Goh Consulting" and "Yash" are deliberately excluded.
- One leftover `crm_calls` row from the dialer test call (to the company's own
  number) — delete whenever. Two `ZZ` demo leads still in the CRM.

## 🆕 2026-07-30 — Dialer shipped and verified with a real call

Committed and pushed to `main` (4 commits + a fix), auto-deployed to production.
**The dialer works end to end** — verified by placing an actual call, not just by
reading the code:

- Placed one real call from the browser softphone to the account's own Twilio
  number (+19788458591, whose inbound handler is still the Twilio demo greeting,
  so nobody was disturbed). Twilio logged all three legs completed, 11s, zero
  account alerts; `crm_calls` came back `completed / answered / 11s` with a
  dual-channel recording attached, and the recording proxy served an 85 KB MP3.
- Signed-webhook checks against production: a real `X-Twilio-Signature` is
  accepted and a forged one gets a 403 `<Reject/>`, which also confirms prod's
  `APP_URL` and auth token are right. The returned TwiML carries the US caller
  ID, `record-from-answer-dual`, and absolute callback URLs.
- Simulated a completed status callback against the demo lead: `crm_calls`
  updated, a `Dialer call · 42s` touchpoint dropped, `dials_made` 0→1, and the
  follow-up date rolled a day. (Those test rows have since been deleted and the
  lead's cadence fields restored.)
- **Bug found and fixed while testing:** `new Response('', { status: 204 })`
  throws — the Response constructor rejects a body on a null-body status — so the
  `/status` and `/recording` callbacks did all their work and *then* returned a
  500. Every completed call would have shown up in Twilio's error log as an
  11200. Now `new Response(null, …)`; re-verified 204 on prod.

Still open on the Twilio side (console clicks, no code): outbound **geo
permissions are off for IE, IT, NL, NO, PL, PT, AT, BE, FI, CZ** (US/GB/DE/FR/ES/
SE/DK/CH/AU are on) — a dial to those countries will fail until they're enabled
under Voice → Settings → Geo permissions. The UK number is still pending its
regulatory bundle, so `TWILIO_NUMBER_UK` is unset and UK/EU leads get the US
caller ID. Inbound calls to +19788458591 still play the Twilio demo greeting — if
a lead calls back, that's what they hear. One leftover `crm_calls` row from the
test call is in the CRM (to the company's own number) — delete it whenever.

## 🆕 2026-07-28 — Setter follow-up system, sales-call DQ fixes, Twilio dialer

**State: shipped 2026-07-30** — see the section above. All three SQL migrations
have been run in Supabase. To pick this up again, see "Restart" at the end of this
section.

### 1. Setter follow-up cadence (CRM)
The setter never picks a date. `lib/crm-followup.ts` is the single source of truth
(pure module, shared by API routes and the UI):
- Cadence: daily days 0-7, every 3 days 8-21, weekly day 22+, anchored on Last Activity.
  A No Show / Cancelled stamps `reset_at` → daily for 7 days regardless of lead age.
- Follow-up auto-clears for Call Booked / Rescheduled / Closed / DQ / Closed Lost / Ghosted.
- `stageKind()` classifies stages by key AND label, so renamed stages ("Didn't Show") and
  the VSL/Ads pipelines (`booked`, `showed`, `no_show`) behave correctly.
- Writes: a stage change or `log_activity: true` on `PATCH /api/crm/leads/[id]` re-stamps
  activity and recomputes the date. An explicit `next_followup_at` always wins. Any other
  edit (tags, notes) leaves the schedule alone. Touchpoints and Close call-sync also count
  as activity. Marking a DQ stage also sets `status = 'DQ'`.
- UI: `Due Today` tab (was Priority Queue) with per-row one-click outcomes, contact links,
  a cadence panel in the drawer, and an `Upcoming` disclosure.
- Bulk paths deliberately do NOT start the cadence (would bury the queue); CSV import has
  an opt-in "Start follow-ups" checkbox and the SQL ships a commented-out backfill.

**Gotcha that cost a debugging cycle:** naming a not-yet-migrated column in a PostgREST
`select` fails the READ, which silently skipped the whole cadence block. Reads that may
predate a migration use `select('*')`; writes go through `lib/db-write.ts`.

### 2. Sales Calls — DQs and one profile per person
- Root cause of missing DQs: `close_outcome` was a bare enum with no definitions, so a
  prospect who showed up, got pitched and said no was labelled `no_close` even when never
  qualified. Fixed with explicit OUTCOME DEFINITIONS in the prompt plus a separate
  `disqualified` boolean + `dq_reason`; `resolveCallOutcome()` maps the pair. Verified on
  synthetic transcripts: unqualified-but-pitched → `dq`, genuine no-close → `no_close`.
- `calls.outcome_locked` pins any hand-set outcome so a re-sync can't flip it back.
- `CallsView` groups by lead: expandable profile rows, people-based stats (live data read
  49 people from 54 calls), `By person / By call` toggle.

### 3. Twilio dialer (browser softphone)
- Client: `components/crm/use-softphone.ts` + `components/crm/DialerPanel.tsx`
  (keypad, paste-a-number, live timer, mute, DTMF, list dialer, per-lead Dial button).
- Server: `lib/twilio.ts`; token at `/api/crm/dialer/token`; webhooks at
  `/api/webhooks/twilio/{voice,status,recording,notice}` — that prefix is already
  auth-exempt in `proxy.ts`, so they're secured by `X-Twilio-Signature` instead.
- A completed dial writes `crm_calls`, drops a touchpoint, +1 Dials Made, and stamps
  cadence activity (so dialing rolls the follow-up date like Log Follow-Up).
- Recording is ON with no announcement (explicit choice). `TWILIO_RECORDING_NOTICE=<sentence>`
  turns on a whisper to the lead; empty = silent.
- **Deliberately does NOT import the `twilio` npm package** — it dragged a huge module graph
  into every route handler. Token = `jose` HS256 with `cty: twilio-fpa;v=1`, signature =
  HMAC-SHA1 over URL + sorted params, TwiML = a small XML builder. All three verified
  byte-identical against the SDK before it was removed. `@twilio/voice-sdk` stays (browser).

### Open items
1. **First real call still needs a public TwiML URL.** The TwiML App points at
   `https://gohconsulting.app/api/webhooks/twilio/voice`, and prod doesn't have this code
   yet. Either deploy, or temporarily point the TwiML App at a TwiML Bin (audio only) or a
   tunnel (full loop, but exposes localhost).
2. **Vercel env vars** before deploy: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`,
   `TWILIO_NUMBER_US`, `TWILIO_RECORD=1`. Confirm `APP_URL=https://gohconsulting.app`.
3. **UK number** pending the regulatory bundle → set `TWILIO_NUMBER_UK`, no code change.
4. **Voice geo permissions** were still off for IE, IT, NL, NO, PL, PT, AT, BE, FI, CZ at
   last check (US/CA, GB, DE, FR, ES, SE, DK, CH, AU on). Voice → Settings → Geo permissions.
5. **Two demo leads left in the CRM on purpose:** `ZZ Dialer Demo` (+15551234567, diallable)
   and `ZZ No Country Code` (shows the amber chip). Delete with the × when done.
6. **Optional cleanup:** extract `CRMView` out of `app/admin/page.tsx` into
   `components/admin/crm-view.tsx` (matching `csm-view.tsx`). The file is ~6,100 lines and
   Turbopack's dev compile of it is what exhausts memory (below).

### Restart
```
npm run build && npm start        # then http://localhost:3000/admin → CRM
```
Use the production build, not `npm run dev`: the dev server balloons past 8-10 GB
compiling `app/admin/page.tsx` on this 16 GB machine and starts failing API calls. The
built server serves the same page in ~50 ms at ~50 MB. `scripts/shot-dialer.mjs` and
`scripts/shot-setter-crm.mjs` screenshot the CRM (playwright is installed `--no-save`, so
any `npm install`/`uninstall` prunes it — reinstall with
`npm install --no-save playwright@1.62.0`).

## 🆕 2026-07-12 (follow-up) — Fixed booking calendar showing an error on the current month

Verified the 3 new ads-segment pages reuse the same case-study YouTube IDs,
`box1/2/3-*.png` images, and `logo.png` as `/funnel/vsl` (all confirmed 200 /
embeddable). While verifying the embedded `BookingCalendar`, found a **real
pre-existing bug shared by every funnel page** (not introduced today):
`app/api/calendly/available-times/route.ts` always requested
`start_time = start of month`. Since `BookingCalendar` defaults to the
*current* month, any lead reaching the booking step mid-month got Calendly's
`start_time must be in the future` error instead of open slots — the
calendar looked broken on first load until they manually clicked next month.

Fixed by clamping `start_time` to `now + 5min` (Calendly needs headroom past
its own clock) whenever the requested month has already started, and
short-circuiting to an empty result if the whole requested month is in the
past. Verified live against the real Calendly account (read-only
`available-times` call, no booking created): current month now returns real
open slots (`2026-07-13 12:15 PM`, `2026-07-20 10:00 AM` at verification
time) instead of an error. `tsc --noEmit` + `npm run build` still pass.

---

## 🆕 2026-07-12 — Ads-gate segmentation (under-100k / over-100k-ads / over-100k-no-ads) (local, uncommitted)

`/funnel/ads` is now a qualifying gate, not a landing page. On load it asks
revenue tier (under/over $100k/mo), then — if over $100k — whether they're
running paid ads, and routes (preserving UTM query string) to one of 3 new
VSL-style segment pages, each with its own Supabase table so volume/conversion
can be measured per segment instead of blended.

### What was built
1. **`app/funnel/ads/page.tsx`** — rewritten as the 2-question full-screen
   gate (replaces the old short-form ads landing page content). Tracks
   `ads_gate_revenue_answer` / `ads_gate_ads_answer` / `ads_gate_routed` via
   `trackEvent('ads-gate', ...)` + `fireCustom`.
2. **`components/funnel/SegmentFunnel.tsx`** — shared VSL-style body (Vidalytics
   embed, same 13-step qualification form as `/funnel/vsl`, embedded
   `BookingCalendar`) parameterized by a `SegmentConfig` (segment slug, API
   endpoint, hero copy, optional `proofLine` stat callout).
3. **3 new pages**, each a thin wrapper passing segment-specific copy pulled
   from SooWei's own training data / voice guide (`lib/coaching-context.ts`
   `SOOWEI_VOICE` + `training-data/best-performing-content.txt`):
   - `app/funnel/ads/under-100k/page.tsx` — "Nobody cares about your results
     until they care about you" angle (his own script #4).
   - `app/funnel/ads/over-100k-ads/page.tsx` — "make your ads cheaper" angle;
     `proofLine` stat (45% vs 64% profit margin, CAC compounds down instead of
     up) sourced from a Cole Gordon ads-vs-organic debate transcript the user
     pasted in-session.
   - `app/funnel/ads/over-100k-no-ads/page.tsx` — "you already bet on organic,
     now make it compound" angle (his own "Bitcoin in 2013" script).
4. **`app/api/funnel/segment-application/route.ts`** — new route, `segment`
   in the body maps to one of 3 tables (`SEGMENT_TABLES`), otherwise mirrors
   `application/route.ts` (Supabase upsert + CRM lead + GHL contact/tags,
   tagged `segment-<slug>`).
5. **`supabase-ads-segments.sql`** — creates the 3 tables
   (`ads_under_100k_applications`, `ads_over_100k_ads_applications`,
   `ads_over_100k_noads_applications`), same shape as the (untracked-in-repo)
   `vsl_applications` table.

### ⚠️ Run this SQL in Supabase (`mqaufrypvxrmvzknmnvs`) before deploying
`supabase-ads-segments.sql` — until it's run, the 3 segment tables don't
exist and `/api/funnel/segment-application` upserts fail silently (caught,
logged; GHL contact creation still succeeds since it doesn't depend on the DB
write).

### Open / next
- **`tsc --noEmit` + `npm run build` pass.** Confirmed all 4 routes
  (`/funnel/ads` + 3 segment pages) return 200 in dev.
- Did NOT test-submit the new form end-to-end locally — the API route hits
  the live GHL account (`GHL_PIT`/`GHL_LOC` are prod credentials, same as
  every other funnel route), so a real test submission would create a real
  contact. Test with a throwaway email if you want to verify GHL tagging.
- Noticed the dev server 500'd on **every** route (not just the new ones)
  with `TypeError: adapterFn is not a function` right after the last build —
  turned out to be a stale `.next` cache, not a code issue. Fixed with
  `rm -rf .next` before restarting `npm run dev`. Mention if it recurs.
- Copy is a first draft — segment hero/subheadline/proofLine live in each
  page's `cfg` object, easy to iterate without touching the shared component.
- Not done: no admin-panel view of the 3 new segment tables yet (they're
  Supabase-only for now, same as `vsl_applications`).

---

## 🆕 2026-07-11 — Multi-touch attribution + pixel/CAPI tracking pipeline (committed to local `main`, not pushed)

Ported the event-tracking architecture from the Mercatus/Prophecy funnel stack
(`~/Desktop/mercatus-main/swift-fix/src/services/funnelTracker.ts` +
`pixelTracker.ts`) — same concepts, rebuilt for Supabase/Postgres instead of
Firestore, and for gohconsulting's actual funnels (`/funnel/ig`, `/funnel/ads`,
`/funnel/vsl`) instead of Prophecy's product set. `tsc --noEmit` + `npm run
build` both pass.

### ⚠️ Run this SQL in Supabase (`mqaufrypvxrmvzknmnvs`) before deploying
`supabase-funnel-events.sql` — new `funnel_events` table (generic event log:
session, funnel, attribution first/last-touch, stage velocity, cross-funnel
journey). Until it's run, `/api/track/event` inserts fail silently (caught,
logged, funnel pages keep working) and the new admin panel shows an empty state.

### What was built
1. **`lib/funnel-tracker.ts`** — client event pipeline: session id, bot filter,
   30-day first-touch cookie (`_ba_ft`) + rolling touchpoint log (last-touch +
   touch count), per-funnel stage velocity (chronological, no hardcoded stage
   map needed), cross-funnel journey tracking. `trackEvent(funnel, event, meta)`
   posts via `sendBeacon` (fetch fallback) to `/api/track/event`.
2. **`lib/pixel-tracker.ts`** — unified Meta Pixel / Google Ads (gtag) / TikTok
   Pixel firing + `fireOnce` idempotency guard. Milestone helpers: `fireLead`,
   `fireQualified`, `fireBooked`, `firePurchase`, plus `fireStandard`/`fireCustom`
   for view/engagement events. Every call also POSTs to `/api/track/capi` for a
   server-side Meta CAPI mirror.
3. **`app/api/track/event/route.ts`** — public, rate-limited (60/min/IP)
   ingestion into `funnel_events`.
4. **`app/api/track/capi/route.ts`** — server-side Meta Conversions API
   forwarding (SHA-256 hashed email, fbp/fbc cookies, IP/UA). No-ops until
   `META_PIXEL_ID` + `META_CAPI_ACCESS_TOKEN` are set.
5. **`app/funnel/layout.tsx`** — Meta/Google Ads/TikTok base pixel scripts,
   scoped to `/funnel/*` only (not the authed portal), gated on `NEXT_PUBLIC_*`
   env vars. Removed the old ad-hoc inline pixel-loader `useEffect` blocks from
   `app/funnel/ads/page.tsx` and `app/funnel/vsl/page.tsx` (duplicated the same
   snippet per-page) now that it's centralized here.
6. **Wired into all 3 funnel pages** — `ig`, `ads`, `vsl` now call
   `trackEvent`/pixel helpers at view, step, opt-in/application-submit, and
   qualified/booked milestones. `fireOnce` guards every one-shot conversion
   (keyed by `email`) so remounts/re-renders can't double-fire.
7. **`app/api/admin/funnel-events-analytics/route.ts`** + **`components/admin/
   AttributionVelocityPanel.tsx`** — new analytics section (wired into
   `AnalyticsView` in `app/admin/page.tsx`, right after Source Funnels): first-
   vs last-touch source breakdown, touch-count distribution, median
   stage-to-stage velocity per funnel, cross-funnel journey paths. Shows an
   empty state until the SQL above is run and real traffic accumulates.
8. **`.env.local.example`** — new "Ad pixels" section documenting every var:
   `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID` +
   `NEXT_PUBLIC_GOOGLE_ADS_LABEL_*`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`,
   `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_CAPI_TEST_EVENT_CODE`.

### Open / next
- **Nothing is pushed/deployed yet** (per usual — confirm before `git push
  consulting main` / `vercel --prod`).
- Real pixel/Ads/TikTok IDs are not filled in anywhere — everything no-ops
  safely until you paste real values into `.env.local` + Vercel env vars (see
  `.env.local.example`).
- The bigger Prophecy admin dashboard (`FunnelsTab.tsx`, cohort tables,
  heatmap embed) was only partially ported — `AttributionVelocityPanel` covers
  attribution/velocity/journeys; cohort-by-day data is computed in the API
  route (`dailyCohorts`) but not yet rendered in the UI.

### Follow-up same day — dev server fix + video analytics
- **Fixed: `/funnel/*` pages 500'd in local dev.** Turbopack was misdetecting
  the workspace root because of a stray, unrelated `/Users/kimchi/package-
  lock.json` (empty, dated May 18) — it walked up and picked `/Users/kimchi`
  as root, then couldn't resolve `tailwindcss`. Fixed by pinning
  `turbopack.root` to the project dir in `next.config.ts` (didn't touch the
  file in the home directory). Verified all 3 funnel pages + admin now return
  200 with `npm run dev`.
- **Added `lib/video-tracker.ts`** — per-second VSL engagement (play/pause/
  seek/milestones 25-50-75-100/session-end with watched-segment compression),
  attached to the Vidalytics embed on `/funnel/vsl` via `attachVideoTracker()`
  (polls for the `<video>` element the embed mounts, no-ops safely if it turns
  out to be a cross-origin iframe). Every event writes to our own
  `funnel_events` pipeline (so the admin dashboard can query it) **and** fires
  a Vercel Web Analytics custom event via `window.va` (`@vercel/analytics` is
  already installed/mounted in `app/layout.tsx` — free second view in the
  Vercel dashboard's Events tab, no new infra).
  - `app/api/admin/funnel-events-analytics/route.ts` now also aggregates video
    rows: play count, completion rate, avg watch time, milestone funnel.
  - `AttributionVelocityPanel.tsx` renders a "Video Analytics" section
    (only appears once `video.plays > 0`).

## 🆕 2026-06-30 — /select chat buttons persist, module↔resource links, recordings nav (local/uncommitted)

All local/uncommitted. `tsc --noEmit` passes after every change. Dev server: `npm run dev` → localhost:3000.

### ⚠️ Run this SQL in Supabase (`mqaufrypvxrmvzknmnvs`) — required for the new features
```sql
-- (1) Persist the SOP/module/resource link buttons with each chat message, so a
-- returning user sees the same buttons (not just bare text) after navigating away.
-- WITHOUT this, /select chat history loads EMPTY (the history query selects meta).
alter table public.content_messages  add column if not exists meta jsonb;
alter table public.advisor_messages  add column if not exists meta jsonb;
alter table public.csm_messages       add column if not exists meta jsonb;
alter table public.salesbot_messages  add column if not exists meta jsonb;

-- (2) Point the Product Market Fit doc's "make your copy" button at the correct
-- Google Doc (the live DB row had drifted from the default). Skip if the
-- `resources` table doesn't exist yet (it'd already use the correct default).
update public.resources
set template_url = 'https://docs.google.com/document/d/1Pfxe7y68StDnM3ggkDYh3id5Yi_xJI7nZarNHMt7Kt4/edit?usp=sharing',
    updated_at = now()
where slug = 'market-research';
```
(SQL (1) saved as `supabase-message-meta.sql`.)

### What was built
1. **/select chat history now restores its link buttons.** Assistant messages only persisted the answer text — the SOP/module buttons were dropped, so they vanished after navigating away (the bug from the Spanish "modulos desaparecen" screenshots). Added a `meta jsonb` column carrying `{sops, modules, resources}`. Touched: `lib/ai/memory.ts` (`logMessage` meta param + `getLatestConversation` returns `meta`), `app/api/chat/route.ts` (persists meta), `app/api/chat/history/route.ts` (flattens meta → top-level arrays), `app/select/page.tsx` (restores them).
2. **AI can now link in-app Resources.** `app/api/chat/route.ts` lists the live Resources library (`getResources()`) in the system prompt + a `resources:[{slug,title}]` output field (max 3, validated against real slugs, hallucinated ones dropped). `/select` renders gold 📄 resource pills that open the resource in a **popup** (`ResourcePopup` → `ResourceInline`), no navigation needed. So "send me the offer doc" / "where's the PMF doc" works.
3. **Module → companion resource pills.** `app/modules/page.tsx`: `MODULE_RESOURCE_SLUGS` map (`'product market fit'→'market-research'`, `'offer pitch deck'→'offer-doc'`) renders a pill under the video that opens the same onboarding resource in a popup. Exported `ResourceInline` + `Resource` type from `components/ui/resources-section.tsx`.
4. **/select shows history on entry.** Auto-opens the chat overlay on load when history exists, and added a persistent **"↺ Open conversation"** pill on the launcher to reopen it after closing (previously could only reopen by refreshing).
5. **Onboarding now reads the LIVE DB resource.** Root-caused the "PMF on onboarding ≠ module/AI" mismatch: `docForStep` was reading the static `DEFAULT_RESOURCES` constant while module/AI read `/api/resources` (DB, admin-editable). `app/onboarding/page.tsx` now fetches `/api/resources/<slug>` (falls back to static while loading). All three surfaces now match per resource.
6. **/hub recordings nested nav.** Top menu is now **Program Modules · Group Calls · 1-1 Check-Ins · $100k Client Breakdowns**. "Group Calls" (`section==='group-calls'`) drills into the 3 categories (Content Mastermind / Brand Architect / Scripting Mastermind); back goes up one level (call→Group Calls→Menu). `app/hub/page.tsx`.

### Open / next
- **Run the SQL above.** Until (1) runs, `/select` history loads empty.
- The PMF/Offer module pills + AI resource links all read live `resources` rows — confirm the live `market-research`/`offer-doc` content is what you want (edit in admin → Resources if not).
- Not done (offered, awaiting your call): apply the "Group Calls" grouping to the **portal Recordings tab** (currently flat filter pills); reorder Group Calls categories (currently Mon/Wed/Fri = Content/Brand/Scripting).

---

## 🆕 2026-06-22 — Roadmap native guides + open layout (local/uncommitted)
Converted the coach's `Downloads/roadmap content` PDFs (the "Consulting Mastery" guides) into native in-app pages, rebranded **Goh Consulting**, and wired them into the roadmap:
- **9 native guide pages** in `lib/roadmap-guides.ts` (markdown), viewer at **`app/guides/[slug]/page.tsx`** (`/guides/<slug>`). Text converted faithfully from the PDFs via `pdftotext`; the 7 raster images (6 in IG Profile, 1 MOF funnel) were extracted with a one-off `pdf-lib`+`zlib`+`sharp` script and saved to **`public/roadmap-guides/<slug>/`**. The `Markdown` component (`components/ui/markdown.tsx`) was extended to render `![alt](url)` images (inline + block figure).
- **Roadmap items now carry `guides[]` and `recording` fields** (`lib/roadmap-data.ts`). Mapped: r104→visual-identity, r106→ig-profile, r110→messaging-pillars, r111→tof-content, r115→posting-cadence, r118→buyers-journey, r119→objections-into-content, r120→mof-content (MOF PDF), r123 & r125→onboarding-form. The verbose `desc` text was removed from all of those. r116 (first breakout) just had its text removed (no PDF).
- **MOF Masterclass step (r117)** gets a **▶ Watch: MOF Content** pill that opens the matching recording (category `brand_architect`, title ~/mof|middle of funnel/i) in a popup player on `/roadmap` (`RecordingModal`). Graceful fallback to a /hub link if no such recording exists yet.
- **Dropdowns removed** on `/roadmap` — every step's resources/links/description now render **always-open** inline (no expand/collapse). `ChevronDown` + the per-item `open` state are gone.

Static (no DB/SQL) — ships on deploy. tsc + `npm run build` pass. NOTE: the MOF popup depends on a Brand Architect recording titled with "MOF"/"Middle of Funnel" existing in prod.

---


## 🆕 2026-06-22 — /select content bot overhaul (local/uncommitted)
Coach feedback (Loom + Notion in `D:\AI BOT FEEDBACK`) actioned. All in `app/api/agent/route.ts` + `app/select/page.tsx`:
1. **Manual performance stats → blended score** — analyze-reel/analyze-yt now take optional **views/likes/comments/shares/saves** inputs (in the /select composer, below the visuals field; all optional). Prompts blend real results into the headline `/5` so a proven outlier can't score low (`formatStats()` + PERFORMANCE-WEIGHTED SCORING blocks). New `performance` object renders as a verdict badge + summary. (Auto-pull from URL was explicitly dropped — manual entry only.)
2. **Interactive transcript breakdown** replaces the abstract "Layer Breakdown". Model returns `highlights` (verbatim `quote` + label/why/restructure); backend echoes the clean `transcript` back; `<TranscriptBreakdown>` renders it with clickable highlighted spans (regex locate, whitespace/case-tolerant; unmatched ones fall back to cards). Applies to reel + YT. Old `layers` still renders via a back-compat shim.
3. **SooWei voice** — `SOOWEI_VOICE` constant (from the tone guide) injected into all analysis prompts; kills jargon like "credible vulnerability". 
4. **Script-review personalization** — non-admin client with no saved context now gets a chat ask for business/offer/ICP instead of being graded vs SooWei; their pasted reply is saved (`saveContext` → `setOfferUpload`) and the held script auto-re-runs against THEIR brand. Also made ICP judging smarter (BRAND_CONTEXT criterion 4 + review-script): respect SooWei's authority, don't dock broad-but-on-ICP topics like productivity/time/systems.
5. **Clipping SOP in YT reel clips** — analyze-yt `reel_clips` now use the Claude clipping prompt (3 checks: entertaining / sparks emotion / worth $5), returning timestamp range, on-screen hook (<10 words), score (3/3 ⚠️2/3), checks passed, one-line why; only 2/3+ returned. New clip card UI.

Build + `tsc --noEmit` both pass. No new env vars, no new SQL. Model still Haiku 4.5 (maxTokens bumped: yt 4200, reel 2400).

Also this session: **in-app ICP rubric editor** (⚙ ICP Rubric in Sales Calls → `IcpRubricModal` + `/api/admin/icp-criteria`); **recording cards no longer show the date** on the right (titles only). Pending: run the ICP-criteria insert SQL (pasted in chat) to load the rubric from `D:`-less `icp-criteria.md` as a new `icp_criteria` version.

---


_Last updated: 2026-06-20. Everything below is on **local `main`, uncommitted** (per
preference — nothing pushed/deployed yet) UNLESS explicitly noted as "already done in prod".
Reopen, run the dev server, and continue._

## ▶ Restart the app
```powershell
cd C:\Users\fasih\Goh-Consulting-
npm run dev        # Next 16 / Turbopack → http://localhost:3000
```
Local uses the **production Supabase** project `mqaufrypvxrmvzknmnvs` (local DB/storage actions
are LIVE prod data — test destructive things carefully). Build verified passing (`npm run build`).

---

## 🚀 DEPLOY CHECKLIST (this session)

### 1. Run this SQL in Supabase (project `mqaufrypvxrmvzknmnvs`) BEFORE deploying
```sql
-- (a) Prevent duplicate sales calls at the DB level. REQUIRED before deploy —
-- sync-fathom now upserts on this constraint; without it the sync will error.
create unique index if not exists calls_fathom_call_id_key on calls (fathom_call_id);

-- (b) Backfill real call dates on already-imported calls (they were stored with
-- a null call_date, so the table was showing the import date).
update calls set call_date = (raw_payload->>'created_at')::timestamptz
where call_date is null and nullif(raw_payload->>'created_at','') is not null;
```
Verified at handoff time: 0 duplicate `fathom_call_id`s (index will create cleanly), and all
existing calls had null `call_date` with a usable `raw_payload->>'created_at'`.

### 2. Already done DIRECTLY in prod this session (no action needed)
- **ICP rubric inserted** into `icp_criteria` (version 1) from `C:\Users\fasih\Downloads\icp-criteria.md`
  — it's the live scoring rubric now. (The analyzer code that reads it as prose is local/uncommitted,
  so until deploy the live site embeds it as escaped JSON — still readable by the model, just less clean.)
- **Maeva Durier's leftover `client_progress` row deleted** (orphaned placeholder check-in data).

### 3. No NEW env vars this session. (Prior session's `APIFY_TOKEN` + `ASSEMBLYAI_API_KEY` already added.)

### 4. Deploy
```powershell
vercel --prod      # authed as info-25454792; uploads working dir, so uncommitted work ships
```

---

## 🆕 What was built THIS session (all local/uncommitted unless noted)

### Sales Calls section — major overhaul
1. **"Sync Sales Mgr" 504 fix** — the old flow imported + AI-analyzed all ~44 calls in ONE request
   and timed out. Now split: `sync-fathom` imports fast (status `pending`, real `call_date`, no inline
   analysis), then the client drives `/api/admin/calls/analyze-pending` **one call per request**
   (`BATCH=1`, `maxDuration=300`). Frontend `sync()` (in `app/admin/page.tsx`) loops with retry-on-504
   (up to 4×) and is **resumable** — `sync-fathom` returns the ACTUAL pending count, so re-clicking
   Sync Sales Mgr resumes a partial run. No work lost on timeout.
2. **Internal-call filtering by AI** — `analyzeClosingCall` now returns `is_internal_call`; the sync,
   webhook (`processSalesCall`), and manual import all SKIP internal/team/coaching calls (marked
   `status:'internal'`, no `icp_report`, never shown, not re-imported). Sync reports "(N internal skipped)".
3. **Duplicate prevention** — DB unique index on `calls.fathom_call_id` (SQL above) + `sync-fathom`
   upserts (ignoreDuplicates) + webhook checks existing before insert. `analyze-pending` deletes any
   existing report for a call before inserting (idempotent — kills the 504-mid-analysis double-report bug
   that made "selecting one call select its duplicate too").
4. **Lead names from transcript** — `analyzeClosingCall` returns `prospect_name`; sync/webhook/import
   fill `lead_name` from it whenever Fathom gave "Unknown".
5. **Delete sales calls** — per-row 🗑 (hover) + **bulk select** (row checkboxes + select-all in header +
   bulk action bar "N selected · Delete selected"). `DELETE /api/admin/calls/[id]` and
   `POST /api/admin/calls/bulk-delete` (both remove `icp_reports` then the `calls` row).
6. **Manually add a sales call** — `＋ Add Call` button → `AddCallModal`. Fields: **Fathom URL,
   Transcript, Date, Closer, Outcome (Close/No Close), Cash Collected, Revenue**. `POST /api/admin/calls/manual`
   resolves transcript from URL (tries main key then sales-manager key) or uses pasted transcript,
   runs analysis (manual fields win), does NOT skip internal calls (admin added on purpose), dedups.
7. **Edit call** — `EditCallModal` now edits **Lead name, Closer, Call date**, outcome, revenue, cash.
   `PATCH /api/admin/calls/[id]` accepts `lead_name`, `closer`, `call_date`.
8. **Removed the "Close %" column** from the table (kept the ICP ScoreBadge + the top stat cards).
9. **Call date fix** — sync now stores the real Fathom call date (`meeting.created_at`) instead of the
   import time; editable per-call; backfill SQL above for existing rows.
10. **ICP criteria** — was EMPTY (scores were unanchored). Now uses the rubric from `icp-criteria.md`
    (5 weighted factors /100). `analyzeClosingCall` embeds `criteria.rubric` verbatim + scores strictly to
    it; ICP reasoning now gives the per-factor breakdown. Read fresh from DB each call (edit row to tweak).
11. **Sales AI moved INTO Sales Calls** — the standalone "Sales AI" tab is gone; now a **✨ Sales AI**
    button inside the Sales Calls section (like CSM's "Ask AI"), with a back link.
12. **Tab order** is now: **Members · Client Success · Sales Calls · Referrals · AI Advisor · Roadmap**.

### 1-1 Check-Ins (client-facing)
13. **New "1-1 Check-Ins" category in `/hub`** — each client sees ONLY their own processed check-ins,
    using the same RecordingsPlayer layout. `lib/recordings.ts` `CHECKIN_CATEGORY` + `fathomShareToEmbed()`
    (Fathom `/share/<token>` → embeddable `/embed/<token>` iframe; `/share` blocks framing, `/embed` allows it).
    `GET /api/me/checkins` returns the session user's `processed` check-ins as `Recording[]`. Read-only
    (managed in CSM). **Summary section hidden** for this category (`hideSummary` prop on RecordingsPlayer).
    Admins still view check-ins via CSM cards. NOTE: category only appears once a client HAS matched
    check-ins — at handoff all prod check-ins were `unmatched_client` (assign/add them in CSM to populate).
14. **Delete check-ins from CSM** — per-row 🗑 in the client's "Check-in calls" list + **Delete** in the
    ⚑ Unmatched queue. `DELETE /api/admin/checkins/[id]` cascades: removes the check-in, its AI action
    items (`action_items.check_in_id`), its timeline event (`client_events`), AND recomputes the client's
    `client_progress` (wipes it if no check-ins remain, else rebuilds wins/action items from the rest) so
    nothing lingers on the client side. `lib/checkins.ts` `deleteCheckIn` + `recomputeProgressAfterCheckInDeletion`,
    `lib/action-items.ts` `deleteActionItemsForCheckIn`, `lib/journey.ts` `deleteEventsByRef`.

### Other
15. **/select chat history persists per user** — data was always being saved
    (`content_conversations`/`content_messages`, keyed by email) but the frontend never loaded it back.
    Added `getLatestConversation()` (`lib/ai/memory.ts`) + `GET /api/chat/history` + `/select` now loads
    the user's own latest thread on mount and resumes it (`chatConvId`). Scoped to session email (private).
16. **No Discord @-tagging on roadmap completion** — `sendRoadmapPhaseComplete` no longer prepends
    `DISCORD_TEAM_MENTION` and sets `allowed_mentions: { parse: [] }`. The message still posts, pings no one.
    (The 1-1 channel congrats only used a bold name, never a tag — left as-is.)

---

## 📍 Open / next
- **Run the SQL above, then `vercel --prod`.** (The unique index is REQUIRED before deploy.)
- After deploy: the 34-ish `pending` sales calls finish analyzing on the next Sync Sales Mgr
  (one at a time, internal skipped, real names + dates, no dupes), scored against the ICP rubric.
- To populate clients' **1-1 Check-Ins**: assign the `unmatched_client` check-ins to clients in the
  CSM ⚑ Unmatched queue (or add manually) — they become `processed` and show in that client's `/hub`.
- ✅ DONE: **in-app ICP rubric editor** — "⚙ ICP Rubric" button in the Sales Calls toolbar opens
  `IcpRubricModal`; loads the live (highest-version) `criteria.rubric` prose and saves a NEW version
  via `GET`/`PUT /api/admin/icp-criteria` (admin-only). New calls score against the latest version;
  existing reports keep their scores. No new SQL — uses the existing `icp_criteria` table.
- Optional / not done: persist SOP/module chips for restored /select history; "Add Call" has no source
  picker (manual adds land in Main Pipeline, not Sales Manager).
- (Still open from before) **Kim isn't an admin** — create `kim@gohconsulting.com` (role admin) or her
  check-ins won't attribute by email.

## Notes
- Habit: **paste runnable SQL directly in chat** (done above).
- Prefers local uncommitted work — "save progress" = leave on disk, don't commit/push unless asked.
- `next build` runs `sync-training` first, so `training-data/*.txt` ships automatically.
- ICP rubric source file: `C:\Users\fasih\Downloads\icp-criteria.md` (edit it + re-seed the
  `icp_criteria` row to change scoring; or build the in-app editor).

## Prior session (still relevant — confirm done in prod)
Migrations from the previous session that should already be run: `supabase-resources.sql`,
`supabase-contracts.sql`, the `calendar-calls` onboarding/roadmap backfill. Env: `APIFY_TOKEN`,
`ASSEMBLYAI_API_KEY` (user confirmed added). Earlier-run migrations: journey, onboarding, ai-memory,
content-brain, client-content-context, onboarding-forms, roadmap-* , module-progress, client-summaries,
modules, salesbot-ai, referrals, features, portal-settings, guides, action-items, roadmap.
