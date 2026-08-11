// Owner-editable app settings (key/value JSON in Supabase). Currently holds the
// SLA-hours overrides per stage — the operational "roadmap" lever the owner
// tunes. Falls back to defaults when unset / table missing.

import { db, isMissingTable } from "@/lib/kv";
import { DEFAULT_SLA_HOURS } from "@/lib/vtc-sla";

export const SETTINGS_TABLE = "vtc_settings";

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  try {
    const { data, error } = await db().from(SETTINGS_TABLE).select("value").eq("key", key).single();
    if (error && error.code === "PGRST116") return null;
    if (error) throw error;
    return (data?.value ?? null) as T | null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await db()
    .from(SETTINGS_TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// Merged SLA hours (defaults + overrides). Always returns a full map.
export async function getSlaHours(): Promise<Record<string, number>> {
  const override = (await getSetting<Record<string, number>>("sla_hours").catch(() => null)) ?? {};
  return { ...DEFAULT_SLA_HOURS, ...override };
}

export async function setSlaHours(hours: Record<string, number>): Promise<void> {
  await setSetting("sla_hours", hours);
}
