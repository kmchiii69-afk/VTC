// SegMetrics attribution. Two APIs:
//  - v1 GET /{acct}/report/{leads|revenue} → KPIs under linear attribution
//  - v2 POST /{acct}/v2/data/query → first-touch vs last-touch by channel/campaign

const BASE = "https://api.segmetrics.io";

function creds() {
  return { account: process.env.SEGMETRICS_ACCOUNT_ID || "", key: process.env.SEGMETRICS_API_KEY || "" };
}

type Kpi = { key: string; value: number };
type V1 = { kpis: Kpi[]; table: { rows: Record<string, number | string>[] }; graph: { labels: string[]; datasets: { data: number[] }[] } };

async function v1(type: "leads" | "revenue", query = ""): Promise<V1 | null> {
  const { account, key } = creds();
  if (!account || !key) return null;
  const res = await fetch(`${BASE}/${account}/report/${type}${query}`, { headers: { Authorization: key }, next: { revalidate: 900 } });
  return res.ok ? res.json() : null;
}

async function v2(dimension: string, metrics: string[], model: "first_touch" | "last_touch", start: string, end: string): Promise<[string, ...number[]][]> {
  const { account, key } = creds();
  if (!account || !key) return [];
  const res = await fetch(`${BASE}/v2/${account}/data/query`, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "leads", dimensions: [dimension], metrics, date_range: { start, end, scale: "day" }, filters: [], options: { attribution_model: model } }),
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const d = await res.json();
  return (d.rows ?? []) as [string, ...number[]][];
}

export type Touch = { channel: string; leads: number; revenue: number };
export type SegAttribution = {
  revenue: number; customers: number; aov: number;
  totalLeads: number; leadValue: number; daysUntilPurchase: number; convRate: number;
  byChannel: { channel: string; leads: number; customers: number; conversionRate: number; revenue: number; leadValue: number }[];
  firstTouch: Touch[];
  lastTouch: Touch[];
  topCampaigns: { campaign: string; leads: number }[];
  monthly: { month: string; revenue: number }[];
};

function ymd(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export async function fetchSegAttribution(): Promise<SegAttribution | null> {
  const start = ymd(30), end = ymd(0);
  const [rev, leads, first, last, camp] = await Promise.all([
    v1("revenue", "?" + new URLSearchParams({ start: "-90 day", scale: "month" })),
    v1("leads"),
    v2("clicks.channel", ["leads", "revenue"], "first_touch", start, end),
    v2("clicks.channel", ["leads", "revenue"], "last_touch", start, end),
    v2("clicks.utm_campaign", ["leads", "revenue"], "first_touch", start, end),
  ]);
  if (!rev && !leads && first.length === 0) return null;

  const kpi = (r: V1 | null, k: string) => Number(r?.kpis.find((x) => x.key === k)?.value ?? 0);

  const monthly: SegAttribution["monthly"] = [];
  const g = rev?.graph;
  if (g?.labels && g.datasets?.[0]) g.labels.forEach((lab, i) => monthly.push({ month: lab.slice(0, 7), revenue: Math.round(g.datasets[0].data[i] ?? 0) }));

  const byChannel = (leads?.table.rows ?? []).map((r) => ({
    channel: String(r.channel ?? "—"),
    leads: Number(r.leads ?? 0),
    customers: Number(r.numOfCustomers ?? 0),
    conversionRate: Number(r.conversionRate ?? 0),
    revenue: Math.round(Number(r.revenue ?? 0)),
    leadValue: Number(r.leadValue ?? 0),
  })).sort((a, b) => b.leads - a.leads);

  const toTouch = (rows: [string, ...number[]][]): Touch[] =>
    rows.map((r) => ({ channel: String(r[0] ?? "—"), leads: Number(r[1] ?? 0), revenue: Math.round(Number(r[2] ?? 0)) })).sort((a, b) => b.leads - a.leads);

  const topCampaigns = camp
    .map((r) => ({ campaign: String(r[0] ?? "—").replace(/\s*-\s*\d+$/, ""), leads: Number(r[1] ?? 0) }))
    .filter((c) => c.campaign && c.campaign !== "—" && c.leads > 0)
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  return {
    revenue: Math.round(kpi(rev, "revenue")),
    customers: kpi(rev, "numOfCustomers"),
    aov: Math.round(kpi(rev, "aov")),
    totalLeads: kpi(leads, "leads"),
    leadValue: Number(kpi(leads, "leadValue").toFixed(2)),
    daysUntilPurchase: kpi(leads, "daysUntilPurchase"),
    convRate: Number(kpi(leads, "conversionRate").toFixed(2)),
    byChannel,
    firstTouch: toTouch(first),
    lastTouch: toTouch(last),
    topCampaigns,
    monthly: monthly.filter((m) => m.revenue > 0),
  };
}
