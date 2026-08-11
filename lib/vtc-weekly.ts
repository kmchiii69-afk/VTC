// Weekly CSM tracker — one row per client per week (Mon–Fri status cells +
// Posted?/reason), digitizing the team's Google sheet.

import { db, isMissingTable } from "@/lib/kv";

export const WEEKLY_TABLE = "vtc_weekly";

export interface WeekRow {
  client_email: string;
  week_start: string;
  days: Record<string, string>; // mon..fri
  posted: string | null;
}

// ISO yyyy-mm-dd of the Monday for a given date (UTC-stable).
export function mondayOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getWeek(weekStart: string): Promise<Map<string, WeekRow>> {
  try {
    const { data, error } = await db().from(WEEKLY_TABLE).select("*").eq("week_start", weekStart);
    if (error) throw error;
    const m = new Map<string, WeekRow>();
    for (const r of data ?? []) {
      m.set(String(r.client_email).toLowerCase(), {
        client_email: r.client_email,
        week_start: r.week_start,
        days: (r.days as Record<string, string>) ?? {},
        posted: (r.posted as string) ?? null,
      });
    }
    return m;
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}

export async function upsertWeek(
  clientEmail: string,
  weekStart: string,
  patch: { day?: string; value?: string; posted?: string },
): Promise<WeekRow> {
  const email = clientEmail.toLowerCase().trim();
  // Read-merge-write the days jsonb.
  const { data: existing } = await db().from(WEEKLY_TABLE).select("*").eq("client_email", email).eq("week_start", weekStart).single();
  const days: Record<string, string> = { ...((existing?.days as Record<string, string>) ?? {}) };
  if (patch.day) {
    if (patch.value && patch.value.trim()) days[patch.day] = patch.value.trim();
    else delete days[patch.day];
  }
  const posted = patch.posted !== undefined ? (patch.posted.trim() || null) : (existing?.posted ?? null);
  const { data, error } = await db()
    .from(WEEKLY_TABLE)
    .upsert({ client_email: email, week_start: weekStart, days, posted, updated_at: new Date().toISOString() }, { onConflict: "client_email,week_start" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { client_email: email, week_start: weekStart, days: (data?.days as Record<string, string>) ?? days, posted: (data?.posted as string) ?? posted };
}

// videos/week from a plan string like "2 Videos PW DFY" (fallback 1).
export function videosPerWeekFromPlan(plan: string | null | undefined): number {
  if (!plan) return 1;
  const m = plan.match(/(\d+)\s*video/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}
