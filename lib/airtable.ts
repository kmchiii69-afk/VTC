// VTC Airtable data layer — reads Jake's "Client Management" base.
// Foundation for the fulfillment app: clients, onboarding, videos, payments.
// All access goes through the server-side Personal Access Token (AIRTABLE_PAT);
// never expose it to the browser.

const AIRTABLE_API = "https://api.airtable.com/v0";

// "Client Management" base.
export const AIRTABLE_BASE_ID = "appimBLgEWgsrFhi3";

// Table IDs are stable even if a table is renamed, so we key off IDs.
export const AT_TABLES = {
  clients: "tblWxsnmoqBfd8Jwk",
  onboarding: "tblGnxz1fcWotZhW0",
  videos: "tbl3aITUCBygXXSKF",
  scriptTracker: "tblrOCce9gLlCR9iY",
  payments: "tblMCmBKey127GyRn",
  teamMembers: "tblMKkHwfG2q64Ub7",
  newSubmissions: "tbljST0vA3M5SbFeS",
  lifecycle: "tblj5u2etivhQtJQS",
  tasks: "tblNatzPBX8IlmuKz",
} as const;

function token(): string {
  const t = process.env.AIRTABLE_PAT;
  if (!t) throw new Error("AIRTABLE_PAT is not set");
  return t;
}

export interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: T;
}

export interface AirtableListOptions {
  fields?: string[];
  filterByFormula?: string;
  view?: string;
  maxRecords?: number;
  pageSize?: number;
  sort?: { field: string; direction?: "asc" | "desc" }[];
}

/** Generic paginated read of an Airtable table (handles the 100-row page cap). */
export async function airtableList<T = Record<string, unknown>>(
  tableId: string,
  opts: AirtableListOptions = {},
): Promise<AirtableRecord<T>[]> {
  const out: AirtableRecord<T>[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    (opts.fields ?? []).forEach((f) => params.append("fields[]", f));
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    if (opts.view) params.set("view", opts.view);
    params.set("pageSize", String(opts.pageSize ?? 100));
    (opts.sort ?? []).forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field);
      params.set(`sort[${i}][direction]`, s.direction ?? "asc");
    });
    if (offset) params.set("offset", offset);

    const res = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tableId}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable ${tableId} responded ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { records: AirtableRecord<T>[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
    if (opts.maxRecords && out.length >= opts.maxRecords) return out.slice(0, opts.maxRecords);
  } while (offset);
  return out;
}

/** Fetch a single record by id. */
export async function airtableGet<T = Record<string, unknown>>(
  tableId: string,
  recordId: string,
): Promise<AirtableRecord<T> | null> {
  const res = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${tableId}/${recordId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airtable ${tableId}/${recordId} responded ${res.status}`);
  return (await res.json()) as AirtableRecord<T>;
}

// ── Clients ──────────────────────────────────────────────────────────────────
// The Clients table has 272 fields; we read a curated, portal-relevant subset.
export interface ClientFields {
  Name?: string;
  Email?: string;
  "Client Plan"?: string;
  "Delivery Status (manual update)"?: string;
  "Billing Status"?: string;
  "Ob Status"?: string;
  "Slack Channel ID"?: string;
  "Client Slack ID"?: string;
  "YT Channel Name"?: string;
  "YT Channel Access"?: string;
  "YT Equipment"?: string;
  "Test Video"?: string;
  "Stripe Unique Identifier"?: string;
  "Kickoff Date"?: string;
  "📅 Renewal Date"?: string;
  LTV?: number;
}

export const CLIENT_FIELDS: (keyof ClientFields)[] = [
  "Name",
  "Email",
  "Client Plan",
  "Delivery Status (manual update)",
  "Billing Status",
  "Ob Status",
  "Slack Channel ID",
  "Client Slack ID",
  "YT Channel Name",
  "YT Channel Access",
  "YT Equipment",
  "Test Video",
  "Stripe Unique Identifier",
  "Kickoff Date",
  "📅 Renewal Date",
  "LTV",
];

export type ClientRecord = AirtableRecord<ClientFields>;

/** All clients (curated fields). */
export function getClients(opts: Omit<AirtableListOptions, "fields"> = {}): Promise<ClientRecord[]> {
  return airtableList<ClientFields>(AT_TABLES.clients, { fields: CLIENT_FIELDS as string[], ...opts });
}

/** Look up a client by their email (case-insensitive). Returns null if none. */
export async function getClientByEmail(email: string): Promise<ClientRecord | null> {
  const safe = email.toLowerCase().replace(/['"\\]/g, "");
  const rows = await airtableList<ClientFields>(AT_TABLES.clients, {
    fields: CLIENT_FIELDS as string[],
    filterByFormula: `LOWER({Email})='${safe}'`,
    maxRecords: 1,
  });
  return rows[0] ?? null;
}

/** Active clients only (Delivery Status = Active). */
export function getActiveClients(): Promise<ClientRecord[]> {
  return getClients({ filterByFormula: `{Delivery Status (manual update)}='Active'` });
}
