# Aloware setup

Aloware is the phone system the team dials and texts on. Two separate things ship
here, and they don't depend on each other:

1. **The MCP server** — lets Claude drive your Aloware workspace by hand.
2. **The app integration** — keeps the CRM, Close and Aloware telling the same story
   automatically, with no one in the loop.

---

## 1. MCP server (Claude only)

Already configured in `.mcp.json`:

```json
{ "mcpServers": { "aloware": { "type": "http", "url": "https://app.aloware.io/mcp" } } }
```

Aloware's MCP server uses OAuth 2.1 with dynamic client registration, so there is no
client id or secret to paste. To connect:

```
/mcp
```

Pick **aloware**, authenticate in the browser, done. Claude then has: send SMS, make
outbound calls, look up contacts, view communication history.

This runs only in your Claude session. It is **not** part of the deployed app and
nothing in production calls it.

---

## 2. App integration

### Environment variables

| Variable | Required | What it's for |
| --- | --- | --- |
| `ALOWARE_API_TOKEN` | yes | Aloware → Integrations → API. Unset = the whole integration no-ops, nothing breaks. |
| `ALOWARE_WEBHOOK_SECRET` | yes | The Bearer token you type into Aloware's webhook screen. **Unset = the receiver 403s everything** — it fails closed because `/api/webhooks/` is exempt from the app's auth proxy. |
| `ALOWARE_LINE_ID` | for SMS | The line outbound SMS goes out on. |
| `ALOWARE_FROM_NUMBER` | for SMS | Alternative to `ALOWARE_LINE_ID` — pin a specific owned number. |
| `ALOWARE_SYNC_CONTACTS` | no | Set to `0` to stop pushing CRM leads into Aloware. Inbound call/SMS logging keeps working: it falls back to matching on the phone number. |
| `CLOSE_IMPORT` | no | Close → CRM import. Unset = **dry run** (reports what it would do, writes nothing). `1` imports for real. `off` skips the scan entirely. |

## Close → CRM import

Close held ~740 contacts that were never in the CRM — created directly in Close by
the team. They were undialable in any useful sense: the Aloware webhook attaches a
call to a *CRM lead*, so calling a Close-only contact produced no timeline entry, no
dial count, and nothing mirrored back, which means Close's own call counter never
moved for them either.

`lib/close-import.ts` reverses the mirror for exactly those people. It runs inside
the same 10-minute cron and is deliberately narrow — see the file header for why
each rule exists. In short: phone required, never a lead already linked, never one
bearing our own sync markers, and one CRM row per phone number.

Read the `imported` block in the cron's JSON response to see what it would do:

```
GET /api/cron/close-sync   (Authorization: Bearer $CRON_SECRET)
→ "imported": { "dryRun": true, "created": 100, "pending": 618, ... }
```

Set `CLOSE_IMPORT=1` and redeploy to let it write. It creates 100 rows per run, so a
~700-lead backfill drains over roughly eight runs. Set `CLOSE_IMPORT=off` afterwards
if you'd rather not spend the Close reads scanning for new arrivals.

**Imported leads land with `next_followup_at` null on purpose.** Due Today filters on
that stored column, so the import doesn't dump several hundred leads into the
setters' queue. They appear on the board and in Aloware, and join the cadence when
someone touches one.

### Migration

Run `supabase/aloware_integration.sql` in the Supabase SQL editor. It is idempotent.

Until it's run, every function degrades to a clear error instead of throwing — the
CRM and the phones keep working, only the mirror waits.

It adds:

- `crm_leads.aloware_contact_id`, `crm_leads.aloware_synced_at`
- `crm_touchpoints.external_id` + a partial UNIQUE index — **this is the dedupe key**
- `'sms'` to the `crm_touchpoints.channel` check

### Webhook

Aloware → Integrations → Webhooks → **+ Add Webhook**

- **URL:** `https://gohconsulting.app/api/webhooks/aloware`
- **Auth:** Bearer, token = `ALOWARE_WEBHOOK_SECRET`. Paste the token on its own —
  Aloware prepends the word `Bearer` itself, so typing it too sends
  `Bearer Bearer <token>` and every delivery 403s.
- **Events:** `Communication disposed`, `Call disposed`, `Recording saved`,
  `Transcription saved`, `Call summarized`, `Voicemail saved`.

Subscribing all six is safe. They carry the same communication id, and the receiver
folds them into one timeline entry that gets richer as the recording and transcript
arrive — in whatever order Aloware sends them (see `mergeAlowareContent`).

**Do not subscribe `Communication initiated`.** It fires when the call *starts*, so
it carries no duration and no disposition. The receiver would log it as a touchpoint
reading "not answered", claim the dedupe key, count a dial, and mirror a no-answer
call into Close — and the real outcome arriving seconds later would be deduped away.
Every call would read as unanswered.

The contact, DNC and appointment events are ignored (no communication to log), so
enabling them costs nothing but does nothing.

---

## How the sync actually flows

```
       call/text happens
              │
         [ Aloware ]
              │  webhook
              ▼
   /api/webhooks/aloware
              │
              ├─► crm_touchpoints  (external_id = alo:<id>, UNIQUE)
              │   + dials_made, + follow-up cadence rolled
              │
              └─► Close activity   (source: External, note: "[alo:<id>] …")
```

And separately, every 10 minutes via `/api/cron/close-sync`:

```
   crm_leads ──► Aloware contacts   (so a ringing number has a name)
   crm_leads ──► Close leads        (unchanged, as before)
```

### Why there's no Aloware sweep

Aloware publishes no endpoint for listing past communications. The webhook is the
only inbound path, so there is nothing a cron could pull back in. That's why the
receiver is built to be idempotent rather than reconciled, and why it always answers
200 — a non-2xx makes Aloware retry, and an event that can never match (a number
that isn't in the CRM) would retry forever.

**Consequence worth knowing:** if the app is down when a call finishes, that call is
not in the CRM and no sweep will find it later. Aloware's own history still has it.

---

## The three duplicate risks, and what stops each

| Risk | What stops it |
| --- | --- |
| Aloware fires 4 events for one call | `crm_touchpoints.external_id` UNIQUE index. First insert wins the race; later events only *update* the row, and only if they carry a recording/transcript/summary the row doesn't have. |
| We push a call into Close, then `importCloseCalls` reads it back as new | Every **call** this app writes into Close carries `[alo:<id>]` in its note, and `isCloseExternalEcho()` makes the importer skip its own writes. SMS carries no marker and needs none — we never import SMS back out of Close, and the text field is what a rep actually reads in the thread. |
| Twilio dialer and Aloware both running | They're different phone systems — a call exists in one or the other, never both. Both write to `crm_touchpoints` in the same format, so the timeline reads as one history. The Twilio path is untouched. |

Dials are counted the same way on both systems: **outbound calls only.** An inbound
call is activity that rolls the cadence but is not a dial, and a text is never a
dial.

---

## Retiring Twilio later

Nothing here depends on Twilio, and nothing in Twilio depends on this. When Aloware
has proven itself, the Twilio dialer can be removed in one pass:

- `lib/twilio.ts`
- `app/api/webhooks/twilio/` (six routes)
- the dialer UI and the `crm_calls` table
- `TWILIO_*` env vars in Vercel

Leave it running until then — it's the fallback if Aloware setup stalls.
