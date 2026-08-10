"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { FunnelEngineV2 } from "./engine";
import { rel } from "./map";

export function FunnelHero({ data, engineRef, intensity, feed, period = 30, now = 0 }: { data: any; engineRef: any; intensity: number; feed: any[]; period?: number; now?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<any>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const C = data.C;

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const eng: any = new FunnelEngineV2(canvasRef.current, {
      data: { C }, intensity, reduced, topology: data.TOPOLOGY, onHover: (n: any) => setTip(n),
    });
    engineRef.current = eng;
    eng.start();
    const ro = new ResizeObserver(() => eng.resize());
    ro.observe(wrapRef.current);
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (reduced) return; if (en.isIntersecting) eng.start(); else eng.stop(); });
    }, { threshold: 0.02 });
    io.observe(wrapRef.current);
    const onHide = () => { if (document.hidden) eng.stop(); else if (!reduced) eng.start(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { eng.destroy(); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", onHide); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setF(f: string | null) { setFilter(f); engineRef.current?.setFilter(f); }

  const legend = [
    { c: C.acid, t: "LM Funnel" }, { c: C.blue, t: "$5K HT Funnel" },
    { c: C.purp, t: "Crossover" }, { c: C.drop, t: "Leak" },
  ];

  return (
    <div className="hero2" ref={wrapRef}>
      <canvas ref={canvasRef} className="hero2-canvas" />
      <div className="hero2-tl">
        <div className="hero2-kicker">BA // FUNNEL COMMAND · {period}D WINDOW</div>
        <h2 className="hero2-title">The <em>Living</em> Funnel</h2>
      </div>
      <div className="hero2-tr">
        <div className="filters">
          {[["all", null], ["ht", "ht"], ["lm", "lm"]].map(([lbl, val]) => (
            <button key={lbl as string} className={filter === val ? "on" : ""} onClick={() => setF(val as any)}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="hero2-ticker">
        <span className="tick-label"><span className="led" />LIVE</span>
        <div className="tick-row">
          {feed.slice(0, 6).map((ev) => {
            const meta = data.EVENT_TYPES[ev.event] || { color: C.ash, glyph: "·", label: ev.event };
            return (
              <span className="tick-chip" key={ev._id}>
                <b style={{ color: meta.color }}>{meta.glyph}</b>{meta.label}<i>@{ev.who} · {rel(ev.ts, now)}</i>
              </span>
            );
          })}
        </div>
        <div className="hero2-legend">{legend.map((l) => <span key={l.t}><i style={{ background: l.c, boxShadow: `0 0 6px ${l.c}` }} />{l.t}</span>)}</div>
      </div>
      {tip && (
        <div className="node-tip show" style={{ left: tip.sx, top: tip.sy }}>
          <div className="nt-label" style={{ color: tip.color }}>{tip.label}</div>
          <div className="nt-count" style={{ color: tip.color }}>{tip.count.toLocaleString()}</div>
          <div className="nt-sub">{tip.sub}</div>
        </div>
      )}
    </div>
  );
}
