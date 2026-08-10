// Lead magnet ROI — does the lead magnet produce high-ticket closes?
// Cross-references Kit/email subscribers with Whop buyers by email.
// TODO: Set KIT_LM_FORM_ID env var to your Kit form ID for the lead magnet.

// TODO: update product name matching to match your actual Whop product names
const FUNNEL = (name: string): "ht" | "lm" | "other" => {
  const n = name.toLowerCase();
  if (n.includes("brand architect") || n.includes("dwy") || n.includes("dfy")) return "ht";
  if (n.includes("lead magnet") || n.includes("free")) return "lm";
  return "other";
};

export type LeadMagnetRoi = {
  signups: number;
  buyers: number;
  revenue: number;
  highTicketBuyers: number;
  details: { masked: string; revenue: number; product: string }[];
};

export async function lmEmails(): Promise<Set<string>> {
  const sec = process.env.KIT_API_SECRET || "";
  const fid = process.env.KIT_LM_FORM_ID || "";
  const out = new Set<string>();
  if (!sec || !fid) return out;
  for (let page = 1; page <= 30; page++) {
    const res = await fetch(`https://api.convertkit.com/v3/forms/${fid}/subscriptions?api_secret=${sec}&page=${page}`, { next: { revalidate: 3600 } });
    if (!res.ok) break;
    const d = await res.json();
    for (const s of (d.subscriptions ?? []) as { subscriber?: { email_address?: string } }[]) {
      const em = s.subscriber?.email_address;
      if (em) out.add(em.trim().toLowerCase());
    }
    if (page >= (d.total_pages ?? 1)) break;
  }
  return out;
}

export async function attributeClosesToLm(htMems: string[]): Promise<{ htFromLm: number } | null> {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const lm = await lmEmails();
  if (lm.size === 0) return { htFromLm: 0 };

  const resolve = async (mems: string[]): Promise<number> => {
    const uniq = [...new Set(mems)];
    let hits = 0;
    for (let i = 0; i < uniq.length; i += 12) {
      const batch = uniq.slice(i, i + 12);
      const res = await Promise.all(batch.map((m) => fetch(`https://api.whop.com/api/v2/memberships/${m}`, { headers, next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      for (const d of res) {
        const e = d?.email ? String(d.email).trim().toLowerCase() : "";
        if (e && lm.has(e)) hits++;
      }
    }
    return hits;
  };

  const htFromLm = await resolve(htMems);
  return { htFromLm };
}

export async function fetchLmRoi(days: number): Promise<LeadMagnetRoi | null> {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const wget = async (u: string) => {
    const r = await fetch(u, { headers, next: { revalidate: 3600 } });
    return r.ok ? r.json() : null;
  };

  const lmEmailSet = await lmEmails();
  if (lmEmailSet.size === 0) return null;

  const cutoff = Math.floor(Date.now() / 1000) - days * 86_400;
  type Pay = { status?: string; final_amount?: number; paid_at?: number; created_at?: number; membership?: string; product?: string };
  const pays: { mem: string; amt: number; funnel: string; product: string }[] = [];
  for (let pg = 1; pg <= 80; pg++) {
    const d = await wget(`https://api.whop.com/api/v2/payments?page=${pg}&per=50`);
    const items: Pay[] = d?.data ?? [];
    if (items.length === 0) break;
    for (const p of items) {
      const ts = p.paid_at ?? p.created_at ?? 0;
      if (ts >= cutoff && p.status === "paid" && (p.final_amount ?? 0) > 0 && p.membership) {
        const pid = typeof p.product === "string" ? p.product : "";
        const name = pid || "other";
        pays.push({ mem: p.membership, amt: p.final_amount ?? 0, funnel: FUNNEL(name), product: name });
      }
    }
    if (Math.min(...items.map((p) => p.paid_at ?? p.created_at ?? 0)) < cutoff - 15 * 86_400) break;
  }

  const memIds = [...new Set(pays.map((p) => p.mem))].slice(0, 400);
  const memEmail: Record<string, string> = {};
  for (let i = 0; i < memIds.length; i += 12) {
    const batch = memIds.slice(i, i + 12);
    const res = await Promise.all(batch.map((m) => wget(`https://api.whop.com/api/v2/memberships/${m}`).catch(() => null)));
    res.forEach((d, j) => { if (d?.email) memEmail[batch[j]] = String(d.email).trim().toLowerCase(); });
  }

  const buyer: Record<string, { revenue: number; product: string; ht: boolean }> = {};
  for (const p of pays) {
    const e = memEmail[p.mem];
    if (!e) continue;
    const b = (buyer[e] ??= { revenue: 0, product: p.product, ht: false });
    b.revenue += p.amt;
    if (p.funnel === "ht") b.ht = true;
    if (p.amt > 0 && p.product !== "other") b.product = p.product;
  }

  const details: LeadMagnetRoi["details"] = [];
  let revenue = 0, highTicketBuyers = 0;
  for (const [email, b] of Object.entries(buyer)) {
    if (!lmEmailSet.has(email)) continue;
    revenue += b.revenue;
    if (b.ht) highTicketBuyers++;
    const [u, dom] = email.split("@");
    details.push({ masked: `${u.slice(0, 3)}***@${dom ?? ""}`, revenue: Math.round(b.revenue), product: b.product });
  }
  details.sort((a, b) => b.revenue - a.revenue);

  return { signups: lmEmailSet.size, buyers: details.length, revenue: Math.round(revenue), highTicketBuyers, details };
}
