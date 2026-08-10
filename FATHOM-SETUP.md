# Fathom Check-in Integration — Setup

This connects your team's Fathom recordings to the portal. Every recorded check-in is
auto-routed to the right **coach** (an admin user) and **client** (a member user), counted,
and turned into an auto-updating progress profile on the client.

## 1. Create the database tables

In the Supabase project (same one that holds `portal_users`), open the **SQL editor** and run
the contents of [`supabase-checkins.sql`](./supabase-checkins.sql). It creates two tables:

- `check_ins` — one row per recorded call (per client).
- `client_progress` — one rolling, AI-maintained profile per client.

## 2. Add environment variables

Add these wherever the app runs (Netlify/Vercel dashboard **and** your local `.env.local`):

| Variable | Purpose |
| --- | --- |
| `FATHOM_WEBHOOK_SECRET` | Fathom's signing secret (looks like `whsec_…`). Fathom **generates and shows this when you create the webhook** — copy it here. Used to verify each request's HMAC signature. |
| `FATHOM_API_KEY` | Fathom API key (required to create the webhook in Fathom; also used for the optional history backfill). |
| `FATHOM_WEBHOOK_TEST_SECRET` | **Local/dev only — never set in production.** If set, the endpoint accepts a request whose `?secret=` (or `x-webhook-secret`) matches this value, bypassing signature checks. Lets you POST sample payloads without forging a Fathom signature. |

Already present and reused: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

## 3. Register the webhook in Fathom

Fathom signs every webhook with the **Svix** scheme (HMAC-SHA256 over the raw body, sent in
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers). You do **not** put a secret
in the URL — Fathom mints its own.

1. In Fathom, **generate an API key first** (Developer/API settings). The webhook screen is
   gated behind having a key.
2. Go to **Manage → Add Webhook** and set the **Destination URL** (no query string):
   ```
   https://<your-site-domain>/api/fathom/webhook
   ```
3. Enable these payload options: `include_transcript`, `include_summary`,
   `include_action_items`, `include_crm_matches` (all `true`).
4. Fathom shows a **signing secret** (`whsec_…`). Copy it into `FATHOM_WEBHOOK_SECRET`
   (Vercel env **and** local `.env.local`), then redeploy / restart so the value loads.

Set the webhook to fire on **your team's meetings** (not just your own) so every coach's
check-ins are captured.

> Requests with a missing/invalid signature, or a timestamp more than 5 minutes old, get `401`.

## 4. Naming convention (important)

Title check-in calls **`Check-in <Coach Name>`** (e.g. `Check-in SooWei`). The coach name in
the title is used as a fallback when the coach's calendar email doesn't match their portal
email.

## 5. Email matching (important)

Calls are auto-routed by **email**:

- **Coach** = the call participant whose email matches an **admin** portal user.
- **Client** = the call participant whose email matches a **member** (`user`) portal user.

So each client's **portal email must equal the email they're invited with on the calendar**.
If a call can't be matched to a client, it is **not lost** — it lands in the **Unmatched**
queue in the Admin Panel (the `⚑ Unmatched` button), where you assign it to the right client in
one click. Assigning runs the full analysis automatically.

## How it works once live

1. A check-in finishes → Fathom POSTs the transcript + summary to `/api/fathom/webhook`.
2. The call is matched to coach + client and stored (`check_ins`).
3. Claude (`claude-sonnet-4-6`) extracts the call summary, action steps, questions answered,
   wins, blockers, sentiment, red flags, and roadmap movement, then updates the client's rolling
   `client_progress`.
4. **Admins** see everything on the client's profile in the Admin Panel: total check-ins,
   per-coach breakdown, progress narrative, next steps, wins, **red flags / admin notes**, and
   each call's detail.
5. **Clients** see only their own counts + positive progress (narrative, next steps, wins,
   check-in history) on their portal dashboard — red flags and admin notes are never sent to
   the client (`/api/me/progress` strips them server-side).

## Verifying locally

Set `FATHOM_WEBHOOK_TEST_SECRET=<any-string>` in `.env.local` and restart the dev server.
This enables the dev-only `?secret=` bypass so you can POST a sample payload without forging a
Fathom signature (PowerShell):

```powershell
$body = @{
  recording = @{ id = "test-123"; url = "https://fathom.video/calls/test-123"; created_at = "2026-06-01T15:00:00Z"; duration_in_minutes = 30 }
  meeting   = @{ title = "Check-in SooWei" }
  calendar_invitees = @(
    @{ name = "SooWei Goh"; email = "<an-admin-email>" },
    @{ name = "Test Client"; email = "<a-member-email>" }
  )
  transcript = "SooWei: How's the content going?`nClient: Posted 5 reels this week, one hit 10k views."
  summary = "Reviewed content cadence; client posting consistently."
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/fathom/webhook?secret=$env:FATHOM_WEBHOOK_TEST_SECRET" `
  -ContentType "application/json" -Body $body
```

> To test the **real** signed path instead, leave `FATHOM_WEBHOOK_TEST_SECRET` unset and send
> `webhook-id` / `webhook-timestamp` / `webhook-signature` headers computed per the Svix scheme
> (see `lib/fathom-verify.ts`).

Then open the client in the Admin Panel (counts + progress + red flags) and log in as that
client to confirm the portal dashboard shows progress **without** any admin notes.

---

## Sales Manager's Fathom (separate account)

The **Sales Calls** tab (Admin Panel → Sales Calls) tracks closing calls: total calls,
closed, close rate, revenue, and cash collected, plus per-call notes and an AI Advisor. The
sales manager records on his **own** Fathom account, so it's wired as a **second source**
alongside the main team Fathom.

### Env vars

| Variable | Purpose |
| --- | --- |
| `FATHOM_SALES_API_KEY` | The sales manager's Fathom API key. Powers the **↓ Sync Sales Mgr** button (pulls his recent closing calls on demand). |
| `FATHOM_SALES_WEBHOOK_SECRET` | The signing secret Fathom shows when you create his webhook. Verifies the HMAC signature on every push to the sales-manager endpoint. |
| `ANTHROPIC_API_KEY_2` | Already used by the sales analysis (`lib/ai/analyze.ts`). Reused here. |

### Register his webhook in Fathom (his account)

Add a webhook in **his** Fathom workspace pointing at:

```
https://<your-site-domain>/api/webhooks/fathom-sales
```

Enable transcript + summary. Copy the signing secret into `FATHOM_SALES_WEBHOOK_SECRET`.
Every call he records then auto-analyzes and lands in the Sales Calls tab, tagged
**Sales Mgr** and filterable via the **Sales Manager** chip. Or pull on demand with
**↓ Sync Sales Mgr** (analyzes immediately).

### Internal calls are filtered out

Internal/team calls are never ingested into the Sales Calls pipeline — both the
webhook and the **↓ Sync Sales Mgr** button skip any meeting whose title matches
an internal-call phrase. Current list (case-insensitive substring): _sales huddle,
huddle, executives call, team call, group call, mastermind, content x, ugc, cm team,
coaching call, onboarding, training_ — so e.g. `Sales Huddle`, `GC Executives Call`,
`GC team call`, `team call`, `group call` are all excluded. To add/remove phrases,
edit `INTERNAL_CALL_TITLE_RE` in `lib/sales-call.ts` (single source of truth).

### Money fields (revenue / cash collected)

The AI extracts a revenue/cash figure **only when it's explicitly stated on the call**;
otherwise they stay blank. Correct or fill any call by hovering its row in the Sales Calls
table and clicking the **✎** in the Rev column — set outcome, revenue, and cash collected
manually (`PATCH /api/admin/calls/[id]`).
