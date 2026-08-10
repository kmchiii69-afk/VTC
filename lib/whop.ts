// Whop revenue — shared by the analytics + funnel routes.
// TODO: Update PRODUCT_NAME_MAP with your actual Whop product IDs from the Whop dashboard.

const PRODUCT_NAME_CACHE: Record<string, string> = {};

// TODO: update this map with your actual Whop product IDs → display names
const PRODUCT_NAME_MAP: Record<string, string> = {
  // example: "prod_XXXXXXXXXXXXXXX": "Brand Architect DWY",
  // example: "prod_XXXXXXXXXXXXXXX": "Brand Architect DFY",
};

export function funnelForProduct(name: string): "ht" | "lm" | "other" {
  const n = name.toLowerCase();
  if (n.includes("brand architect") || n.includes("dwy") || n.includes("dfy")) return "ht";
  if (n.includes("lead magnet") || n.includes("free")) return "lm";
  return "other";
}

async function resolveProductName(id: string, headers: Record<string, string>): Promise<string> {
  if (!id || !id.startsWith("prod_")) return id || "—";
  if (PRODUCT_NAME_CACHE[id]) return PRODUCT_NAME_CACHE[id];
  if (PRODUCT_NAME_MAP[id]) { PRODUCT_NAME_CACHE[id] = PRODUCT_NAME_MAP[id]; return PRODUCT_NAME_MAP[id]; }
  try {
    const res = await fetch(`https://api.whop.com/api/v2/products/${id}`, { headers, next: { revalidate: 86400 } });
    if (res.ok) {
      const d = await res.json();
      const name = d.name || d.title || id;
      PRODUCT_NAME_CACHE[id] = name;
      return name;
    }
  } catch { /* fall through */ }
  return id;
}

export type Seg = { count: number; revenue: number };
export type WhopRevenue = {
  gross: number;
  net: number;
  refunds: number;
  count: number;
  byFunnel: { ht: number; lm: number; other: number };
  byProduct: { name: string; count: number; revenue: number; funnel: string }[];
  oneTime: Seg;
  recurring: Seg;
  htClose: Seg;       // high-ticket closes ≥ threshold
  htPartial: Seg;     // deposits / downsells
  htRecurring: Seg;   // payment-plan installments
  htCloseMems: string[];
  segments: { product: string; kind: "one-time" | "recurring"; price: number; count: number; revenue: number; funnel: string }[];
};

// TODO: set this to your minimum qualifying sale amount for a "close"
const HT_CLOSE_THRESHOLD = parseInt(process.env.WHOP_HT_CLOSE_THRESHOLD || "2500");

// TODO: set WHOP_HT_PRODUCT_IDS env var to comma-separated Whop product IDs for your high-ticket offer
const htProductIds = (): Set<string> => new Set((process.env.WHOP_HT_PRODUCT_IDS || "").split(",").filter(Boolean));

const addSeg = (s: Seg, amt: number) => { s.count++; s.revenue += amt; };

export type WhopTrends = {
  monthly: { month: string; oneTime: number; recurring: number; total: number; count: number }[];
  memberships: { active: number; canceled: number; expired: number; completed: number };
};

export async function fetchWhopTrends(months: number): Promise<WhopTrends | null> {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const floor = Math.floor(Date.now() / 1000) - months * 31 * 86_400;

  type Pay = { status?: string; final_amount?: number; paid_at?: number; created_at?: number; billing_reason?: string };
  const buckets: Record<string, { oneTime: number; recurring: number; count: number }> = {};

  for (let page = 1; page <= 90; page++) {
    const res = await fetch(`https://api.whop.com/api/v2/payments?page=${page}&per=50`, { headers, next: { revalidate: 3600 } });
    if (!res.ok) break;
    const items: Pay[] = (await res.json()).data ?? [];
    if (items.length === 0) break;
    for (const p of items) {
      const ts = p.paid_at ?? p.created_at ?? 0;
      if (ts < floor || p.status !== "paid") continue;
      const month = new Date(ts * 1000).toISOString().slice(0, 7);
      const b = (buckets[month] ??= { oneTime: 0, recurring: 0, count: 0 });
      const amt = p.final_amount ?? 0;
      const reason = p.billing_reason ?? "";
      if (reason === "one_time" || reason === "subscription_create") b.oneTime += amt;
      else b.recurring += amt;
      b.count++;
    }
    if (Math.min(...items.map((p) => p.paid_at ?? p.created_at ?? 0)) < floor) break;
  }

  const monthly = Object.entries(buckets)
    .map(([month, b]) => ({ month, oneTime: Math.round(b.oneTime), recurring: Math.round(b.recurring), total: Math.round(b.oneTime + b.recurring), count: b.count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const memberships = { active: 0, canceled: 0, expired: 0, completed: 0 };
  await Promise.all(
    (["active", "canceled", "expired", "completed"] as const).map(async (st) => {
      const r = await fetch(`https://api.whop.com/api/v2/memberships?page=1&per=1&status=${st}`, { headers, next: { revalidate: 3600 } });
      if (r.ok) memberships[st] = (await r.json()).pagination?.total_count ?? 0;
    }),
  );

  return { monthly, memberships };
}

export async function fetchWhopRevenue(days: number): Promise<WhopRevenue | null> {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const cutoff = Math.floor(Date.now() / 1000) - days * 86_400;
  const hardFloor = Math.floor(Date.now() / 1000) - (days + 15) * 86_400;
  const HT_IDS = htProductIds();

  type Pay = {
    status?: string; final_amount?: number; refunded_amount?: number;
    paid_at?: number; created_at?: number; product?: string;
    access_pass?: string; billing_reason?: string; membership?: string;
  };
  const htCloseMems: string[] = [];
  const inWindow: Pay[] = [];

  for (let page = 1; page <= 80; page++) {
    const res = await fetch(`https://api.whop.com/api/v2/payments?page=${page}&per=50`, { headers, next: { revalidate: 300 } });
    if (!res.ok) break;
    const items: Pay[] = (await res.json()).data ?? [];
    if (items.length === 0) break;
    for (const p of items) {
      const ts = p.paid_at ?? p.created_at ?? 0;
      if (ts >= cutoff && p.status === "paid") inWindow.push(p);
    }
    const oldest = Math.min(...items.map((p) => p.paid_at ?? p.created_at ?? 0));
    if (oldest < hardFloor) break;
  }

  let gross = 0, refunds = 0;
  const prodAgg: Record<string, { id: string; count: number; revenue: number }> = {};
  for (const p of inWindow) {
    const amt = p.final_amount ?? 0;
    gross += amt;
    refunds += p.refunded_amount ?? 0;
    const pid = (typeof p.product === "string" ? p.product : "") || (typeof p.access_pass === "string" ? p.access_pass : "") || "—";
    if (!prodAgg[pid]) prodAgg[pid] = { id: pid, count: 0, revenue: 0 };
    prodAgg[pid].count++;
    prodAgg[pid].revenue += amt;
  }

  const byFunnel = { ht: 0, lm: 0, other: 0 };
  const byProduct: WhopRevenue["byProduct"] = [];
  for (const agg of Object.values(prodAgg)) {
    const name = await resolveProductName(agg.id, headers);
    const funnel = funnelForProduct(name);
    byFunnel[funnel] += agg.revenue;
    byProduct.push({ name, count: agg.count, revenue: Math.round(agg.revenue), funnel });
  }
  byProduct.sort((a, b) => b.revenue - a.revenue);

  const oneTime: Seg = { count: 0, revenue: 0 };
  const recurring: Seg = { count: 0, revenue: 0 };
  const htClose: Seg = { count: 0, revenue: 0 };
  const htPartial: Seg = { count: 0, revenue: 0 };
  const htRecurring: Seg = { count: 0, revenue: 0 };
  const segAgg: Record<string, { product: string; kind: "one-time" | "recurring"; price: number; pid: string; count: number; revenue: number }> = {};

  for (const p of inWindow) {
    const amt = p.final_amount ?? 0;
    if (amt <= 0) continue;
    const pid = (typeof p.product === "string" ? p.product : "") || "—";
    const name = await resolveProductName(pid, headers);
    const funnel = funnelForProduct(name);
    const reason = p.billing_reason ?? "";
    const isOneTime = reason === "one_time" || reason === "subscription_create";
    if (isOneTime) addSeg(oneTime, amt);
    else addSeg(recurring, amt);

    if (funnel === "ht" || (HT_IDS.size > 0 && HT_IDS.has(pid))) {
      if (!isOneTime) addSeg(htRecurring, amt);
      else if (amt >= HT_CLOSE_THRESHOLD) { addSeg(htClose, amt); if (p.membership) htCloseMems.push(p.membership); }
      else addSeg(htPartial, amt);
    }

    const price = Math.round(amt);
    const key = `${name}|${isOneTime ? "one-time" : "recurring"}|${price}`;
    if (!segAgg[key]) segAgg[key] = { product: name, kind: isOneTime ? "one-time" : "recurring", price, pid, count: 0, revenue: 0 };
    segAgg[key].count++;
    segAgg[key].revenue += amt;
  }

  const segments = Object.values(segAgg)
    .map((s) => ({ product: s.product, kind: s.kind, price: s.price, count: s.count, revenue: Math.round(s.revenue), funnel: funnelForProduct(s.product) }))
    .sort((a, b) => b.revenue - a.revenue);

  const rnd = (s: Seg): Seg => ({ count: s.count, revenue: Math.round(s.revenue) });

  return {
    gross: Math.round(gross), net: Math.round(gross - refunds), refunds: Math.round(refunds), count: inWindow.length,
    byFunnel: { ht: Math.round(byFunnel.ht), lm: Math.round(byFunnel.lm), other: Math.round(byFunnel.other) },
    byProduct, oneTime: rnd(oneTime), recurring: rnd(recurring),
    htClose: rnd(htClose), htPartial: rnd(htPartial), htRecurring: rnd(htRecurring), htCloseMems,
    segments,
  };
}
