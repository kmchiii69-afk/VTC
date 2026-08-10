# Work-in-progress status — Goh portal

If your machine restarts, the code is safe on disk (and now committed to local `main`).
Use the restart steps below to start hosting again. Nothing here is **pushed to GitHub /
deployed to Vercel yet** — see "Where things stand" below.

---

## ✦ Latest session (2026-06-11 / 06-12) — navigation + embed recordings

Committed to local `main` (not pushed). To revisit: `npm run dev`, open
http://localhost:3000, log in as admin.

**1. Login now lands on `/select`** (was `/portal`) — both the post-login and
already-signed-in redirects. Files: `app/page.tsx`.

**2. Select screen** — `SOP Library` and `Roadmap` are phased out (faded, not clickable);
`Modules` was renamed to **`Recordings`** (links to `/hub`). Files: `app/select/page.tsx`.

**3. Hub / Select / Portal always accessible** — removed their per-client feature gating
from the proxy, and removed Hub/Select from the admin "Portal Access" toggle (only the
real portal tabs are gateable now). Portal sidebar always shows Hub + Select links.
Files: `proxy.ts`, `lib/features.ts`, `app/portal/page.tsx`.

**4. Portal Recordings view** — removed the top black bar + "Call Recordings / Mastermind
call library" title (kept a mobile-only menu button). Files: `app/portal/page.tsx`.

**5. Recordings are now EMBED-CODE based and shared by the portal AND the hub** — one
source of truth at `/api/recordings`. Admin pastes an embed snippet (Fathom `<iframe>`,
Vidalytics `<div>+<script>`, etc.) → it plays **inline** in both the portal Recordings
view and on `/hub` (top-level = the 3 categories: Content Mastermind / Brand Architect /
Scripting Mastermind). Hub's old hardcoded call arrays were removed.
  - New shared model: `lib/recordings.ts`. New player: `components/ui/recording-embed.tsx`
    (re-creates `<script>` tags so script-based players actually run — innerHTML scripts
    don't execute; this was the Vidalytics "black screen" fix). CSS in `app/globals.css`.
  - API: `app/api/recordings/route.ts` accepts `embed_code` (or legacy `fathom_url`).
  - ✅ **DB migration already run** in Supabase `mqaufrypvxrmvzknmnvs`
    (`embed_code` column added, `fathom_url` made nullable). Verified add→display→delete
    works end-to-end and embeds (Fathom + Vidalytics) play inline.

### Where things stand
- All of the above + the earlier 2026-06-05 work is committed to **local `main`**.
- **Not yet pushed** to GitHub / deployed to Vercel. To go live: `git push origin main`
  (Vercel auto-deploys) — see the go-live checklist at the bottom.

---

## ▶ Restart local hosting (after a reboot)

```powershell
cd C:\Users\fasih\Goh-Consulting-
npm run dev
```
Then open **http://localhost:3000**. (Next.js 16, Turbopack.) Log in with your admin
account. Local uses the **production** Supabase project `mqaufrypvxrmvzknmnvs`.

---

## ⚠ Pending database setup (run once, for full functionality)

In Supabase SQL editor (project `mqaufrypvxrmvzknmnvs`), run these files' contents —
**`supabase-roadmap.sql`**, **`supabase-referrals.sql`**, **`supabase-recordings.sql`**,
**`supabase-features.sql`**, **`supabase-guides.sql`**, **`supabase-portal-settings.sql`**
(new — global feature defaults / bulk apply) — or this combined block, then the RLS block:

```sql
create table if not exists public.roadmap_progress (
  user_email text not null, item_id text not null,
  completed_at timestamptz not null default now(), primary key (user_email, item_id));
create index if not exists roadmap_progress_user_idx on public.roadmap_progress (user_email);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_name text not null, referred_name text not null,
  referral_date date, cash_collected numeric default 0, commission numeric default 0,
  created_at timestamptz not null default now());
create index if not exists referrals_date_idx on public.referrals (referral_date);

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(), category text not null, title text,
  embed_code text, fathom_url text, call_date date, created_at timestamptz not null default now());
alter table public.call_recordings add column if not exists embed_code text;
alter table public.call_recordings add column if not exists summary_url text;
alter table public.call_recordings alter column fathom_url drop not null;
create index if not exists call_recordings_cat_idx  on public.call_recordings (category);
create index if not exists call_recordings_date_idx on public.call_recordings (call_date);

alter table public.portal_users add column if not exists features text[];

create table if not exists public.section_guides (
  section text primary key, loom_url text, title text,
  updated_at timestamptz not null default now());

create table if not exists public.portal_settings (
  key text primary key, value jsonb, updated_at timestamptz not null default now());

do $$ declare t text; begin
  foreach t in array array['roadmap_progress','referrals','call_recordings','action_items',
    'section_guides','portal_settings','check_ins','client_progress','portal_users','calls','icp_reports','icp_criteria'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t)
    then execute format('alter table public.%I enable row level security;', t); end if;
  end loop; end $$;
```
Already created earlier: `check_ins`, `client_progress`, `action_items`, `calls`,
`icp_reports`, `icp_criteria` (plus existing `portal_users`).

---

## What was built this session (all on local `main`, uncommitted)

1. **Sales-manager Fathom (2nd account)** — env-keyed sync (`FATHOM_SALES_API_KEY`) +
   webhook `/api/webhooks/fathom-sales` (`FATHOM_SALES_WEBHOOK_SECRET`), source tag/filter
   in the Sales Calls tab, AI revenue/cash extraction, ✎ manual override. Fixed
   `/api/reports` to actually return revenue/cash/outcome/source.
   Files: `lib/fathom.ts`, `lib/sales-call.ts`, `lib/ai/analyze.ts`,
   `app/api/admin/sync-fathom/route.ts`, `app/api/webhooks/fathom-sales/route.ts`,
   `app/api/admin/calls/[id]/route.ts`, `app/api/reports/route.ts`, `app/admin/page.tsx`.

2. **Action items** — admins assign tasks (member drawer), clients tick them off; portal
   topbar bell + dashboard card with overdue alerts; AI check-in steps auto-become items.
   Files: `lib/action-items.ts`, `lib/use-action-items.ts`,
   `app/api/me/action-items/*`, `app/api/admin/clients/[email]/action-items/route.ts`,
   `app/api/admin/action-items/[id]/route.ts`, `supabase-action-items.sql`.

3. **Roadmap checkboxes + strict sequential locking** — synced across dashboard + /roadmap.
   Files: `lib/roadmap-data.ts`, `lib/use-roadmap.ts`, `app/api/progress/roadmap/route.ts`,
   `app/roadmap/page.tsx`, `app/portal/page.tsx`, `supabase-roadmap.sql`.

4. **Referrals tracker** — Admin Panel → Referrals tab: manual entries, scorecards
   (count / cash / commission), date-range filter. Files: `app/api/admin/referrals/*`,
   `app/admin/page.tsx`, `supabase-referrals.sql`.

5. **Call recordings** — portal Recordings view: admins add Fathom links in 3 categories,
   clients view filtered + date-sorted. Files: `app/api/recordings/*`, `app/portal/page.tsx`,
   `supabase-recordings.sql`.

7. **Per-client portal feature gating** — every portal tab (Dashboard/Roadmap/Modules/
   SOPs/Recordings) is independently unlockable per client via a "Portal Access" toggle
   panel in the admin member drawer. Clients see **Recordings only** by default (null/empty
   `features` => default allowlist); admins always see everything. Portal lands on the
   client's first allowed tab and never flashes a gated view.
   Files: `lib/features.ts`, `lib/kv.ts` (User.features), `app/api/me/features/route.ts`,
   `app/portal/page.tsx`, `app/admin/page.tsx`, `supabase-features.sql`.

6. **UI polish** — profile panel nav (Portal/Hub/Select/Admin), bell/profile alignment,
   Roadmap + Recordings sidebar views, brighter sub-text app-wide, dark veil behind the
   gold mesh background.

---

## Go-live checklist (when finalized)

1. Run the 3 pending SQL files (above) in prod Supabase.
2. Commit + push `main` → Vercel auto-deploys.
3. Set Vercel env vars: `FATHOM_SALES_API_KEY`, `FATHOM_SALES_WEBHOOK_SECRET`
   (`FATHOM_API_KEY` already updated).
4. Point Fathom webhooks at prod:
   - Team → `https://brand-architect-portal-two.vercel.app/api/fathom/webhook`
   - Sales mgr → `https://brand-architect-portal-two.vercel.app/api/webhooks/fathom-sales`

See `FATHOM-SETUP.md` for webhook details.
