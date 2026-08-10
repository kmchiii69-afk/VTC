import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/journey';
import type { User } from '@/lib/kv';

// Shares the Supabase service-role connection pattern used by lib/action-items.ts.
let _client: SupabaseClient | null = null;
function db() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  }
  return _client;
}

const TABLE = 'monthly_forms';

export interface MonthlyForm {
  id: string;
  user_email: string;
  period: string;                 // 'YYYY-MM'
  cash_collected: number | null;
  ig_reels_posted: number | null;
  yt_videos_posted: number | null;
  a_plus_problem: string | null;
  submitted_at: string;
}

export interface MonthlyFormInput {
  cashCollected: number;
  igReelsPosted: number;
  ytVideosPosted: number;
  aPlusProblem: string;
}

function norm(email: string) {
  return email.toLowerCase().trim();
}

function ym(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Human label for a 'YYYY-MM' period, e.g. "August 2026".
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${MONTHS[m - 1]} ${y}`;
}

// The month whose report is due RIGHT NOW. The form is an end-of-month check-in:
// it is due ONLY on the last calendar day of the month, and it reports THAT
// (current) month. On every other day nothing is due (returns null) — the gate
// never fires mid-month and never chases past months. First fire is the last day
// of the current month.
export function duePeriod(now: Date = new Date()): string | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return now.getUTCDate() === lastDay ? ym(now) : null;
}

// The earliest period a member can be required to report — the month they became
// a member (onboarded, else account creation). Prevents gating someone for a
// month before they joined.
function memberSincePeriod(user: User): string {
  const ms = user.onboarded_at ?? user.created_at ?? Date.now();
  return ym(new Date(ms));
}

export async function getSubmission(email: string, period: string): Promise<MonthlyForm | null> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_email', norm(email))
    .eq('period', period)
    .maybeSingle();
  return (data as MonthlyForm) ?? null;
}

export interface MonthlyFormStatus {
  required: boolean;
  period: string | null;
  monthLabel: string;
}

// Whether this member must fill the form before using the app right now.
export async function getStatus(user: User, now: Date = new Date()): Promise<MonthlyFormStatus> {
  const period = duePeriod(now);
  // Not the end of the month → nothing due, gate stays down.
  if (!period) return { required: false, period: null, monthLabel: '' };
  const base = { period, monthLabel: periodLabel(period) };

  // Only onboarded, active clients are gated. Admins and mid-onboarding users skip.
  if (user.role !== 'user' || !user.onboarded_at) return { required: false, ...base };
  // Don't gate for a month before the member joined.
  if (period < memberSincePeriod(user)) return { required: false, ...base };

  // Fail OPEN: if the table is missing or the query errors, never lock the member
  // out of the whole app. Only an actual "no row" result gates them.
  const { data, error } = await db()
    .from(TABLE)
    .select('id')
    .eq('user_email', norm(user.email))
    .eq('period', period)
    .maybeSingle();
  if (error) return { required: false, ...base };
  return { required: !data, ...base };
}

// Save (or overwrite) this member's submission for the given period.
export async function submit(email: string, period: string, input: MonthlyFormInput): Promise<MonthlyForm | null> {
  const row = {
    user_email: norm(email),
    period,
    cash_collected: input.cashCollected,
    ig_reels_posted: input.igReelsPosted,
    yt_videos_posted: input.ytVideosPosted,
    a_plus_problem: input.aPlusProblem.trim(),
    submitted_at: new Date().toISOString(),
  };
  const { data } = await db()
    .from(TABLE)
    .upsert(row, { onConflict: 'user_email,period' })
    .select()
    .single();
  const saved = (data as MonthlyForm) ?? null;
  if (saved) {
    await logEvent({
      clientEmail: saved.user_email,
      type: 'form_submitted',
      title: `Monthly form — ${periodLabel(period)}`,
      refTable: TABLE,
      refId: saved.id,
      metadata: {
        period,
        cash_collected: saved.cash_collected,
        ig_reels_posted: saved.ig_reels_posted,
        yt_videos_posted: saved.yt_videos_posted,
      },
    });
  }
  return saved;
}

// All of a member's submissions, newest month first (admin CSM view).
export async function listForMember(email: string): Promise<MonthlyForm[]> {
  const { data } = await db()
    .from(TABLE)
    .select('*')
    .eq('user_email', norm(email))
    .order('period', { ascending: false });
  return (data ?? []) as MonthlyForm[];
}
