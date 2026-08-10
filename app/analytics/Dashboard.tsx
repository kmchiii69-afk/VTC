"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildV4, mapLiveEvent, EVENT_TYPES, C } from "./jarvis/map";
import { FunnelHero } from "./jarvis/Hero";
import { JarvisPanel } from "./jarvis/Hud";
import {
  BAMark, SecHead, NoteBox, TileGrid, Scoreboard, FlowStrip, StepBars, DataTable,
  HBars, StackedBars, TrendBars, WeeklyLines, ArcGauge, Directives, Telemetry,
} from "./jarvis/ui";

let _eid = 1;

function since5am(): string {
  const now = new Date();
  const five = new Date(now);
  five.setHours(5, 0, 0, 0);
  if (now.getTime() < five.getTime()) five.setDate(five.getDate() - 1);
  return five.toISOString();
}
function Sec({ id, children }: { id: string; children: React.ReactNode }) {
  return <section className="v4-sec" data-screen-label={id}>{children}</section>;
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<any>(null);
  const [morning, setMorning] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");
  const [feed, setFeed] = useState<any[]>([]);
  const [feedNow, setFeedNow] = useState(0);
  const [energy, setEnergy] = useState(0);
  const engineRef = useRef<any>(null);
  const latestTs = useRef<string | null>(null);
  const firedTs = useRef<string>("");
  const reqSeq = useRef(0);
  const router = useRouter();
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const load = useCallback(async (d: number) => {
    const seq = ++reqSeq.current;
    setLoading(true); setError("");
    try {
      const [fr, mr] = await Promise.all([
        fetch(`/api/analytics/funnel?days=${d}`, { cache: "no-store" }),
        fetch(`/api/analytics/morning?end=${encodeURIComponent(since5am())}`, { cache: "no-store" }),
      ]);
      if (fr.status === 401) { router.refresh(); return; }
      if (!fr.ok) throw new Error(String(fr.status));
      const fj = await fr.json();
      const mj = mr.ok ? await mr.json() : null;
      if (seq !== reqSeq.current) return;
      setFunnel(fj);
      if (mj) setMorning(mj);
    } catch { if (seq === reqSeq.current) setError("Failed to load data."); }
    finally { if (seq === reqSeq.current) setLoading(false); }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) load(days); });
    return () => { cancelled = true; };
  }, [days, load]);

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    t(); const id = setInterval(t, 1000); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setEnergy((e) => Math.max(0, e - 0.018)), 60);
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => {
    let alive = true;
    const key = (e: any) => `${e.ts}|${e.event}|${e.who}`;
    const ingest = (rows: any[], incremental: boolean) => {
      if (!rows.length) return;
      const mapped = rows.map((e) => ({ _id: _eid++, event: mapLiveEvent(e), who: e.who || "someone", country: e.country || "", ts: e.ts }));
      const maxTs = rows.reduce((a: string, r: any) => (r.ts > a ? r.ts : a), latestTs.current || "");
      if (incremental) {
        for (const m of mapped) {
          if (m.ts > firedTs.current) {
            const stage = EVENT_TYPES[m.event]?.stage;
            if (stage) engineRef.current?.fireEvent(stage);
            setEnergy((en) => Math.min(1, en + (m.event === "booked_call" ? 1 : m.event === "ht_qualified" ? 0.6 : 0.3)));
          }
        }
        firedTs.current = maxTs;
      }
      latestTs.current = maxTs;
      setFeed((f) => {
        const seen = new Set(f.map(key));
        const fresh = mapped.filter((m) => !seen.has(key(m)));
        return incremental ? [...fresh, ...f].slice(0, 44) : mapped.slice(0, 44);
      });
    };
    const poll = async (incremental: boolean) => {
      try {
        const url = incremental && latestTs.current ? `/api/analytics/live?after=${encodeURIComponent(latestTs.current)}` : `/api/analytics/live`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!alive) return;
        setFeedNow(Date.now());
        if (!incremental) firedTs.current = (d.events ?? []).reduce((a: string, r: any) => (r.ts > a ? r.ts : a), "");
        ingest(d.events ?? [], incremental);
      } catch { /* ignore */ }
    };
    poll(false);
    const id = setInterval(() => poll(true), 20000);
    const tick = setInterval(() => setFeedNow(Date.now()), 30000);
    return () => { alive = false; clearInterval(id); clearInterval(tick); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/analytics/trends`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setTrends(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/analytics/data?days=${days}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setData(j); }).catch(() => {});
    return () => { alive = false; };
  }, [days]);

  const V: any = useMemo(() => buildV4(funnel, morning, trends, data), [funnel, morning, trends, data]);

  async function logout() { await fetch("/api/analytics/auth", { method: "DELETE" }); router.refresh(); }

  return (
    <div className="jx-app">
      <div className="command command-v2">
        {/* topbar */}
        <div className="topbar">
          <div className="brand">
            <BAMark size={26} />
            <div className="title"><b>Brand Architect // JARVIS</b><span>Goh Consulting · Operator HUD</span></div>
          </div>
          <span className="spacer" />
          <div className="rangepills">{[7, 30, 90].map((r) => <button key={r} className={r === days ? "on" : ""} onClick={() => setDays(r)}>{r}d</button>)}</div>
          <div className="statusled">{loading && funnel ? <><span className="led" />SYNCING {days}D…</> : <><span className="led" />LIVE</>}</div>
          <div className="clock">{clock}</div>
          <button className="ghostbtn" onClick={logout}>Lock</button>
        </div>

        {loading && !funnel && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: C.dim, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            <span className="led" /> Booting funnel command…
          </div>
        )}
        {error && !funnel && <div style={{ padding: 40, textAlign: "center", color: C.drop, fontFamily: "var(--font-mono)", fontSize: 12 }}>{error}</div>}

        {funnel && (() => {
          const trackingSince = funnel.trackingSince ? new Date(funnel.trackingSince) : null;
          const availableDays = trackingSince ? Math.floor((Date.now() - trackingSince.getTime()) / 86_400_000) : null;
          const showDataGap = availableDays !== null && days > availableDays + 2;
          return (
            <>
              {showDataGap && (
                <div style={{ margin: "0 0 0", padding: "10px 24px", background: "rgba(245,158,11,0.10)", borderBottom: "1px solid rgba(245,158,11,0.35)", display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: C.amber, letterSpacing: "0.16em", textTransform: "uppercase", flexWrap: "wrap" }}>
                  <span style={{ width: 6, height: 6, background: C.amber, display: "inline-block", flexShrink: 0 }} />
                  <span>
                    · Funnel data (PostHog) covers ~{availableDays}d since tracking started {trackingSince!.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {days}d view shows the same funnel numbers as {availableDays}d ·
                    Revenue (Whop) covers the full {days}d ·
                  </span>
                </div>
              )}
              <FunnelHero key={`${funnel.period}-${V.TOPOLOGY?.nodes?.traffic?.count ?? 0}`} period={funnel.period} data={{ C: V.C, TOPOLOGY: V.TOPOLOGY, EVENT_TYPES: V.EVENT_TYPES }} engineRef={engineRef} intensity={reduced ? 0 : 0.78} feed={feed} now={feedNow} />

            <div className="grid">
              <div className="col-main">
                <Sec id="Morning Report">
                  <SecHead title="Morning Report" k={V.MORNING.meta} />
                  <TileGrid tiles={V.MORNING.tiles} cols={4} />
                  <div className="v4-miniflow">
                    {V.MORNING.flow.map(([v, l]: any, i: number) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                        {i > 0 && <span className="vmf-a">→</span>}
                        <span className="vmf-i"><b style={{ color: l === "closed" && v === "0" ? C.drop : undefined }}>{v}</b>{l}</span>
                      </span>
                    ))}
                  </div>
                </Sec>

                <Sec id="Action Center">
                  <SecHead title="Action Center" k={`fix these first · ${V.DIRECTIVES_TOTAL}`} color={C.drop} />
                  <Directives directives={V.DIRECTIVES} onFocus={(id) => { if (id) engineRef.current?.fireEvent(id); }} />
                </Sec>

                <Sec id="Scoreboard">
                  <SecHead title="Scoreboard" k={`top-down · last ${days} days · everything ties to this`} />
                  <Scoreboard board={V.SCOREBOARD} />
                </Sec>

                <Sec id="Instruments">
                  <SecHead title="Instruments" k="conversion rates vs target" />
                  <div className="gauges" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
                    {V.GAUGES.map((g: any) => <ArcGauge key={g.id} g={g} animate={!reduced} />)}
                  </div>
                </Sec>

                <Sec id="Daily lead volume">
                  <SecHead title="Daily lead volume" k={`new leads per day · ${V.DAILY.total} total · hover any day`} color={C.blue} />
                  <div className="panel"><StackedBars daily={V.DAILY} /></div>
                </Sec>

                <Sec id="Revenue">
                  <SecHead title="Revenue · sliced every way" k="live from Whop" />
                  <TileGrid tiles={V.REVENUE.cards} cols={4} />
                  <NoteBox color="rgba(143,208,255,0.3)">{V.REVENUE.note}</NoteBox>
                  <DataTable cols={["Product", "Type", "Price", "Revenue", "Sales"]} rows={V.REVENUE.products} accentCol={3} />
                  <div className="v4-fine">{V.REVENUE.footer}</div>
                </Sec>

                <div className="v4-2col">
                  <Sec id="Lead magnet funnel">
                    <SecHead title="Lead magnet funnel" k="step by step" />
                    <div className="panel"><StepBars steps={V.LM_FUNNEL} color={C.acid} /></div>
                  </Sec>
                  <Sec id="$5K HT funnel">
                    <SecHead title="$5K HT funnel" k="step by step" color={C.blue} />
                    <div className="panel"><StepBars steps={V.HT_FUNNEL} color={C.blue} /></div>
                  </Sec>
                </div>

                <Sec id="Crossover">
                  <div className="v4-cross">
                    <b>{V.CROSSOVER.big}</b>
                    <div><span>{V.CROSSOVER.text}</span><i>{V.CROSSOVER.sub}</i></div>
                  </div>
                </Sec>

                <Sec id="Booking path · $5K closer">
                  <SecHead title="Booking path · $5K closer" k="qualified → calendar → booked → showed → closed" color={C.blue} />
                  <div className="panel">
                    <FlowStrip items={V.BOOKING.flow.map((f: any) => (f.money ? { ...f, moneySub: f.money } : f))} />
                    <div className="v4-splits">
                      <div className="vsp">
                        <div className="vsp-l">{V.BOOKING.splits[0].label}</div>
                        <div className="vsp-parts">{V.BOOKING.splits[0].parts.map(([v, l, c]: any, i: number) => <span key={i}><b style={{ color: c }}>{v}</b>{l}</span>)}</div>
                      </div>
                      {V.BOOKING.splits.slice(1).map((s: any, i: number) => (
                        <div className="vsp" key={i}><div className="vsp-l">{s.label}</div><div className="vsp-big" style={{ color: s.color }}>{s.big}</div><div className="vsp-s">{s.sub}</div></div>
                      ))}
                    </div>
                    <NoteBox color="rgba(240,130,109,0.4)">{V.BOOKING.alert}</NoteBox>
                    <div className="v4-fine">{V.BOOKING.method}</div>
                  </div>
                </Sec>

                <Sec id="Sales team">
                  <SecHead title="Sales team" k="setters dial outbound · closer closes" />
                  <div className="panel v4-closer">
                    <div>
                      <div className="vc-name">{V.TEAM.closer.name} <span>· {V.TEAM.closer.role}</span></div>
                      <div className="vc-sub">{V.TEAM.closer.sub}</div>
                    </div>
                    <div className="vc-stats">
                      <span><b>{V.TEAM.closer.closes}</b>closes</span>
                      <span><b className="jx-money" style={{ color: C.acid }}>{V.TEAM.closer.revenue}</b>closed revenue</span>
                    </div>
                  </div>
                  <DataTable cols={["Setter", "Dials", "Conversations", "Connect %", "Talk time"]} rows={V.TEAM.setters} accentCol={3} />
                </Sec>

                <Sec id="Email nurture">
                  <SecHead title="Email nurture" k="lead magnet → $5K offer warm" />
                  <div className="panel"><FlowStrip items={[V.NURTURE.flow[0], { conv: "→" }, V.NURTURE.flow[1], { conv: "→" }, V.NURTURE.flow[2], { conv: "→" }, V.NURTURE.flow[3]]} /></div>
                  <NoteBox color="rgba(245,158,11,0.35)">{V.NURTURE.warn}</NoteBox>
                  <div className="v4-2col">
                    <div>
                      <div className="v4-minihead">Active Kit sequences</div>
                      <DataTable cols={["Sequence", "Funnel", "Enrolled"]} rows={V.NURTURE.sequences} accentCol={2} />
                    </div>
                    <div>
                      <div className="v4-minihead">Recent broadcasts — list-wide blasts</div>
                      <DataTable cols={["Subject", "Sent", "Recipients", "Open", "CTR", "Clicks"]} rows={V.NURTURE.broadcasts} accentCol={3} />
                    </div>
                  </div>
                </Sec>

                <Sec id="Traffic sources">
                  <SecHead title="Where traffic comes from" k="first-touch · UTM-tagged" color={C.purp} />
                  <DataTable cols={["Source", "Visitors", "LM signups", "Applications"]} rows={V.SOURCES} accentCol={1} accentColor={C.bone} />
                </Sec>

                <Sec id="Lead magnet ROI">
                  <SecHead title="Lead magnet · does it produce clients?" k="LM subscribers ∩ Whop buyers" />
                  <div className="panel"><FlowStrip items={[V.ROI.flow[0], { conv: "→" }, V.ROI.flow[1], { conv: "→" }, V.ROI.flow[2], { conv: "→" }, V.ROI.flow[3]]} /></div>
                  <NoteBox color="rgba(240,130,109,0.4)">{V.ROI.verdict}</NoteBox>
                  <div className="v4-buyers">{V.ROI.buyers.map((b: string, i: number) => <span key={i}>{b}</span>)}</div>
                  <div className="v4-fine">{V.ROI.method}</div>
                </Sec>

                <Sec id="The brand play">
                  <SecHead title="The brand play · why this model" k="positioning → trust → high-ticket" />
                  <div className="v4-pivot">{V.PIVOT.map((p: any, i: number) => <div className="vp-card" key={i} style={{ borderTopColor: p.color }}><b>{p.title}</b><span>{p.text}</span></div>)}</div>
                </Sec>

                <Sec id="Revenue trend">
                  <SecHead title="Revenue trend" k="month over month · from Whop" />
                  <div className="panel"><TrendBars trend={V.TREND} /></div>
                </Sec>

                <Sec id="Memberships">
                  <SecHead title="Memberships" k="active community" color={C.purp} />
                  <TileGrid tiles={V.LEGACY} cols={4} />
                </Sec>

                <Sec id="Weekly leads">
                  <SecHead title="Weekly leads & reach" k="top-of-funnel momentum" color={C.blue} />
                  <div className="panel"><WeeklyLines weekly={V.WEEKLY} /></div>
                </Sec>

                <Sec id="Attribution">
                  <SecHead title="Attribution" k="which channel actually makes money · SegMetrics" />
                  <TileGrid tiles={V.ATTRIB.tiles} cols={4} />
                  <DataTable cols={["Channel", "Leads", "Customers", "Conv %", "Revenue", "Lead value"]} rows={V.ATTRIB.channels.map((c: any) => [c[0], c[2], c[3], c[4], c[5], c[6]])} accentCol={4} />
                  <div className="v4-2col" style={{ marginTop: 14 }}>
                    <div><div className="v4-minihead">First touch · what FILLS the funnel</div><HBars rows={V.ATTRIB.first} /></div>
                    <div><div className="v4-minihead">Last touch · what CLOSES</div><HBars rows={V.ATTRIB.last} money /></div>
                  </div>
                  <div className="v4-minihead" style={{ marginTop: 14 }}>Top campaigns — first-touch lead drivers</div>
                  <HBars rows={V.ATTRIB.campaigns.map((c: any) => [c[0], c[1], C.blue])} />
                  <NoteBox color="rgba(201,164,85,0.3)">{V.ATTRIB.pattern}</NoteBox>
                </Sec>

                <Sec id="Pipeline CRM">
                  <SecHead title="Pipeline · CRM" k="members · setter pipeline · follow-up buckets" />
                  <TileGrid tiles={V.CRM.members} cols={4} />
                  <div className="v4-2col" style={{ marginTop: 14 }}>
                    <DataTable cols={["Rate", "Basis", "Value"]} rows={V.CRM.rates} accentCol={2} />
                    <div>
                      <DataTable cols={["Bucket", "Count", "Note"]} rows={V.CRM.buckets.map((b: any) => [b[0], b[1], b[2]])} accentCol={1} />
                      <div className="v4-booked">{V.CRM.booked.map(([l, v]: any, i: number) => <span key={i}><b>{v}</b>{l}</span>)}</div>
                    </div>
                  </div>
                  <div className="v4-minihead" style={{ marginTop: 14 }}>Full pipeline breakdown</div>
                  <HBars rows={V.CRM.pipeline} />
                </Sec>
              </div>

              <div className="col-rail">
                <JarvisPanel data={{ JARVIS: V.JARVIS, DIRECTIVES: V.DIRECTIVES }} energy={energy} onAsk={() => setEnergy((e) => Math.min(1, e + 0.5))} />
                <Telemetry feed={feed} eventTypes={V.EVENT_TYPES} now={feedNow} />
              </div>
            </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
