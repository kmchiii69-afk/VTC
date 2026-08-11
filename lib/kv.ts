import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { logEvent } from '@/lib/journey';

let _client: SupabaseClient | null = null;
export function db() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return _client;
}

// True when a read failed because the table isn't there yet (migration not run),
// as opposed to a transient network/DB error. Only the former may safely fall
// back to built-in defaults — treating a hiccup as "missing table" is what made
// /modules silently serve a different (older, shorter) catalog on some loads.
export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  if (code === '42P01' || code === 'PGRST205') return true;
  return /does not exist|schema cache/i.test(e?.message ?? '');
}

const TABLE = 'portal_users';

export interface User {
  email: string;
  password_hash: string;
  active: boolean;
  status: 'pending' | 'approved' | 'rejected'; // signup approval gate; login requires 'approved'
  role: 'user' | 'admin';
  name: string;
  avatar: string;
  discord_id: string;
  discord_channel_id: string;
  activity_level: string;
  created_at: number;
  last_login: number;
  start_date: number;
  last_call_date: number;
  contract_end_date: number;
  revenue_goal: number;
  revenue_current: number;
  tags: string[];
  features: string[]; // gateable portal feature ids; null/empty => DEFAULT_FEATURES
  onboarded_at: number | null; // ms epoch when onboarding finished; null = new client
  contract_tier: string | null; // which Brand Architect contract the client signed ('14k' | '25k')
  team_role: string | null; // internal seat (csm/am, strategist, scriptwriter, qa, editor, …); null = client
}

export type PublicUser = Omit<User, 'password_hash'>;

export async function getUser(email: string): Promise<User | null> {
  const key = email.toLowerCase().trim();
  // A transport-level blip here (cold start, dropped connection, DNS) used to
  // fail the whole login as "service temporarily unavailable". PostgREST reports
  // those with an empty error code, which is what we retry — a real DB answer
  // (including "no rows") is never retried.
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await db().from(TABLE).select('*').eq('email', key).single();

    // PGRST116 = no rows found — the normal "user doesn't exist" case.
    if (!error || error.code === 'PGRST116') return data ?? null;

    const isTransport = !error.code;
    if (isTransport && attempt < 2) {
      console.warn(`[kv] portal_users lookup blipped (attempt ${attempt + 1}): ${error.message}`);
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      continue;
    }
    // Include the code so logs separate a transport failure from a schema or
    // duplicate-row problem.
    throw new Error(`portal_users lookup failed [${error.code || 'transport'}]: ${error.message}`);
  }
}

// Lightweight lookup of just a user's feature allowlist (used by the proxy to
// gate page access without pulling the whole row).
export async function getUserFeatures(email: string): Promise<string[] | null> {
  const { data } = await db()
    .from(TABLE)
    .select('features')
    .eq('email', email.toLowerCase().trim())
    .single();
  return (data?.features as string[] | null | undefined) ?? null;
}

export async function getAllUsers(): Promise<User[]> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createUser(data: {
  email: string;
  password: string;
  role?: 'user' | 'admin';
  name?: string;
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<User> {
  const email = data.email.toLowerCase().trim();
  const password_hash = await bcrypt.hash(data.password, 12);
  const now = Date.now();
  const record = {
    email,
    password_hash,
    active: true,
    role: data.role || 'user',
    name: data.name || '',
    avatar: '',
    discord_id: '',
    activity_level: '',
    created_at: now,
    last_login: 0,
    // Only set when explicitly provided (e.g. self-serve signup → 'pending').
    // Otherwise let the DB default ('approved') apply so admin-created accounts
    // are usable immediately.
    ...(data.status ? { status: data.status } : {}),
  };
  const { data: created } = await db().from(TABLE).insert(record).select().single();
  return created ?? record;
}

export async function updateUser(
  email: string,
  updates: Partial<Omit<User, 'email' | 'password_hash'>>
): Promise<User | null> {
  const { data, error } = await db()
    .from(TABLE)
    .update(updates)
    .eq('email', email.toLowerCase().trim())
    .select()
    .single();
  // Surface DB errors (e.g. unknown column) instead of silently no-op'ing —
  // callers that don't care can catch; the admin PATCH route reports it.
  if (error) throw new Error(error.message);
  return data ?? null;
}

// Bulk-set the portal feature allowlist on every member (non-admin) at once.
// Admins are left untouched (they always see everything). Returns the number of
// rows updated. Used by the admin "apply to all members" control.
export async function setAllMemberFeatures(features: string[]): Promise<number> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ features })
    .or('role.is.null,role.eq.user')
    .select('email');
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function updatePassword(email: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  await db()
    .from(TABLE)
    .update({ password_hash: hash })
    .eq('email', email.toLowerCase().trim());
}

export async function deleteUser(email: string): Promise<void> {
  await db().from(TABLE).delete().eq('email', email.toLowerCase().trim());
}

// Every table that stores per-member data keyed by their email. Deleting a user
// only removes their portal_users row, so we purge the rest here — letting a
// re-invited email start completely fresh (no stale onboarding/roadmap/journey
// progress, forms, uploads, check-ins, summaries, etc.). Each delete is
// independent and non-fatal so a not-yet-migrated table never aborts the rest.
const CLIENT_DATA_TABLES: { table: string; col: string }[] = [
  { table: 'client_events', col: 'client_email' },
  { table: 'onboarding_progress', col: 'user_email' },
  { table: 'onboarding_uploads', col: 'user_email' },
  { table: 'onboarding_form_responses', col: 'client_email' },
  { table: 'action_items', col: 'client_email' },
  { table: 'roadmap_progress', col: 'user_email' },
  { table: 'acquisition_roadmap_progress', col: 'user_email' },
  { table: 'module_progress', col: 'user_email' },
  { table: 'client_wins', col: 'user_email' },
  { table: 'client_summaries', col: 'client_email' },
  { table: 'roadmap_phase_notifications', col: 'user_email' },
  { table: 'onboarding_reminders', col: 'user_email' },
  { table: 'weekly_cash', col: 'user_email' },
  { table: 'weekly_cash_prompts', col: 'user_email' },
  { table: 'client_content_context', col: 'client_email' },
  { table: 'check_ins', col: 'client_email' },
  { table: 'client_progress', col: 'client_email' },
];

export async function eraseClientData(email: string): Promise<void> {
  const e = email.toLowerCase().trim();
  await Promise.all(
    CLIENT_DATA_TABLES.map(async ({ table, col }) => {
      try {
        await db().from(table).delete().eq(col, e);
      } catch {
        /* table may not exist yet — non-fatal */
      }
    }),
  );
}

// A real bcrypt hash: $2a/$2b/$2y, cost, then the 53-char salt+digest.
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$.{53}$/;

export async function validateCredentials(email: string, password: string): Promise<User | null> {
  const user = await getUser(email);
  if (!user || !user.active) return null;
  // bcrypt.compare THROWS on a null/undefined hash ("Illegal arguments"), which
  // the login route used to report as a 503 "service temporarily unavailable" —
  // sending the user chasing an outage that wasn't happening. An unusable hash
  // is an account problem, so read it as a failed password and log the cause.
  if (!BCRYPT_HASH_RE.test(user.password_hash ?? '')) {
    console.error(`[auth] ${user.email} has no usable password_hash — needs a password reset`);
    return null;
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return user;
}

export async function recordLogin(email: string): Promise<void> {
  await db()
    .from(TABLE)
    .update({ last_login: Date.now() })
    .eq('email', email.toLowerCase().trim());
  await logEvent({ clientEmail: email, type: 'login', title: 'Signed in to portal' });
}

export async function userExists(email: string): Promise<boolean> {
  const { count } = await db()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('email', email.toLowerCase().trim());
  return (count ?? 0) > 0;
}

/* ─── Roadmap Progress ────────────────────────────────────────────────────── */
const PROGRESS_TABLE = 'roadmap_progress';

export async function getRoadmapProgress(email: string): Promise<string[]> {
  const { data } = await db()
    .from(PROGRESS_TABLE)
    .select('item_id')
    .eq('user_email', email.toLowerCase().trim());
  return (data ?? []).map((r: { item_id: string }) => r.item_id);
}

export async function setRoadmapItem(
  email: string, itemId: string, completed: boolean
): Promise<void> {
  const e = email.toLowerCase().trim();
  if (completed) {
    await db().from(PROGRESS_TABLE).upsert(
      { user_email: e, item_id: itemId, completed_at: new Date().toISOString() },
      { onConflict: 'user_email,item_id' }
    );
  } else {
    await db().from(PROGRESS_TABLE).delete()
      .eq('user_email', e).eq('item_id', itemId);
  }
}

// Record that the team has been notified about (client, phase) completing.
// Returns true if this is the FIRST time (so the caller should send the ping).
// If the dedup table doesn't exist yet, returns true so notifications still work.
export async function markPhaseNotified(email: string, phaseId: string): Promise<boolean> {
  const e = email.toLowerCase().trim();
  const { data, error } = await db()
    .from('roadmap_phase_notifications')
    .upsert({ user_email: e, phase_id: phaseId }, { onConflict: 'user_email,phase_id', ignoreDuplicates: true })
    .select('phase_id');
  if (error) return true; // table missing → still notify (no dedup until the migration runs)
  return (data?.length ?? 0) > 0;
}

/* ─── Module Progress (portal Modules tab) ────────────────────────────────── */
const MODULE_TABLE = 'module_progress';

export async function getModuleProgress(email: string): Promise<string[]> {
  const { data } = await db()
    .from(MODULE_TABLE)
    .select('module_id')
    .eq('user_email', email.toLowerCase().trim());
  return (data ?? []).map((r: { module_id: string }) => r.module_id);
}

export async function setModuleItem(email: string, moduleId: string, completed: boolean): Promise<void> {
  const e = email.toLowerCase().trim();
  if (completed) {
    await db().from(MODULE_TABLE).upsert(
      { user_email: e, module_id: moduleId, completed_at: new Date().toISOString() },
      { onConflict: 'user_email,module_id' }
    );
  } else {
    await db().from(MODULE_TABLE).delete().eq('user_email', e).eq('module_id', moduleId);
  }
}

/* ─── Client Wins ─────────────────────────────────────────────────────────── */
const WINS_TABLE = 'client_wins';

export interface ClientWin {
  id: string;
  user_email: string;
  content: string;
  source: 'manual' | 'discord';
  discord_message_id: string;
  created_at: string;
}

export async function getWins(email: string): Promise<ClientWin[]> {
  const { data } = await db()
    .from(WINS_TABLE)
    .select('*')
    .eq('user_email', email.toLowerCase().trim())
    .order('created_at', { ascending: false });
  return (data ?? []) as ClientWin[];
}

export async function addWin(
  email: string,
  content: string,
  source: 'manual' | 'discord' = 'manual',
  discordMessageId = ''
): Promise<ClientWin> {
  const { data } = await db()
    .from(WINS_TABLE)
    .insert({
      user_email: email.toLowerCase().trim(),
      content,
      source,
      discord_message_id: discordMessageId,
    })
    .select()
    .single();
  return data as ClientWin;
}

export async function deleteWin(id: string): Promise<void> {
  await db().from(WINS_TABLE).delete().eq('id', id);
}
