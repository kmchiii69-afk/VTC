import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Reuses the same Supabase service-role connection pattern as lib/kv.ts.
let _client: SupabaseClient | null = null;
function db() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return _client;
}

const CHECK_INS = 'check_ins';
const PROGRESS = 'client_progress';

export type CheckInStatus = 'pending' | 'processed' | 'unmatched_client' | 'error';

export interface CheckIn {
  id: string;
  fathom_recording_id: string;
  title: string | null;
  coach_email: string | null;
  coach_name: string | null;
  client_email: string | null;
  call_date: string | null;
  duration_minutes: number | null;
  recording_url: string | null;
  transcript: string | null;
  summary_bullets: string[];
  action_steps: string[];
  queries_answered: string[];
  wins: string[];
  blockers: string[];
  red_flags: string[];
  sentiment: string | null;
  roadmap_updates: string[];
  raw_payload: unknown;
  status: CheckInStatus;
  created_at: string;
}

export type NewCheckIn = Partial<CheckIn> & {
  fathom_recording_id: string;
  status: CheckInStatus;
};

export interface ClientProgress {
  client_email: string;
  narrative: string;
  roadmap_state: Record<string, unknown>;
  open_action_items: string[];
  wins: string[];
  momentum: string | null;
  admin_notes: string;
  updated_at: string;
}

/* ─── check_ins ───────────────────────────────────────────────────────────── */

export async function insertCheckIn(record: NewCheckIn): Promise<CheckIn | null> {
  const { data } = await db().from(CHECK_INS).insert(record).select().single();
  return data ?? null;
}

export async function updateCheckIn(
  id: string,
  updates: Partial<CheckIn>
): Promise<CheckIn | null> {
  const { data } = await db().from(CHECK_INS).update(updates).eq('id', id).select().single();
  return data ?? null;
}

// Dedupe helper: has this recording already been ingested for this client?
// client may be null for unmatched rows (Postgres unique index treats NULLs as
// distinct, so we guard explicitly here).
export async function getCheckIn(
  fathomRecordingId: string,
  clientEmail: string | null
): Promise<CheckIn | null> {
  let q = db().from(CHECK_INS).select('*').eq('fathom_recording_id', fathomRecordingId);
  q = clientEmail ? q.eq('client_email', clientEmail) : q.is('client_email', null);
  const { data } = await q.maybeSingle();
  return data ?? null;
}

export async function listCheckInsForClient(clientEmail: string): Promise<CheckIn[]> {
  const { data } = await db()
    .from(CHECK_INS)
    .select('*')
    .eq('client_email', clientEmail.toLowerCase().trim())
    .order('call_date', { ascending: false, nullsFirst: false });
  return data ?? [];
}

export interface CheckInCounts {
  total: number;
  byCoach: { coach_email: string | null; coach_name: string | null; count: number }[];
}

// Counts are computed on read rather than denormalized.
export async function countCheckInsForClient(clientEmail: string): Promise<CheckInCounts> {
  const { data } = await db()
    .from(CHECK_INS)
    .select('coach_email, coach_name')
    .eq('client_email', clientEmail.toLowerCase().trim())
    .neq('status', 'unmatched_client');

  const rows = data ?? [];
  const map = new Map<string, { coach_email: string | null; coach_name: string | null; count: number }>();
  for (const r of rows) {
    const key = r.coach_email || r.coach_name || 'unknown';
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { coach_email: r.coach_email, coach_name: r.coach_name, count: 1 });
  }
  return {
    total: rows.length,
    byCoach: [...map.values()].sort((a, b) => b.count - a.count),
  };
}

export async function listUnmatchedCheckIns(): Promise<CheckIn[]> {
  const { data } = await db()
    .from(CHECK_INS)
    .select('*')
    .eq('status', 'unmatched_client')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function getCheckInById(id: string): Promise<CheckIn | null> {
  const { data } = await db().from(CHECK_INS).select('*').eq('id', id).maybeSingle();
  return data ?? null;
}

export async function deleteCheckIn(id: string): Promise<void> {
  await db().from(CHECK_INS).delete().eq('id', id);
}

// After a check-in is deleted, scrub its footprint from the client's rolling
// progress (which is cumulative across calls and surfaces to the client via
// /api/me/progress). Call this AFTER the row is deleted so the remaining set is
// accurate. No-op for unmatched check-ins (no client_email).
export async function recomputeProgressAfterCheckInDeletion(clientEmail: string): Promise<void> {
  const email = clientEmail.toLowerCase().trim();
  const remaining = (await listCheckInsForClient(email)).filter((c) => c.status === 'processed');
  const uniq = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.map((s) => (s ?? '').trim()).filter(Boolean)));

  if (remaining.length === 0) {
    // No calls left — wipe the AI-derived progress so nothing from the deleted
    // call lingers on the client's side. admin_notes is omitted (preserved by the
    // upsert), since it's admin-authored, not derived from a call.
    const existing = await getClientProgress(email);
    await upsertClientProgress(email, {
      narrative: '',
      open_action_items: [],
      wins: [],
      momentum: null,
      roadmap_state: { ...(existing?.roadmap_state ?? {}), current_phase: 0 },
    });
    return;
  }

  // Calls remain — rebuild the concrete lists from what's left. The free-text
  // narrative / momentum / phase are preserved (the upsert leaves untouched
  // columns alone) and get refreshed on the next check-in.
  await upsertClientProgress(email, {
    open_action_items: uniq(remaining.flatMap((c) => c.action_steps ?? [])).slice(0, 12),
    wins: uniq(remaining.flatMap((c) => c.wins ?? [])).slice(0, 12),
  });
}

/* ─── client_progress ─────────────────────────────────────────────────────── */

export async function getClientProgress(clientEmail: string): Promise<ClientProgress | null> {
  const { data } = await db()
    .from(PROGRESS)
    .select('*')
    .eq('client_email', clientEmail.toLowerCase().trim())
    .maybeSingle();
  return data ?? null;
}

export async function upsertClientProgress(
  clientEmail: string,
  updates: Partial<Omit<ClientProgress, 'client_email'>>
): Promise<ClientProgress | null> {
  const record = {
    client_email: clientEmail.toLowerCase().trim(),
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const { data } = await db()
    .from(PROGRESS)
    .upsert(record, { onConflict: 'client_email' })
    .select()
    .single();
  return data ?? null;
}
