"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { C, rel } from "./map";

export function useCountUp(target: number, dur = 1100, start = true) {
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0, t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / dur);
      setAnim(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, start]);
  return start ? anim : target;
}

export function BAMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,4 96,27 96,73 50,96 4,73 4,27"
        fill="none" stroke="#C9A455" strokeWidth="2" opacity="0.5" />
      <polygon points="50,20 80,35 80,65 50,80 20,65 20,35"
        fill="#C9A455" opacity="0.2" />
      <polygon points="50,34 68,43 68,57 50,66 32,57 32,43"
        fill="#C9A455" opacity="0.8" />
      <polygon points="50,44 60,49 60,51 50,56 40,51 40,49"
        fill="#060504" />
    </svg>
  );
}

export function SecHead({ title, k, color }: { title: string; k?: string; color?: string }) {
  return (
    <div className="v4-sechead">
      <span className="v4-sq" style={{ background: color || C.acid, boxShadow: `0 0 12px ${color || C.acid}` }} />
      <h3>{title}</h3>
      {k && <span className="v4-k">{k}</span>}
    </div>
  );
}

export function NoteBox({ color, children }: { color?: string; children: React.ReactNode }) {
  return <div className="v4-note" style={{ borderColor: color || "#22222B" }}>{children}</div>;
}

export function TileGrid({ tiles, cols }: { tiles: any[]; cols?: number }) {
  return (
    <div className="v4-tiles" style={{ gridTemplateColumns: `repeat(${cols || tiles.length}, 1fr)` }}>
      {tiles.map((t, i) => (
        <div className="v4-tile" key={i}>
          <div className="vt-label">{t.label}</div>
          <div className={"vt-val" + (t.money ? " jx-money" : "")} style={{ color: t.color, fontSize: t.small ? 22 : undefined }}>{t.value}</div>
          {t.delta && <div className="vt-delta" style={{ color: t.down ? C.drop : C.acid }}>{t.delta}</div>}
          <div className="vt-sub">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function ScoreTile({ t, delay }: { t: any; delay: number }) {
  const v = useCountUp(t.value, 1100 + delay);
  const fmt = t.fmt === "usd" ? "$" + Math.round(v).toLocaleString() : Math.round(v).toLocaleString();
  return (
    <div className="v4-tile">
      <div className="vt-label">{t.label}</div>
      <div className={"vt-val" + (t.money ? " jx-money" : "")} style={{ color: t.color }}>{fmt}</div>
      <div className="vt-sub">{t.sub}</div>
    </div>
  );
}

export function Scoreboard({ board }: { board: any[] }) {
  return <div className="v4-tiles" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>{board.map((t, i) => <ScoreTile key={i} t={t} delay={i * 90} />)}</div>;
}

export function FlowStrip({ items }: { items: any[] }) {
  return (
    <div className="v4-flow">
      {items.map((it, i) => it.conv
        ? <div className="vf-arrow" key={i}><span>→</span><b>{it.conv}</b></div>
        : (
          <div className="vf-box" key={i}>
            <div className={"vf-v" + (it.money ? " jx-money" : "")} style={{ color: it.drop ? C.drop : it.money ? C.acid : undefined }}>{it.v}</div>
            <div className="vf-l">{it.label}</div>
            {it.sub && <div className="vf-s">{it.sub}</div>}
            {it.moneySub && <div className="vf-m">{it.moneySub}</div>}
          </div>
        ))}
    </div>
  );
}

export function StepBars({ steps, color }: { steps: any[]; color: string }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="v4-steps">
      {steps.map((s, i) => (
        <div key={i}>
          <div className="vs-row">
            <div className="vs-label">{s.label}{s.sub && <span>{s.sub}</span>}</div>
            <div className="vs-track">
              <div className="vs-bar" style={{ width: (s.count / max * 100) + "%", background: color, boxShadow: `0 0 14px ${color}55` }}><b>{s.count.toLocaleString()}</b></div>
            </div>
          </div>
          {s.conv && <div className="vs-drop">↓ <b>{s.conv}</b>{s.dropped && <i> · {s.dropped}</i>}</div>}
        </div>
      ))}
    </div>
  );
}

export function DataTable({ cols, rows, accentCol, accentColor, firstLeft = true }: { cols: string[]; rows: any[][]; accentCol?: number; accentColor?: string; firstLeft?: boolean }) {
  const grid = `2.2fr ${"1fr ".repeat(cols.length - 1).trim()}`;
  return (
    <div className="v4-table">
      <div className="vtb-head" style={{ gridTemplateColumns: grid }}>
        {cols.map((c, i) => <span key={i} style={{ textAlign: i === 0 && firstLeft ? "left" : "right" }}>{c}</span>)}
      </div>
      {rows.map((r, ri) => (
        <div className="vtb-row" key={ri} style={{ gridTemplateColumns: grid }}>
          {r.map((cell, ci) => (
            <span key={ci} style={{
              textAlign: ci === 0 && firstLeft ? "left" : "right",
              fontFamily: ci === 0 ? "var(--font-body)" : "var(--font-mono)",
              color: ci === accentCol ? (accentColor || C.acid) : undefined,
              fontWeight: ci === accentCol ? 600 : undefined,
            }}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function HBars({ rows, money }: { rows: any[]; money?: boolean }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="v4-hbars">
      {rows.map(([label, val, color]: any, i: number) => (
        <div className="vh-row" key={i}>
          <span className="vh-l">{label}</span>
          <div className="vh-track"><div className="vh-bar" style={{ width: Math.max(1.5, val / max * 100) + "%", background: color, boxShadow: `0 0 10px ${color}66` }} /></div>
          <span className="vh-v" style={{ color }}>{money ? "$" + val.toLocaleString() : val.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function StackedBars({ daily }: { daily: any }) {
  const max = Math.max(...daily.series.map((d: any) => d.lm + d.ht), 1);
  const [hov, setHov] = useState<number | null>(null);
  return (
    <div>
      <div className="v4-legend">
        <span><i style={{ background: C.acid }} />Lead magnet signups</span>
        <span><i style={{ background: C.blue }} />$5K offer leads</span>
        {hov != null && <span className="v4-hovinfo">{daily.days[hov]} · lm {daily.series[hov].lm} · ht {daily.series[hov].ht}</span>}
      </div>
      <div className="v4-stack" onMouseLeave={() => setHov(null)}>
        {daily.series.map((d: any, i: number) => (
          <div className="vstk-col" key={i} onMouseEnter={() => setHov(i)} style={{ opacity: hov == null || hov === i ? 1 : 0.45 }}>
            <div className="vstk-bars">
              <div style={{ height: (d.lm / max * 100) + "%", background: C.acid }} />
              <div style={{ height: (d.ht / max * 100) + "%", background: C.blue }} />
            </div>
            {i % 2 === 0 && <span className="vstk-x">{daily.days[i]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendBars({ trend }: { trend: any }) {
  const max = Math.max(...trend.values, 1);
  return (
    <div>
      <div className="v4-trend">
        {trend.months.map((m: string, i: number) => (
          <div className="vtr-col" key={i}>
            <div className="vtr-val" style={{ color: trend.values[i] >= 20 ? C.acid : C.bone }}>${trend.values[i]}k</div>
            <div className="vtr-track">
              <div className="vtr-bar" style={{ height: (trend.values[i] / max * 100) + "%", background: i === trend.months.length - 1 ? "rgba(201,164,85,0.35)" : C.acid, boxShadow: `0 0 16px ${C.acid}44` }} />
            </div>
            {trend.deltas[i] && <div className="vtr-delta" style={{ color: trend.deltas[i].startsWith("+") ? C.acid : C.drop }}>{trend.deltas[i]}</div>}
            <div className="vtr-x">{m}</div>
          </div>
        ))}
      </div>
      <div className="v4-fine">{trend.note}</div>
    </div>
  );
}

export function WeeklyLines({ weekly }: { weekly: any }) {
  const n = weekly.labels.length, W = 1144, top = 10, plotH = 150, padL = 14, padR = 34;
  const xFor = (i: number) => padL + (W - padL - padR) * (n > 1 ? i / (n - 1) : 0.5);
  const lines: any[] = weekly.lines;
  const mainMax = Math.max(...lines.filter((l) => l.scale === "main").flatMap((l) => l.values), 1);
  const subMax = Math.max(...lines.filter((l) => l.scale !== "main").flatMap((l) => l.values), 1);
  const yFor = (v: number, scale: string) => top + plotH * (1 - v / (scale === "main" ? mainMax : subMax));
  return (
    <div>
      <div className="v4-legend">{lines.map((l) => <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>)}</div>
      <svg viewBox="0 0 1144 190" style={{ width: "100%", display: "block" }}>
        {lines.map((l, li) => (
          <g key={li}>
            <polyline points={l.values.map((v: number, i: number) => `${xFor(i)},${yFor(v, l.scale)}`).join(" ")} fill="none" stroke={l.color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 6px ${l.color}88)` }} />
            {l.values.map((v: number, i: number) => <circle key={i} cx={xFor(i)} cy={yFor(v, l.scale)} r="3.5" fill={l.color} />)}
          </g>
        ))}
        {weekly.labels.map((lb: string, i: number) => <text key={i} x={xFor(i)} y={184} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="#555560">{lb}</text>)}
      </svg>
      <div className="v4-fine">{weekly.note}</div>
    </div>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) { const a = (deg - 90) * Math.PI / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
function arcPath(cx: number, cy: number, r: number, s: number, e: number) { const A = polar(cx, cy, r, e), B = polar(cx, cy, r, s); const large = e - s <= 180 ? 0 : 1; return `M ${A.x} ${A.y} A ${r} ${r} 0 ${large} 0 ${B.x} ${B.y}`; }
export function ArcGauge({ g, animate }: { g: any; animate: boolean }) {
  const START = -120, SWEEP = 240, END = START + SWEEP;
  const v = useCountUp(g.value, 1200, animate);
  const valDeg = START + SWEEP * Math.min(1, v / 100);
  const tgtDeg = START + SWEEP * (g.target / 100);
  const tgt = polar(50, 50, 38, tgtDeg), tgtIn = polar(50, 50, 31, tgtDeg);
  return (
    <div className="gauge">
      <div className="glabel">{g.label}</div>
      <svg width="92" height="78" viewBox="0 0 100 86">
        <path d={arcPath(50, 50, 38, START, END)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <path d={arcPath(50, 50, 38, START, valDeg)} fill="none" stroke={g.color} strokeWidth="6" style={{ filter: `drop-shadow(0 0 5px ${g.color}88)` }} />
        <line x1={tgtIn.x} y1={tgtIn.y} x2={tgt.x} y2={tgt.y} stroke="var(--bone)" strokeWidth="1.4" strokeOpacity="0.7" />
        <text x="50" y="52" textAnchor="middle" fontFamily="var(--font-display)" fontSize="22" fill={g.color}>{Math.round(v)}{g.unit}</text>
        <text x="50" y="64" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6.5" letterSpacing="1" fill="var(--steel)">TGT {g.target}{g.unit}</text>
      </svg>
      <div className="gbasis">{g.basis}</div>
    </div>
  );
}

export function Directives({ directives, onFocus }: { directives: any[]; onFocus?: (id: string | null) => void }) {
  return (
    <div className="directives">
      {directives.map((d) => (
        <div className="directive" key={d.rank} onMouseEnter={() => onFocus?.(d.node)} onMouseLeave={() => onFocus?.(null)}>
          <div className="sevbar" style={{ background: d.color }} />
          <div className="rank">{String(d.rank).padStart(2, "0")}</div>
          <div className="dmain">
            <div className="dsev" style={{ color: d.color }}><span className="sevdot" style={{ background: d.color }} />{d.sev} SEVERITY</div>
            <div className="dtitle">{d.title}</div>
            <div className="dproblem">{d.problem}</div>
            <div className="dfix"><span className="arrow">FIX →</span><span>{d.fix}</span></div>
            <div className="dmetric">{d.metric}</div>
          </div>
          <div className="dmoney">
            <div className="mval" style={{ color: d.money > 0 ? d.color : "var(--steel)" }}>{d.money > 0 ? "~$" + d.money.toLocaleString() : "—"}</div>
            <div className="mcap">{d.money > 0 ? "on the table" : "no $ yet"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Telemetry({ feed, eventTypes, now }: { feed: any[]; eventTypes: any; now: number }) {
  return (
    <div className="panel telemetry">
      <div className="thead">
        <span className="led" style={{ background: C.acid }} />
        <span className="panel-kicker">Live Telemetry</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="panel-sub">{feed.length} events</span>
      </div>
      <div className="feed">
        {feed.length === 0 && <div style={{ padding: 28, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: C.dim }}>waiting for funnel activity…</div>}
        {feed.map((ev) => {
          const meta = eventTypes[ev.event] || { color: C.ash, glyph: "·", label: ev.event, sub: "" };
          return (
            <div className="tevent" key={ev._id}>
              <div className="tglyph" style={{ color: meta.color }}>{meta.glyph}</div>
              <div className="tinfo"><b>{meta.label}</b><span>@{ev.who} · {meta.sub}</span></div>
              <div className="tmeta"><span className="flag">{ev.country}</span> · {rel(ev.ts, now)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
