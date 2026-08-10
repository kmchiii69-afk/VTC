/* eslint-disable @typescript-eslint/no-explicit-any */
// buildV4 — transforms the live analytics API responses into display values.
// Adapted for Brand Architect: $5K HT funnel + Lead Magnet funnel.

export const C = {
  acid: "#C9A455", blue: "#8FD0FF", purp: "#C9A8FF", amber: "#F59E0B",
  drop: "#F0826D", cyan: "#6FE9FF", bone: "#F2F0E6", ash: "#9AA0AC", dim: "#6B7280",
};

const usd = (n: number) => "$" + Math.round(n || 0).toLocaleString();
const kUsd = (n: number) => (n >= 1000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + Math.round(n || 0));
const int = (n: number) => Math.round(n || 0).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "—");

export function rel(ts: string, now: number): string {
  const t = Date.parse(ts.replace(" ", "T") + (ts.includes("Z") ? "" : "Z"));
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
const deltaStr = (cur: number, prev: number) => {
  if (prev === 0 && cur === 0) return { delta: "—", down: false };
  if (prev === 0) return { delta: "new", down: false };
  const d = Math.round(((cur - prev) / prev) * 100);
  return { delta: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}% vs prior`, down: d < 0 };
};

function buildDirectives(funnel: any) {
  const rev = funnel?.revenue, booking = funnel?.booking, split = funnel?.htSplit, nurture = funnel?.nurture;
  const avgClose = rev && rev.htClose?.count > 0 ? rev.htClose.revenue / rev.htClose.count : 5000;
  const showRate = booking && booking.meetings > 0 ? booking.showed / booking.meetings : null;
  const closeRate = booking && booking.showed > 0 ? (rev?.htClose?.count ?? 0) / booking.showed : 0.35;
  const recs: any[] = [];

  if (booking && booking.meetings >= 3 && showRate !== null && showRate < 0.7) {
    const target = Math.round(booking.meetings * 0.75);
    const extraShows = Math.max(0, target - booking.showed);
    recs.push({
      sev: "HIGH", color: C.drop, node: "call_booked",
      title: "No-shows are eating your closes",
      money: Math.round(extraShows * closeRate * avgClose),
      problem: `${Math.round((1 - showRate) * 100)}% of booked calls no-show or cancel — only ${booking.showed} of ${booking.meetings} actually showed.`,
      fix: "Add SMS + email reminders and a confirm-or-deposit step before the call. Lifting show-rate to 75% is your single biggest lever.",
      metric: `show rate ${Math.round(showRate * 100)}% → 75% target · +${extraShows} shows`,
    });
  }
  if (booking) {
    const notBooked = Math.max(0, (split?.htQualified ?? 0) - booking.booked);
    if (notBooked > 0 && booking.laterBooked === 0) {
      recs.push({
        sev: "HIGH", color: C.drop, node: "call_book",
        title: "Qualified leads who don't book get nothing",
        money: Math.round(notBooked * 0.2 * closeRate * avgClose),
        problem: `${notBooked} qualified leads never grabbed a time — and 0 were recovered by email or setter follow-up.`,
        fix: "Build a 'you qualified but didn’t book' sequence (email + SMS, 4–5 touches over 7 days). Recovering 1 in 5 pays for itself.",
        metric: `${notBooked} lost · 0 recovered today`,
      });
    }
  }
  if (nurture && nurture.enrolled > 50) {
    const cr = pct(nurture.toHt, nurture.enrolled);
    recs.push({
      sev: "MED", color: C.amber, node: "lm_optin", money: 0,
      title: "Your lead magnet barely feeds the $5K funnel",
      problem: `Only ${cr} of ${int(nurture.enrolled)} lead magnet signups cross into the $5K offer, and $0 high-ticket has been traced back to it.`,
      fix: "Rework the first 3 nurture emails to drive the $5K offer application page hard. A free magnet that never graduates buyers is a cost center.",
      metric: `${cr} LM → $5K offer`,
    });
  }
  recs.sort((a, b) => (b.money ?? -1) - (a.money ?? -1));
  recs.forEach((r, i) => (r.rank = i + 1));
  const total = recs.reduce((a, r) => a + (r.money ?? 0), 0);
  return { directives: recs, total };
}

function buildTopology(funnel: any, dirs: any[]) {
  const lm = funnel?.lm ?? [], ht = funnel?.ht ?? [], split = funnel?.htSplit ?? {},
    booking = funnel?.booking ?? {}, rev = funnel?.revenue ?? {}, cross = funnel?.crossover ?? {},
    sources = funnel?.sources ?? [];
  const cnt = (a: any[], i: number) => a[i]?.count ?? 0;
  const traffic = cnt(lm, 0) + cnt(ht, 0);
  const htC = rev.htClose ?? { count: 0, revenue: 0 };
  const top3 = sources.slice(0, 3).map((s: any) => `${(s.source || "").replace(/^www\.|\.com$/g, "").slice(0, 10)} ${int(s.visitors)}`).join(" · ");
  const leak = (node: string) => { const d = dirs.find((x) => x.node === node && x.money > 0); return d ? { text: `${kUsd(d.money)} LEAKING`, sev: "high" } : null; };

  const nodes: any = {
    traffic:     { x: 0.042, y: 0.45,  label: "ALL TRAFFIC", sub: top3 || "all sources", count: traffic, color: "bone", kind: "source" },
    lm_visit:    { x: 0.168, y: 0.250, label: "LM VISIT", sub: "lead magnet page", count: cnt(lm, 0), color: "acid" },
    ht_visit:    { x: 0.168, y: 0.650, label: "$5K VISIT", sub: "offer / apply page", count: cnt(ht, 0), color: "blue" },
    lm_optin:    { x: 0.318, y: 0.215, label: "LM SIGNUP", sub: "email captured", count: cnt(lm, 1), color: "acid", chip: true },
    ht_optin:    { x: 0.318, y: 0.650, label: "APPLICATION", sub: "app started", count: cnt(ht, 1), color: "blue" },
    lm_content:  { x: 0.468, y: 0.170, label: "CONTENT", sub: "accessed lead magnet", count: cnt(lm, 2), color: "acid", kind: "terminal" },
    ht_app:      { x: 0.468, y: 0.650, label: "APP SUBMITTED", sub: "form completed", count: cnt(ht, 2), color: "blue" },
    ht_qualified:{ x: 0.598, y: 0.650, label: "QUALIFIED", sub: "routing gate", count: cnt(ht, 3), color: "blue", kind: "gate" },
    call_book:   { x: 0.718, y: 0.500, label: "/BOOK", sub: `${split.htQualified ?? 0} call-routed`, count: split.bookViewed ?? 0, color: "blue" },
    call_booked: { x: 0.818, y: 0.400, label: "BOOKED", sub: "call on calendar", count: booking.booked ?? 0, color: "blue" },
    call_showed: { x: 0.894, y: 0.310, label: "SHOWED", sub: "attended call", count: booking.showed ?? 0, color: "blue" },
    call_closed: { x: 0.958, y: 0.220, label: "CLOSED", sub: `${kUsd(htC.revenue)} cash`, count: htC.count, color: "acid", kind: "terminal", money: true },
  };
  const e = (from: string, to: string, count: number, extra: any = {}) => ({ from, to, count, ...extra });
  const edges = [
    e("traffic", "lm_visit", cnt(lm, 0)),
    e("traffic", "ht_visit", cnt(ht, 0)),
    e("lm_visit", "lm_optin", cnt(lm, 1), { conv: pct(cnt(lm, 1), cnt(lm, 0)) }),
    e("lm_optin", "lm_content", cnt(lm, 2), { conv: pct(cnt(lm, 2), cnt(lm, 1)) }),
    e("lm_optin", "ht_optin", cross.crossed ?? 0, { cross: true, tag: { text: `LM→$5K · ${pct(cross.crossed ?? 0, cnt(lm, 1))}`, sev: "med" } }),
    e("ht_visit", "ht_optin", Math.max(0, cnt(ht, 1) - (cross.crossed ?? 0)), { conv: pct(cnt(ht, 1), cnt(ht, 0)) }),
    e("ht_optin", "ht_app", cnt(ht, 2), { conv: pct(cnt(ht, 2), cnt(ht, 1)) }),
    e("ht_app", "ht_qualified", cnt(ht, 3), { conv: pct(cnt(ht, 3), cnt(ht, 2)) }),
    e("ht_qualified", "call_book", split.bookViewed ?? 0),
    e("call_book", "call_booked", booking.booked ?? 0, { conv: pct(booking.booked ?? 0, split.bookViewed ?? 0) }),
    e("call_booked", "call_showed", booking.showed ?? 0, { conv: pct(booking.showed ?? 0, booking.booked ?? 0) }),
    e("call_showed", "call_closed", htC.count, { conv: pct(htC.count, booking.showed ?? 0) }),
  ];
  return {
    nodes, edges,
    leakTags: { call_book: leak("call_book"), call_booked: leak("call_booked") },
    stages: [
      { x: 0.168, t: "01 REACH" }, { x: 0.318, t: "02 CAPTURE" }, { x: 0.468, t: "03 INTENT" },
      { x: 0.598, t: "04 QUALIFY" }, { x: 0.718, t: "05 BOOK" }, { x: 0.818, t: "06 CALL" }, { x: 0.958, t: "07 CLOSE" },
    ],
    brokerChip: "",
  };
}

export const EVENT_TYPES: any = {
  booked_call:    { color: C.acid, glyph: "★", label: "BOOKED A CALL", sub: "call scheduled", stage: "call_booked" },
  book_view:      { color: C.blue, glyph: "▥", label: "Viewed booking page", sub: "on the calendar", stage: "call_book" },
  ht_qualified:   { color: C.blue, glyph: "▶", label: "$5K QUALIFIED", sub: "routed to book a call", stage: "ht_qualified" },
  app_submitted:  { color: C.blue, glyph: "▣", label: "Application submitted", sub: "completed the form", stage: "ht_app" },
  app_started:    { color: C.blue, glyph: "◆", label: "Application started", sub: "entered the $5K funnel", stage: "ht_optin" },
  lm_content:     { color: C.acid, glyph: "◇", label: "Accessed lead magnet", sub: "free funnel", stage: "lm_content" },
  lm_optin:       { color: C.acid, glyph: "◈", label: "Lead magnet signup", sub: "new lead", stage: "lm_optin" },
  callback:       { color: C.purp, glyph: "◑", label: "Requested a callback", sub: "didn't self-book", stage: "call_book" },
};

export function mapLiveEvent(e: any): string {
  switch (e.event) {
    case "call_booked":            return "booked_call";
    case "book_page_viewed":       return "book_view";
    case "qualify_form_submitted": return "ht_qualified";
    case "application_submitted":  return "app_submitted";
    case "application_started":    return "app_started";
    case "lm_content_viewed":      return "lm_content";
    case "lm_submitted":           return "lm_optin";
    case "book_fallback_requested":return "callback";
    default:                       return "app_started";
  }
}

const SEEDS = {
  PIVOT: [
    { color: C.purp, title: "Brand positioning drives everything", text: "Coaches who are key-man risks can't scale. Brand Architect removes that ceiling — the positioning work done in Phase 1 is the foundation every subsequent piece relies on." },
    { color: C.acid, title: "High-ticket is the right model", text: "One Brand Architect client at $5K–$18K outearns ten low-ticket sales. The focus is getting the right clients in, not volume." },
    { color: C.amber, title: "High-ticket is lumpy by nature", text: "A handful of $5K–$18K closes = inherent month-to-month swing. The fix isn't a steadier price — it's more qualified volume in the pipeline." },
    { color: C.blue, title: "Long trust cycle = content is everything", text: "Nobody pays $5K cold. The warm-up engine (lead magnet → email → offer page) is mission-critical. Build it tight." },
    { color: C.acid, title: "Revenue tracks content reach almost 1:1", text: "More qualified eyes on your content = more qualified applications. The growth lever is top-of-funnel volume, not conversion tweaks." },
    { color: C.drop, title: "Application quality > application volume", text: "A well-qualified lead that shows up is worth more than five unqualified ones. Tighten the qualification survey first." },
  ],
  ROI: {
    flow: [
      { v: "0", label: "Lead magnet signups", sub: "entered the funnel" },
      { v: "0", label: "Ever purchased anything", sub: "tracked by email" },
      { v: "0", label: "Purchased $5K+ offer", sub: "high-ticket closes", drop: true },
      { v: "$0", label: "Total revenue produced", sub: "all-time", money: true },
    ],
    verdict: "Set up KIT_LM_FORM_ID and WHOP_API_KEY to see lead magnet ROI — which LM signups eventually become $5K clients.",
    buyers: [],
    method: "Matched: LM email subscribers (Kit) ∩ paid Whop buyers (by membership email). A lower bound.",
  },
  TREND: { months: [], values: [], deltas: [], note: "Connect WHOP_API_KEY to see revenue trend data." },
  LEGACY: [
    { label: "Active Members", value: "—", sub: "connect Whop", color: C.acid },
    { label: "Subscriptions", value: "—", sub: "all-time", color: C.purp },
    { label: "MRR", value: "—", sub: "trailing month", color: C.bone },
    { label: "Offer Tier", value: "$5K–$18K", sub: "DWY · DFY · Backend", color: C.blue, small: true },
  ],
  WEEKLY: { labels: [], lines: [
    { name: "Page views", color: C.ash, values: [], scale: "main" },
    { name: "LM leads", color: C.acid, values: [], scale: "sub" },
    { name: "Qualified", color: C.blue, values: [], scale: "sub" },
  ], note: "Connect POSTHOG_PROJECT_ID to see weekly lead and reach data." },
  ATTRIB: {
    tiles: [
      { label: "Tracked revenue", value: "—", sub: "connect SegMetrics", color: C.acid, money: true },
      { label: "Leads", value: "—", sub: "set SEGMETRICS_API_KEY", color: C.bone },
      { label: "Lead value", value: "—", sub: "avg $ per lead", color: C.blue },
      { label: "Days to purchase", value: "—", sub: "lead → sale, avg", color: C.amber },
    ],
    channels: [], first: [], last: [], campaigns: [],
    pattern: "Set SEGMETRICS_ACCOUNT_ID and SEGMETRICS_API_KEY to see first-touch vs last-touch attribution breakdown.",
  },
  CRM: {
    members: [
      { label: "Active Members", value: "—", sub: "connect Whop", color: C.acid },
      { label: "Email Subscribers", value: "—", sub: "connect Kit", color: C.blue },
      { label: "Demo Booked", value: "—", sub: "from Close/GHL", color: C.bone },
      { label: "Closed Won", value: "—", sub: "from Close/GHL", color: C.drop },
    ],
    rates: [["Connection Rate", "—", "—"], ["Booking Rate", "—", "—"], ["Show Rate", "—", "—"], ["Close Rate", "—", "—"]],
    buckets: [["Short-Term FU", "0", "Closes within 7 days"], ["Long-Term FU", "0", "Longer nurture"], ["Deposit", "0", "Partial payment in"], ["Lost / DQ'd", "0", "All disqualified"]],
    booked: [["Total Booked", "0"], ["Active", "0"], ["Canceled", "0"], ["Cancel Rate", "0%"]],
    pipeline: [],
  },
};

function liveTrend(t: any) {
  const m = t.monthly || [];
  if (m.length < 2) return SEEDS.TREND;
  const nowYM = new Date().toISOString().slice(0, 7);
  return {
    months: m.map((x: any) => x.month.slice(2) + (x.month === nowYM ? "*" : "")),
    values: m.map((x: any) => Math.round((x.total || 0) / 1000)),
    deltas: m.map((x: any, i: number) => {
      if (i === 0 || x.month === nowYM) return null;
      const prev = m[i - 1].total;
      return prev > 0 ? `${x.total >= prev ? "+" : ""}${Math.round(((x.total - prev) / prev) * 100)}%` : null;
    }),
    note: "Revenue from Whop. * current month is partial.",
  };
}
function liveLegacy(t: any) {
  const mem = t.memberships || { active: 0, canceled: 0, expired: 0, completed: 0 };
  if (!mem.active && !mem.canceled && !mem.expired && !mem.completed) return SEEDS.LEGACY;
  const m = t.monthly || [];
  const nowYM = new Date().toISOString().slice(0, 7);
  const recNow = m.length ? (m[m.length - 1].month === nowYM ? (m[m.length - 2]?.recurring ?? 0) : m[m.length - 1].recurring) : 0;
  return [
    { label: "Active Members", value: int(mem.active), sub: "active on Whop", color: C.acid },
    { label: "Ended", value: int(mem.canceled + mem.expired + mem.completed), sub: "canceled / expired", color: C.purp },
    { label: "Recurring now", value: usd(recNow), sub: "trailing month", color: C.bone },
    { label: "Offer Tier", value: "$5K–$18K", sub: "DWY · DFY · Backend", color: C.blue, small: true },
  ];
}
function liveWeekly(t: any) {
  const w = (t.weekly || []).slice(-8);
  if (w.length < 2) return SEEDS.WEEKLY;
  return {
    labels: w.map((x: any) => x.week.slice(5)),
    lines: [
      { name: "Page views", color: C.ash, values: w.map((x: any) => x.views), scale: "main" },
      { name: "LM leads", color: C.acid, values: w.map((x: any) => x.lm), scale: "sub" },
      { name: "Qualified", color: C.blue, values: w.map((x: any) => x.qualified), scale: "sub" },
    ],
    note: "Top-of-funnel momentum, week over week.",
  };
}
function liveAttrib(t: any) {
  const a = t.attribution;
  if (!a) return SEEDS.ATTRIB;
  const CH: Record<string, string> = { email: C.blue, social: C.purp, direct: C.acid, search: C.amber, referral: C.drop };
  return {
    tiles: [
      { label: "Tracked revenue", value: usd(a.revenue), sub: `${a.customers} customers`, color: C.acid, money: true },
      { label: "Leads", value: int(a.totalLeads), sub: `${a.convRate}% convert`, color: C.bone },
      { label: "Lead value", value: usd(a.leadValue), sub: "avg $ per lead", color: C.blue },
      { label: "Days to purchase", value: a.daysUntilPurchase > 0 ? `${a.daysUntilPurchase}d` : "—", sub: "lead → sale, avg", color: C.amber },
    ],
    channels: (a.byChannel || []).map((c: any) => [c.channel, CH[c.channel] || C.dim, int(c.leads), int(c.customers), `${(c.conversionRate ?? 0).toFixed(1)}%`, usd(c.revenue), usd(c.leadValue)]),
    first: (a.firstTouch || []).map((x: any) => [x.channel, x.leads, CH[x.channel] || C.dim]),
    last: (a.lastTouch || []).map((x: any) => [x.channel, x.revenue, CH[x.channel] || C.dim]),
    campaigns: (a.topCampaigns || []).map((c: any) => [c.campaign, c.leads]),
    pattern: SEEDS.ATTRIB.pattern,
  };
}
function liveRoi(t: any) {
  const fc = t.lmRoi;
  if (!fc) return SEEDS.ROI;
  const buyRate = fc.signups > 0 ? (Math.round((fc.buyers / fc.signups) * 1000) / 10) : 0;
  return {
    flow: [
      { v: int(fc.signups), label: "Lead magnet signups", sub: "entered the funnel" },
      { v: int(fc.buyers), label: "Ever purchased anything", sub: `${buyRate}% buy rate` },
      { v: int(fc.highTicketBuyers), label: "Purchased $5K+ offer", sub: "high-ticket closes", drop: fc.highTicketBuyers === 0 },
      { v: usd(fc.revenue), label: "Total revenue produced", sub: "all-time", money: true },
    ],
    verdict: fc.highTicketBuyers === 0
      ? `The lead magnet has produced $0 in high-ticket and ${usd(fc.revenue)} total. Out of ${int(fc.signups)} signups, ${fc.buyers} bought. Your #1 lead magnet is not converting to $5K closes yet — fix the nurture sequence.`
      : `The lead magnet produced ${usd(fc.revenue)} from ${fc.buyers} buyers (${fc.highTicketBuyers} high-ticket). Matched by email — same-email purchases only.`,
    buyers: (fc.details || []).slice(0, 3).map((d: any) => `${d.masked} · ${usd(d.revenue)} · ${d.product}`),
    method: "Matched: LM email subscribers (Kit) ∩ paid Whop buyers (by membership email), last 120 days. A lower bound.",
  };
}
function liveCrm(data: any) {
  if (!data) return SEEDS.CRM;
  const s = data.close?.byStatus ?? {};
  const g = (k: string) => s[k] ?? 0;
  const closed = g("Closed"), deposit = g("Deposit");
  const setterCalled = g("Setter Called"), setterConn = g("Setter Connected"), demoBooked = g("Demo Booked");
  const noShow = g("No Show"), callCanceled = g("Call Canceled"), noPickup = g("No pickup");
  const showed = Math.max(0, demoBooked - noShow - callCanceled);
  const lost = g("DQ") + g("Not Financially Qualified") + g("Bad Fit") + g("DNC (do not contact)") + noShow + callCanceled + g("Bad Data");
  const pv = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "—");
  const cal = data.calendly ?? { total: 0, active: 0, canceled: 0 };
  const WIN = ["Closed", "Deposit"], LOSS = ["DQ", "Not Financially Qualified", "Bad Fit", "DNC (do not contact)", "No Show", "Call Canceled", "Bad Data"], ACT = ["Potential", "Booked", "Qualified", "Short Term Follow Up (7-days Till Close)", "Long Term Follow Up", "Rescheduling", "Demo Booked", "Waitlist Lead"];
  const barColor = (l: string) => WIN.includes(l) ? C.acid : LOSS.includes(l) ? C.drop : ACT.includes(l) ? C.blue : l.startsWith("Setter") ? C.purp : C.dim;
  const pipeline = Object.entries(s).filter(([, v]: any) => v > 0).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10).map(([l, v]: any) => [l, v, barColor(l)]);
  return {
    members: [
      { label: "Active Members", value: int(data.whop?.totalActive ?? 0), sub: "active on Whop", color: C.acid },
      { label: "Email Subscribers", value: int(data.kit?.totalSubscribers ?? 0), sub: data.kit?.newSubscribers ? `+${int(data.kit.newSubscribers)} new in 30d` : "total on Kit", color: C.blue },
      { label: "Demo Booked", value: int(demoBooked), sub: "last 30 days · from CRM", color: C.bone },
      { label: "Closed Won", value: int(closed + deposit), sub: "CRM status", color: closed + deposit > 0 ? C.acid : C.drop },
    ],
    rates: [
      ["Connection Rate", `${int(setterCalled)} called → ${int(setterConn)} connected`, pv(setterConn, setterCalled)],
      ["Booking Rate", `${int(setterConn)} connected → ${int(demoBooked)} booked`, pv(demoBooked, setterConn)],
      ["No Pickups", "Setter called · no answer", int(noPickup)],
      ["Show Rate", `${int(demoBooked)} booked → ${int(showed)} showed`, pv(showed, demoBooked)],
      ["Close Rate", `${int(showed)} showed → ${int(closed)} closed`, pv(closed, showed)],
      ["No Shows", "Booked · didn't appear", int(noShow)],
    ],
    buckets: [
      ["Short-Term FU", int(g("Short Term Follow Up (7-days Till Close)")), "Closes within 7 days"],
      ["Long-Term FU", int(g("Long Term Follow Up")), "Longer nurture"],
      ["Deposit", int(deposit), "Partial payment in"],
      ["Lost / DQ'd", int(lost), "All disqualified"],
    ],
    booked: [["Total Booked", int(cal.total)], ["Active", int(cal.active)], ["Canceled", int(cal.canceled)], ["Cancel Rate", pv(cal.canceled, cal.total)]],
    pipeline,
  };
}

export type V4 = ReturnType<typeof buildV4>;

export function buildV4(funnel: any, morning: any, trends: any = null, data: any = null) {
  const { directives, total } = buildDirectives(funnel);
  const rev = funnel?.revenue ?? {};
  const split = funnel?.htSplit ?? {};
  const booking = funnel?.booking ?? {};
  const daily = funnel?.daily ?? [];
  const team = funnel?.team ?? [];
  const sources = funnel?.sources ?? [];
  const nurture = funnel?.nurture ?? {};
  const lm = funnel?.lm ?? [];
  const ht = funnel?.ht ?? [];
  const cross = funnel?.crossover ?? {};
  const newLeads = daily.reduce((a: number, d: any) => a + d.lm + d.ht, 0);
  const dials = team.reduce((a: number, t: any) => a + t.calls, 0);
  const convo = team.reduce((a: number, t: any) => a + t.answered, 0);
  const htC = rev.htClose ?? { count: 0, revenue: 0 };

  const m = morning?.current ?? {};
  const p = morning?.previous ?? {};
  const mr = morning?.revenue ?? { net: 0, count: 0, highTicket: 0, highTicketRev: 0 };
  const mLeads = (m.lm_signups ?? 0) + (m.ht_leads ?? 0), pLeads = (p.lm_signups ?? 0) + (p.ht_leads ?? 0);
  const MORNING = {
    meta: `the 5am report · prior ${morning?.windowHours ?? 24}h (yesterday)`,
    current: m, previous: p,
    tiles: [
      { label: "Revenue collected", value: usd(mr.net), sub: `${mr.count} payments`, color: C.acid, money: true },
      { label: "High-ticket closes", value: String(mr.highTicket), sub: `${usd(mr.highTicketRev)} this window`, color: C.bone },
      { label: "New leads", value: int(mLeads), sub: "LM + $5K", ...deltaStr(mLeads, pLeads), color: C.bone },
      { label: "LM signups", value: int(m.lm_signups ?? 0), sub: "lead magnet", ...deltaStr(m.lm_signups ?? 0, p.lm_signups ?? 0), color: C.bone },
      { label: "$5K applications", value: int(m.ht_leads ?? 0), sub: "$5K offer funnel", ...deltaStr(m.ht_leads ?? 0, p.ht_leads ?? 0), color: C.blue },
      { label: "Qualified", value: int(m.qualified ?? 0), sub: "routed to call", ...deltaStr(m.qualified ?? 0, p.qualified ?? 0), color: C.bone },
      { label: "Calls booked", value: int(m.booked ?? 0), sub: (m.callbacks ?? 0) > 0 ? `${m.callbacks} callback req` : "calls", ...deltaStr(m.booked ?? 0, p.booked ?? 0), color: C.blue },
      { label: "Crossover", value: int(m.crossover ?? 0), sub: "LM → $5K funnel", ...deltaStr(m.crossover ?? 0, p.crossover ?? 0), color: C.amber },
    ],
    flow: [[int(m.visitors ?? 0), "visitors"], [int(mLeads), "leads"], [int(m.apps_started ?? 0), "applied"], [int(m.qualified ?? 0), "qualified"], [int(m.booked ?? 0), "booked"], [String(mr.highTicket), "closed"]],
  };

  const tod = (() => { const h = new Date().getHours(); return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"; })();
  const briefing = `Good ${tod}. Yesterday: ${int(m.visitors ?? 0)} visitors, ${int(mLeads)} new leads, ${int(m.qualified ?? 0)} qualified, and ${m.booked ?? 0} ${(m.booked ?? 0) === 1 ? "call" : "calls"} booked. ${usd(mr.net)} collected${mr.highTicket > 0 ? `, ${mr.highTicket} high-ticket close.` : ", no high-ticket close."}`;
  const myRead: any[] = [];
  if ((m.visitors ?? 0) > 0) { const r = Math.round(mLeads / m.visitors * 100); myRead.push({ color: r >= 10 ? C.acid : C.amber, text: `Opt-in is ${r}% of ${int(m.visitors)} visitors — ${r >= 10 ? "healthy. Keep the top of funnel fed." : "the hook or landing page is leaking."}` }); }
  if (mLeads > 0) { const r = Math.round((m.qualified ?? 0) / mLeads * 100); myRead.push({ color: r >= 30 ? C.acid : C.amber, text: `${m.qualified ?? 0} of ${mLeads} leads qualified (${r}%) — ${r >= 30 ? "the survey is filtering well." : "watch traffic quality or survey tightness."}` }); }
  if ((m.booked ?? 0) > 0 && mr.highTicket === 0) myRead.push({ color: C.drop, text: `${m.booked} calls booked but zero closed. Today's money is on those calls showing and closing.` });
  if (!myRead.length) myRead.push({ color: C.amber, text: "Quiet window. Reach drives everything here — let's get more qualified eyes on the offer." });

  const d0 = directives[0], d1 = directives[1];
  const JARVIS = {
    briefing, myRead,
    qa: [
      { q: "what should i fix", a: d0 ? `${d0.title}. ${d0.problem} ${d0.fix}${d0.money > 0 ? ` That's ~${usd(d0.money)} back.` : ""}${d1 && d1.money > 0 ? ` Then: ${d1.title.toLowerCase()} — ~${usd(d1.money)}.` : ""}` : "The funnel looks clean right now — keep feeding the top." },
      { q: "how's the booking path", a: `${int(split.htQualified ?? 0)} qualified, ${split.bookViewed ?? 0} landed on /book, ${booking.booked ?? 0} booked — ${pct(booking.booked ?? 0, split.bookViewed ?? 0)} book rate. Show rate: ${pct(booking.showed ?? 0, booking.booked ?? 0)}, close rate: ${pct(htC.count, booking.showed ?? 0)}.` },
      { q: "where did leads come from", a: sources.slice(0, 3).map((s: any) => `${(s.source || "").replace(/^www\.|\.com$/g, "")}: ${int(s.visitors)} visitors, ${int(s.lmSignups)} LM signups`).join(". ") + "." },
      { q: "how much on the table", a: total > 0 ? `~${usd(total)} across the top leaks — ${directives.filter((x: any) => x.money > 0).map((x: any) => `${usd(x.money)} (${x.title.toLowerCase()})`).join(" and ")}.` : "No major leaks detected right now." },
      { q: "is it working", a: htC.count > 0 ? `Yes — ${htC.count} $5K+ close${htC.count > 1 ? "s" : ""} worth ${usd(htC.revenue)}. Keep feeding qualified traffic into the top. The LM → $5K crossover is your growth lever.` : "Not yet closing. Focus on getting qualified applications in and showing up rate high." },
    ],
    fallback: "I read the funnel, not the future. Ask what to fix, how the booking path is doing, or where leads came from.",
  };

  const SCOREBOARD = [
    { label: "Net revenue", value: rev.net ?? 0, fmt: "usd", sub: `${rev.count ?? 0} payments`, color: C.acid, money: true },
    { label: "One-time cash", value: rev.oneTime?.revenue ?? 0, fmt: "usd", sub: `${rev.oneTime?.count ?? 0} new sales`, color: C.bone },
    { label: "Recurring", value: rev.recurring?.revenue ?? 0, fmt: "usd", sub: `${rev.recurring?.count ?? 0} renewals`, color: C.purp },
    { label: "New leads", value: newLeads, fmt: "int", sub: "LM + $5K offer", color: C.blue },
    { label: "Dials", value: dials, fmt: "int", sub: `${int(convo)} conversations`, color: C.bone },
    { label: "HT closes", value: htC.count, fmt: "int", sub: usd(htC.revenue), color: C.acid, money: true },
  ];

  const gauge = (id: string, label: string, value: number, target: number, color: string, basis: string) => ({ id, label, value, target, color, unit: "%", basis });
  const showRate = booking.meetings > 0 ? Math.round(booking.showed / booking.meetings * 100) : 0;
  const GAUGES = [
    gauge("ht_optin", "HT APP RATE", ht[0]?.count ? Math.round((ht[1]?.count ?? 0) / ht[0].count * 100) : 0, 20, C.blue, `${int(ht[1]?.count ?? 0)} of ${int(ht[0]?.count ?? 0)} visits`),
    gauge("lm_signup", "LM SIGNUP", lm[0]?.count ? Math.round((lm[1]?.count ?? 0) / lm[0].count * 100) : 0, 30, C.acid, `${int(lm[1]?.count ?? 0)} of ${int(lm[0]?.count ?? 0)} visits`),
    gauge("qual", "APP → QUALIFIED", ht[2]?.count ? Math.round((ht[3]?.count ?? 0) / ht[2].count * 100) : 0, 60, C.blue, `${int(ht[3]?.count ?? 0)} of ${int(ht[2]?.count ?? 0)} submitted`),
    gauge("show", "SHOW RATE", showRate, 75, showRate < 60 ? C.drop : C.acid, `${booking.showed ?? 0} showed · ${booking.canceled ?? 0} canceled`),
    gauge("close", "CLOSE ON SHOWS", booking.showed > 0 ? Math.round(htC.count / booking.showed * 100) : 0, 35, C.acid, `${htC.count} closed of ${booking.showed ?? 0} shown`),
    gauge("cross", "LM → $5K", lm[1]?.count ? Math.round((cross.crossed ?? 0) / lm[1].count * 100) : 0, 15, C.drop, `${cross.crossed ?? 0} of ${int(lm[1]?.count ?? 0)} LM signups`),
  ];

  const DAILY = { total: newLeads, days: daily.map((d: any) => (d.date || "").slice(5)), series: daily.map((d: any) => ({ lm: d.lm, ht: d.ht })) };

  const REVENUE = {
    cards: [
      { label: "HT closes (≥$5K)", value: usd(htC.revenue), sub: `${htC.count} full high-ticket closes`, color: C.blue },
      { label: "HT partials + recurring", value: usd((rev.htPartial?.revenue ?? 0) + (rev.htRecurring?.revenue ?? 0)), sub: `${rev.htPartial?.count ?? 0} deposit/downsell · ${rev.htRecurring?.count ?? 0} plan installments`, color: C.bone },
      { label: "One-time", value: usd(rev.oneTime?.revenue ?? 0), sub: `${rev.oneTime?.count ?? 0} sales`, color: C.acid },
      { label: "Recurring", value: usd(rev.recurring?.revenue ?? 0), sub: `${rev.recurring?.count ?? 0} monthly subs`, color: C.purp },
    ],
    note: `Total HT revenue is ${usd(rev.htClose?.revenue ?? 0 + (rev.htPartial?.revenue ?? 0) + (rev.htRecurring?.revenue ?? 0))}, but only ${htC.count} are full high-ticket closes (≥$${(process.env.WHOP_HT_CLOSE_THRESHOLD || 5000).toLocaleString()} one-time). The rest are deposits/downsells + payment-plan installments.`,
    products: (rev.segments ?? []).map((s: any) => [s.product, s.kind, usd(s.price), usd(s.revenue), s.count]),
    footer: `Gross ${usd(rev.gross ?? 0)} · net of refunds ${usd(rev.net ?? 0)}.`,
  };

  const stepLm = [
    { label: "Visited lead magnet page", count: lm[0]?.count ?? 0 },
    { label: "Signed up (email captured)", count: lm[1]?.count ?? 0, conv: `${pct(lm[1]?.count ?? 0, lm[0]?.count ?? 0)} continued`, dropped: `${int((lm[0]?.count ?? 0) - (lm[1]?.count ?? 0))} dropped` },
    { label: "Accessed content", count: lm[2]?.count ?? 0, conv: `${pct(lm[2]?.count ?? 0, lm[1]?.count ?? 0)} continued` },
  ];
  const stepHt = [
    { label: "Visited $5K offer page", count: ht[0]?.count ?? 0 },
    { label: "Started application", count: ht[1]?.count ?? 0, conv: `${pct(ht[1]?.count ?? 0, ht[0]?.count ?? 0)} continued`, dropped: `${int((ht[0]?.count ?? 0) - (ht[1]?.count ?? 0))} dropped` },
    { label: "Submitted application", count: ht[2]?.count ?? 0, conv: `${pct(ht[2]?.count ?? 0, ht[1]?.count ?? 0)} continued`, dropped: `${int((ht[1]?.count ?? 0) - (ht[2]?.count ?? 0))} dropped` },
    { label: "Qualified", count: ht[3]?.count ?? 0, conv: `${pct(ht[3]?.count ?? 0, ht[2]?.count ?? 0)} continued` },
  ];

  const CROSSOVER = { big: int(cross.crossed ?? 0), text: `${pct(cross.crossed ?? 0, lm[1]?.count ?? 0)} of LM signups crossed into the $5K funnel.`, sub: "Warm them up, then graduate them. ↓" };

  const BOOKING = {
    flow: [
      { v: int(split.htQualified ?? 0), label: "Qualified" }, { conv: pct(split.bookViewed ?? 0, split.htQualified ?? 0) },
      { v: int(split.bookViewed ?? 0), label: "Landed on /book" }, { conv: pct(booking.booked ?? 0, split.bookViewed ?? 0) },
      { v: int(booking.booked ?? 0), label: "Booked a call" }, { conv: pct(booking.showed ?? 0, booking.booked ?? 0) },
      { v: int(booking.showed ?? 0), label: "Showed up" }, { conv: pct(htC.count, booking.showed ?? 0) },
      { v: String(htC.count), label: "Closed", money: usd(htC.revenue) },
    ],
    splits: [
      { label: "How they booked", parts: [[int(booking.immediateBooked ?? 0), "immediate", C.acid], [int(booking.setterRescued ?? 0), "setter", C.blue], [int(booking.laterBooked ?? 0), "email/later", C.drop]] },
      { label: "Show rate", big: `${showRate}%`, color: showRate < 60 ? C.amber : C.acid, sub: `${booking.showed ?? 0} showed · ${booking.canceled ?? 0} canceled` },
      { label: "Close rate (on shows)", big: pct(htC.count, booking.showed ?? 0), color: C.acid, sub: `${htC.count} closed of ${booking.showed ?? 0} shown` },
    ],
    alert: `The email booking-rescue is ${(booking.laterBooked ?? 0) === 0 ? "dead (0)" : "weak"}: people book immediately on the page (${booking.immediateBooked ?? 0}) or because the setter dialed them (${booking.setterRescued ?? 0}). A qualified lead who doesn't book on the spot and isn't caught by the setter is just lost. A "you didn't book" email sequence is open money.`,
    method: "3-way split from CRM status-change history: immediate = booked ≤24h of qualifying, no setter · setter = Setter Connected before Demo Booked · email/later = booked >24h later with no setter touch.",
  };

  const closerNames = new Set(["Closer", "Head Closer"]);
  const closer = team.find((t: any) => closerNames.has(t.name)) || team[0];
  const setters = team.filter((t: any) => t.name !== "Unknown" && !closerNames.has(t.name));
  const fmtTalk = (min: number) => { const h = Math.floor(min / 60); const m2 = Math.round(min % 60); return h > 0 ? `${h}h ${m2}m` : `${m2}m`; };
  const TEAM = {
    closer: { name: closer?.name ?? "Closer", role: "CLOSER", sub: `${closer?.calls ?? 0} dials logged`, closes: htC.count, revenue: usd(htC.revenue) },
    setters: setters.map((s: any) => [s.name, int(s.calls), int(s.answered), `${s.connectPct ?? 0}%`, fmtTalk(s.talkMin ?? 0)]),
  };

  const NURTURE = {
    flow: [
      { v: int(nurture.enrolled ?? 0), label: "LM signups", sub: "entered the nurture" },
      { v: int(nurture.toHt ?? 0), label: "→ $5K application", sub: `${pct(nurture.toHt ?? 0, nurture.enrolled ?? 0)} converted` },
      { v: int(nurture.toQualified ?? 0), label: "→ Qualified", sub: `${pct(nurture.toQualified ?? 0, nurture.enrolled ?? 0)} of signups` },
      { v: `${nurture.avgDays ?? 0}d`, label: "Avg time to convert", sub: `${nurture.within7 ?? 0}% within 7 days` },
    ],
    warn: "The end-to-end graduation rate undersells a deliberate slow warm. The real fuel gauge is email click-through into the application page.",
    sequences: (funnel?.sequences ?? []).map((s: any) => [s.name, s.funnel, int(s.enrolled)]),
    broadcasts: (funnel?.broadcasts ?? []).map((b: any) => [b.subject, b.date, int(b.recipients), `${Math.round(b.openRate)}%`, `${(b.clickRate ?? 0).toFixed(1)}%`, int(b.clicks)]),
  };

  const SOURCES = sources.map((s: any) => [s.source, int(s.visitors), int(s.lmSignups), int(s.surveys)]);

  return {
    C, MORNING, JARVIS, DIRECTIVES: directives, DIRECTIVES_TOTAL: `~${usd(total)} more every ${funnel?.period ?? 30} days`,
    SCOREBOARD, TOPOLOGY: buildTopology(funnel, directives), GAUGES, DAILY, REVENUE,
    LM_FUNNEL: stepLm, HT_FUNNEL: stepHt, CROSSOVER, BOOKING, TEAM, NURTURE, SOURCES,
    EVENT_TYPES,
    PIVOT: SEEDS.PIVOT,
    ROI: trends ? liveRoi(trends) : SEEDS.ROI,
    TREND: trends ? liveTrend(trends) : SEEDS.TREND,
    LEGACY: trends ? liveLegacy(trends) : SEEDS.LEGACY,
    WEEKLY: trends ? liveWeekly(trends) : SEEDS.WEEKLY,
    ATTRIB: trends ? liveAttrib(trends) : SEEDS.ATTRIB,
    CRM: data ? liveCrm(data) : SEEDS.CRM,
  };
}
