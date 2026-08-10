// Sales-call → client attribution.
//
// When a sales/closing call's attendee email matches an active portal MEMBER
// (role 'user'), the call is linked to that client (calls.client_email) and a
// `sales_call` event is written to their journey so it surfaces on the CSM
// dashboard. Prospects who aren't members yet simply stay unlinked.
//
// Reuses the same email extraction the coaching-call pipeline uses
// (normalizeFathomPayload) so it works across Fathom's varying payload shapes.

import { db, getUser, type User } from '@/lib/kv';
import { normalizeFathomPayload } from '@/lib/checkin-matching';
import { logEvent, eventExistsForRef } from '@/lib/journey';

export interface AttributionResult {
  clientEmail: string | null;
  matched: boolean;
}

// Find the first active MEMBER (role 'user') among a call's attendee emails.
async function findClientFromEmails(emails: string[]): Promise<User | null> {
  for (const email of emails) {
    const u = await getUser(email);
    if (u && u.active && u.role === 'user') return u;
  }
  return null;
}

// Link one call row to a matching client (if any) and log its journey event.
// Idempotent: safe to call repeatedly for the same call (webhook retries, the
// daily sync, and the analyze pass may all touch the same row). `rawPayload`
// defaults to the call's stored raw_payload when not supplied.
export async function attributeSalesCall(
  callId: string,
  rawPayload?: unknown,
  meta?: { leadName?: string | null; outcome?: string | null; callDate?: string | null },
): Promise<AttributionResult> {
  let payload = rawPayload;
  if (payload == null) {
    const { data } = await db().from('calls').select('raw_payload').eq('id', callId).maybeSingle();
    payload = data?.raw_payload ?? null;
  }
  if (payload == null) return { clientEmail: null, matched: false };

  const norm = normalizeFathomPayload(payload);
  const client = await findClientFromEmails(norm.participantEmails);
  if (!client) return { clientEmail: null, matched: false };

  await db().from('calls').update({ client_email: client.email }).eq('id', callId);

  // One journey event per call — don't duplicate if we've already logged it.
  if (!(await eventExistsForRef('calls', callId))) {
    const lead = meta?.leadName?.trim() || norm.title || 'Sales call';
    const outcome = meta?.outcome && meta.outcome !== 'unknown' ? meta.outcome : null;
    await logEvent({
      clientEmail: client.email,
      type: 'sales_call',
      title: `Sales call${lead && lead !== 'Sales call' ? ` — ${lead}` : ''}`,
      summary: outcome ? `Outcome: ${outcome}` : null,
      refTable: 'calls',
      refId: callId,
      metadata: { outcome: meta?.outcome ?? null, matched_email: client.email },
      occurredAt: meta?.callDate ?? norm.callDate ?? null,
    });
  }

  return { clientEmail: client.email, matched: true };
}

// Backfill: attribute calls that were ingested before this feature (or before
// the client became a member). Bounded so it stays cheap — pure DB + getUser
// lookups, no Fathom or AI calls. Returns how many were newly linked.
export async function attributeUnlinkedCalls(limit = 200): Promise<{ scanned: number; linked: number }> {
  const { data } = await db()
    .from('calls')
    .select('id, raw_payload, lead_name, outcome, call_date')
    .is('client_email', null)
    .neq('status', 'internal')
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = data ?? [];
  let linked = 0;
  for (const row of rows) {
    const res = await attributeSalesCall(row.id as string, row.raw_payload, {
      leadName: row.lead_name as string | null,
      outcome: row.outcome as string | null,
      callDate: row.call_date as string | null,
    });
    if (res.matched) linked++;
  }
  return { scanned: rows.length, linked };
}
