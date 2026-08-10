# IG DM → Claude → CRM Pipeline — Build Plan

> Status: **PLAN ONLY — no code written yet.** Approved decisions:
> capture via Meta IG webhook (`messages` + `message_echoes`), classify **inline per inbound message**,
> **auto-shift** `crm_leads.stage` with manual override always available (the CRM stage dropdown).

---

## 1. What this does

Captures every Instagram DM (both directions, including human-agent replies) for the connected
professional accounts, stores full transcripts in Supabase, and has Claude classify each lead's
pipeline stage in real time — writing the result straight into the CRM built in `app/admin/page.tsx`
(the `crm` tab). Weekly, a cron runs cross-lead pattern analysis (objections, drop-off, velocity).

```
Instagram DM (lead ↔ SooWei/George/bot)
        │  Meta sends webhook: messages + message_echoes
        ▼
/api/webhooks/instagram   (public, HMAC-verified — mirrors app/api/fathom/webhook)
        │  1. verify X-Hub-Signature-256
        │  2. parse entry[].messaging[]  (dedupe on message.mid)
        │  3. resolve/create crm_lead by IGSID  (fetch username via Graph API on first contact)
        │  4. insert into crm_messages
        │  5. if INBOUND (is_echo != true): load thread → Claude classify → auto-shift stage + log
        ▼
Supabase: crm_leads (+ igsid), crm_messages (new), crm_stage_log (new)
        │
        ▼
CRM tab (app/admin/page.tsx)  — thread view in drawer, auto/manual stage badge
        +
/api/cron/crm-patterns  (weekly, vercel.json) — cross-lead analysis
```

**Hard limits (unchanged, Meta-side):**
- No history before go-live, except ~20 recent msgs/thread via a one-time backfill (Conversations endpoint).
- Only DMs involving *your* connected accounts.
- `message_echoes` is what captures human/IG-app replies — the bot-only ManyChat path can't see those.

---

## 2. Prerequisites — YOU must do these (outside the code)

> **Correction (verified against this repo):** there is NO existing Instagram Graph API integration to
> reuse. The "analytics pipeline" talks to Close/Calendly/Whop/PostHog/Kit; reel analysis uses Apify +
> AssemblyAI; the only Meta presence is the ad Pixel. So the Meta app + IG messaging connection is
> **greenfield** — a fresh Meta app connected to the IG professional account(s), not a second capture path.
>
> **API flavor:** confirmed target is **Instagram API with Instagram Login** (business logs in directly
> with Instagram; no Facebook Page). Webhook subscribes to `messages` on the Instagram object; outbound
> echoes (human/IG-app replies) flow through the same subscription. Access token = an Instagram user access
> token (not a Page token).
>
> **Access tier:** `instagram_business_manage_messages` must be at **Advanced Access** to handle DMs from
> real leads — **Standard Access only covers app-role users (you/testers).** Verify in App Review →
> Permissions and Features before relying on it in production.

The build is blocked on Meta setup. Nothing works until these are done:

1. **Confirm which Instagram API the existing app uses** — "Instagram API with Instagram Login" (newer,
   IG-native) vs "Messenger Platform for Instagram" (via a linked Facebook Page). The webhook payload
   shape and permission names differ slightly. Check the existing Graph API app from the analytics pipeline.
2. **Permissions + App Review** for messaging (submit BOTH together — `manage_messages` depends on `basic`):
   - `instagram_business_basic` — **required companion**; Meta rejects the messaging permission without it.
     Read-only profile/media. Also what authorizes our username lookup (`GET /{igsid}?fields=username,name`).
   - `instagram_business_manage_messages` — send/receive DMs.
   - Request **Advanced Access** on both (Standard = app-role users only). Requires **App Review** with a
     screencast showing both permissions in use. This is the long pole — start it early.
3. **Subscribe the webhook fields** `messages` and `message_echoes` on each IG account, pointed at
   `https://<domain>/api/webhooks/instagram`.
4. **Webhook verify token** — pick a random string, set as `META_WEBHOOK_VERIFY_TOKEN` (used only for the
   one-time GET handshake).
5. **App Secret** — from the Meta app dashboard, set as `META_APP_SECRET` (used to verify every payload).
6. **Long-lived access token(s)** per connected IG account, set as `META_IG_ACCESS_TOKEN` (or one per
   account) — used for the username lookup + backfill.
7. **ManyChat handover check (only if ManyChat is connected to this IG account)** — CRM is the only sink,
   so we're not writing back to ManyChat. But if ManyChat is still connected as the account's automation,
   confirm it isn't set as the "primary receiver" swallowing webhook events. If ManyChat isn't connected
   to this account at all, skip this entirely.

---

## 3. Database schema (Supabase — run in SQL Editor)

Extends the existing `crm_leads` and adds two tables. Idempotent.

```sql
-- Link DMs to CRM cards
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS igsid TEXT UNIQUE;   -- Instagram-scoped user ID
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ig_account TEXT;      -- which connected account (soowei / goh)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS stage_source TEXT DEFAULT 'manual'; -- 'ai' | 'manual'
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS stage_locked_until TIMESTAMPTZ;     -- pause auto-shift after a manual change
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS crm_leads_igsid_idx ON crm_leads(igsid);

-- Raw DM transcript (separate from crm_touchpoints, which is the manual rep-entry log)
CREATE TABLE IF NOT EXISTS crm_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  igsid        TEXT NOT NULL,
  mid          TEXT UNIQUE,                       -- Meta message id — dedupe key (idempotency)
  direction    TEXT NOT NULL,                     -- 'in' (lead) | 'out' (us)
  sent_by      TEXT,                              -- 'lead' | 'bot' | 'human'
  text         TEXT,
  attachments  JSONB,                             -- images/reels/etc. if present
  sent_at      TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_messages_lead_idx ON crm_messages(lead_id, sent_at);

-- Stage transition audit trail (the funnel-analytics sleeper feature)
CREATE TABLE IF NOT EXISTS crm_stage_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  source      TEXT NOT NULL,                      -- 'ai' | 'manual'
  confidence  REAL,                               -- AI only
  reason      TEXT,                               -- AI one-liner
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_stage_log_lead_idx ON crm_stage_log(lead_id, changed_at);
```

`crm_messages` is deliberately separate from `crm_touchpoints` (the manual "sales rep logged a call"
entries). Raw DMs are high-volume and machine-written; keeping them apart avoids polluting the manual log.

---

## 4. Environment variables (add to `.env.local` + Vercel)

```
META_APP_SECRET=...              # verify X-Hub-Signature-256 on every payload
META_WEBHOOK_VERIFY_TOKEN=...    # one-time GET handshake
META_IG_ACCESS_TOKEN=...         # username lookup + backfill (or one per account)
# CRON_SECRET already exists (reused for the weekly pattern cron)
# ANTHROPIC_API_KEY already exists
```

Also add `/api/webhooks/instagram` is already covered by the `proxy.ts` allowlist (`/api/webhooks/`),
so no middleware change is needed — it's already public + signature-secured by design.

---

## 5. Files to build

| File | Purpose |
|---|---|
| `app/api/webhooks/instagram/route.ts` | `GET` = verify handshake; `POST` = receive + verify + process. Mirrors `app/api/fathom/webhook/route.ts` (signature verify, `export const dynamic='force-dynamic'`, `maxDuration`). |
| `lib/ig-messages.ts` | Supabase reads/writes: dedupe by `mid`, insert message, resolve/create lead by IGSID, fetch username via Graph API, update `last_message_at`. |
| `lib/crm-classify.ts` | Claude classifier: load thread → structured JSON `{stage, confidence, intent_signals[], objections[], next_action, summary}`. |
| `lib/crm-stage.ts` | Apply stage: compare to current, respect `stage_locked_until`, update `crm_leads.stage`+`stage_source='ai'`, insert `crm_stage_log`, update `ai_summary`/`ai_next_move`. |
| `app/api/cron/crm-patterns/route.ts` | Weekly cross-lead analysis (CRON_SECRET bearer, like `app/api/cron/sync-fathom`). |
| `scripts/backfill-ig-convos.mjs` | One-time: Conversations endpoint → last ~20 msgs/thread → seed `crm_messages`. |
| CRM UI edits in `app/admin/page.tsx` | Thread view in the lead drawer; auto/manual stage badge; make the existing manual stage dropdown set `stage_source='manual'` + `stage_locked_until = now()+24h`. |
| `vercel.json` | Add the weekly `crm-patterns` cron. |

---

## 6. Classification design

**Model — recommendation:** `claude-haiku-4-5` for the per-message classifier.
- Rationale: high-frequency + cheap ($1 in / $5 out per MTok), fast, and it **supports Structured Outputs**
  (`output_config.format` with a JSON schema) so stage classification returns guaranteed-valid JSON.
  Note: the codebase currently standardizes on `claude-sonnet-4-6`, which does **not** support structured
  outputs — so Haiku 4.5 is both cheaper *and* more reliable here.
- If accuracy on nuanced threads proves insufficient, bump to `claude-sonnet-5` (also supports structured
  outputs) or `claude-opus-4-8`. This is your call on the cost↔accuracy trade — flagged as an open decision.

**Weekly pattern analysis:** `claude-sonnet-5` or `claude-opus-4-8` (reasoning-heavy, runs ~once/week, cost negligible).

**Prompt caching:** the classifier system prompt (stage definitions + ICP criteria + few-shot examples) is
identical on every call — put it in a cached `system` block (`cache_control: ephemeral`). Per-lead thread
goes in the user turn (uncached). ~90% input-cost reduction after the first call. Min cacheable prefix for
Haiku 4.5 is 4096 tokens, so pad the shared prefix if needed.

**Stages** — reuse the exact `crm_leads.stage` vocabulary already in the app:
`new → contacted → nurturing → application_sent → call_booked → call_held → closed_won / closed_lost / ghosted`.

**Output schema (structured output):**
```json
{
  "stage": "new|contacted|nurturing|application_sent|call_booked|call_held|closed_won|closed_lost|ghosted",
  "confidence": 0.0,
  "intent_signals": ["..."],
  "objections": ["..."],
  "next_action": "single highest-leverage next move",
  "summary": "2-3 sentence where-they're-at"
}
```

**Auto-shift rule:** apply the new stage only if it differs, `confidence >= 0.7`, and
`stage_locked_until` is null or in the past. Always write `ai_summary`/`ai_next_move` regardless. Log every
change (AI or manual) to `crm_stage_log`.

---

## 7. Lead ↔ IGSID linking

- Webhook gives `sender.id` (IGSID) — but **not** the username. On first contact, call
  `GET /{igsid}?fields=username,name` (allowed once a user has messaged you) and create the `crm_lead`.
- Match an existing manually-entered lead by `ig_handle` if the fetched username matches; else create new.
- `manychat_subscriber_id` can be linked later if you also run ManyChat `setCustomField`.

---

## 8. Manual override behavior (per your decision)

- AI auto-shifts the stage. The existing stage dropdown in the lead drawer still lets you move it to **any**
  stage manually.
- A manual change sets `stage_source='manual'` and `stage_locked_until = now() + 24h`, so the AI won't
  immediately re-flip it on the next message. After 24h (or the next `closed_*` signal), AI resumes.
- The drawer shows a small badge: **AI** (auto) vs **Manual** (locked), so you always know what set it.
- *(Open decision: the 24h lock window — could be "until next inbound", "forever until cleared", or a
  different duration. Easy to change.)*

---

## 9. Guardrails

- **Signature verify** every POST (`X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(`META_APP_SECRET`, rawBody)).
  Reuse the pattern from `lib/fathom-verify.ts`.
- **Idempotency** — dedupe on `crm_messages.mid` (unique). Meta retries deliveries; the unique index makes
  reprocessing a no-op.
- **Echo handling** — store outbound echoes (`is_echo:true`) as `direction='out'` but **do NOT** trigger
  classification on them (only inbound lead messages classify). Prevents self-triggered loops.
- **Fast ACK** — return `200` within Meta's timeout; do the Claude call inline but keep `maxDuration`
  generous (Fathom webhook uses 60s). If classification ever gets slow, move it to a fire-and-forget path.
- **Fail-closed auth** on the cron (CRON_SECRET bearer), same as `sync-fathom`.

---

## 10. Rough cost

Per inbound message: ~1-3k input tokens (thread) + ~200 output, mostly cache-read after warmup.
On Haiku 4.5 that's a fraction of a cent per classification — negligible at DM volume. Weekly pattern
run is a few cents. The dominant cost is your time on Meta App Review, not tokens.

---

## 11. Milestones

1. **DB + env** — run the SQL, set env vars. (Unblocks everything.)
2. **Webhook receive + store** — `GET` handshake, `POST` verify + parse + dedupe + store. Verify with the
   Meta webhook test tool + a real DM. (No AI yet — just prove capture works end to end.)
3. **Lead linking** — username fetch + create/match `crm_lead`.
4. **Inline classify + auto-shift** — `crm-classify.ts` + `crm-stage.ts`, wired into the webhook.
5. **CRM UI** — thread view + auto/manual badge + manual-lock on the dropdown.
6. **Backfill** — one-time script for the last ~20 msgs/thread.
7. **Weekly patterns** — cron + a Patterns view/tab.

Milestones 1-2 are the proof-of-life; everything after is additive.

---

## 12. Open decisions (before/during build)

- ~~IG API flavor~~ — RESOLVED: Instagram API with Instagram Login (§2).
- ~~ManyChat write-back~~ — RESOLVED: CRM is the only sink.
- Classifier model: start Haiku 4.5 vs Sonnet 5 (§6).
- Manual-lock window: 24h vs until-next-inbound vs manual-clear (§8).
- One access token for all accounts vs per-account (if connecting both SooWei + Goh IG accounts).
- Confirm `instagram_business_manage_messages` is at **Advanced Access**, not Standard (§2).
