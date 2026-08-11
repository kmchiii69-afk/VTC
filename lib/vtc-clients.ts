// Operational per-client state (pods, health, status). Client identity is read
// from Airtable (read-only); this Supabase table owns the account-management
// overlay: which AM owns them, their health flag, and paused/churned status.
// See supabase/vtc_team.sql.

import { db, isMissingTable } from "@/lib/kv";

export const CLIENTS_TABLE = "vtc_clients";

export type ClientHealth = "healthy" | "at_risk" | "defcon";
export type ClientStatus = "active" | "paused" | "churned" | "on_books";

export const HEALTH_VALUES: ClientHealth[] = ["healthy", "at_risk", "defcon"];
export const HEALTH_LABEL: Record<ClientHealth, string> = {
  healthy: "Healthy",
  at_risk: "At risk",
  defcon: "Defcon",
};

export interface VtcClient {
  client_email: string;
  account_manager_email: string | null;
  plan: string | null;
  videos_per_week: number;
  dfy: boolean;
  fixed_upload_day: string | null;
  status: ClientStatus;
  health: ClientHealth;
  slack_channel_id: string | null;
  status_note?: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientStateFields = Partial<
  Pick<VtcClient, "account_manager_email" | "plan" | "videos_per_week" | "dfy" | "fixed_upload_day" | "status" | "health" | "slack_channel_id">
>;

function normalize(row: Record<string, unknown>): VtcClient {
  return {
    client_email: String(row.client_email ?? "").toLowerCase(),
    account_manager_email: (row.account_manager_email as string) ?? null,
    plan: (row.plan as string) ?? null,
    videos_per_week: typeof row.videos_per_week === "number" ? row.videos_per_week : 1,
    dfy: row.dfy === undefined || row.dfy === null ? true : Boolean(row.dfy),
    fixed_upload_day: (row.fixed_upload_day as string) ?? null,
    status: ((row.status as ClientStatus) ?? "active"),
    health: ((row.health as ClientHealth) ?? "healthy"),
    slack_channel_id: (row.slack_channel_id as string) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

// All operational rows, keyed by client_email for cheap merge with Airtable.
export async function getAllClientStates(): Promise<Map<string, VtcClient>> {
  try {
    const { data, error } = await db().from(CLIENTS_TABLE).select("*");
    if (error) throw error;
    const map = new Map<string, VtcClient>();
    for (const r of data ?? []) map.set(String(r.client_email).toLowerCase(), normalize(r));
    return map;
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}

// Upsert operational state for one client (create the row if it doesn't exist).
export async function upsertClientState(email: string, fields: ClientStateFields): Promise<VtcClient> {
  const client_email = email.toLowerCase().trim();
  const { data, error } = await db()
    .from(CLIENTS_TABLE)
    .upsert({ client_email, ...fields, updated_at: new Date().toISOString() }, { onConflict: "client_email" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}
