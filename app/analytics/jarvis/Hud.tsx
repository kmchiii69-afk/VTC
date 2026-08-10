"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

export function JarvisOrb({ energy = 0, size = 56, listening = false }: { energy?: number; size?: number; listening?: boolean }) {
  const e = Math.min(1, energy);
  const glow = 6 + e * 22;
  return (
    <div className="orb-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 ${glow}px rgba(201,164,85,${0.35 + e * 0.5}))`, transform: `scale(${1 + e * 0.06})`, transition: "transform 120ms ease" }}>
        <defs>
          <radialGradient id="orbcore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F5DFA0" /><stop offset="45%" stopColor="#C9A455" /><stop offset="100%" stopColor="#8a621a" />
          </radialGradient>
        </defs>
        <g style={{ transformOrigin: "50px 50px", animation: "orbspin 14s linear infinite" }}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="#C9A455" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="3 7" />
        </g>
        <g style={{ transformOrigin: "50px 50px", animation: "orbspin 9s linear infinite reverse" }}>
          <circle cx="50" cy="50" r="37" fill="none" stroke="#8FD0FF" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="14 6" />
        </g>
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2, on = i % 2 === 0, r1 = 28, r2 = on ? 32 : 30.5;
          return <line key={i} x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1} x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2} stroke="#C9A455" strokeOpacity={on ? 0.5 : 0.22} strokeWidth="1" />;
        })}
        <circle cx="50" cy="50" r={18 + e * 8} fill="none" stroke="#C9A455" strokeOpacity={e * 0.7} strokeWidth="1.5" />
        <circle cx="50" cy="50" r={9 + e * 3} fill="url(#orbcore)" />
        <circle cx="50" cy="50" r={9 + e * 3} fill="none" stroke="#F5DFA0" strokeOpacity="0.6" strokeWidth="0.6" />
      </svg>
      {listening && <div style={{ position: "absolute", inset: -4, border: "1px solid rgba(143,208,255,0.5)", borderRadius: "50%", animation: "orbspin 3s linear infinite" }} />}
    </div>
  );
}

function hudHighlight(text: string) {
  const html = text.replace(/(\$[\d,]+)/g, "<b>$1</b>").replace(/(\d+%)/g, '<span class="drop">$1</span>');
  return { __html: html };
}

function TypedAnswer({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0; const id = setInterval(() => { i += 3; setShown(text.slice(0, i)); if (i >= text.length) clearInterval(id); }, 14);
    return () => clearInterval(id);
  }, [text]);
  return <div className="qa-a">{shown}</div>;
}

export function JarvisPanel({ data, energy, onAsk }: { data: any; energy: number; onAsk?: () => void }) {
  const J = data.JARVIS;
  const D = data.DIRECTIVES[0];
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const [thread, setThread] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const full: string = J.briefing;
    let i = 0;
    const id = setInterval(() => { i += 2; setTyped(full.slice(0, i)); if (i >= full.length) { clearInterval(id); setDone(true); } }, 16);
    return () => clearInterval(id);
  }, [J.briefing]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const pick = () => {
      const vs = synth.getVoices(); if (!vs.length) return;
      const prefer = ["Daniel", "Google UK English Male", "Alex", "Google US English", "Samantha"];
      voiceRef.current = prefer.map((n) => vs.find((v) => v.name === n)).find(Boolean) || vs.find((v) => v.lang?.startsWith("en")) || vs[0];
    };
    pick(); synth.onvoiceschanged = pick;
    return () => { synth.onvoiceschanged = null; synth.cancel(); };
  }, []);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread]);

  function answer(q: string) {
    const ql = q.toLowerCase();
    let best: any = null, bestScore = 0;
    for (const item of J.qa) {
      let score = 0;
      for (const w of item.q.split(" ")) if (ql.includes(w)) score++;
      if (ql.includes("fix") && item.q.includes("fix")) score += 2;
      if (ql.includes("booking") && item.q.includes("booking")) score += 3;
      if ((ql.includes("lead") || ql.includes("traffic") || ql.includes("come")) && item.q.includes("come")) score += 3;
      if ((ql.includes("table") || ql.includes("money") || ql.includes("much")) && item.q.includes("much")) score += 3;
      if ((ql.includes("working") || ql.includes("good")) && item.q.includes("working")) score += 3;
      if (score > bestScore) { bestScore = score; best = item; }
    }
    return bestScore > 0 ? best.a : J.fallback;
  }

  function submit(q: string) {
    if (!q.trim()) return;
    onAsk?.();
    setInput("");
    const a = answer(q);
    setThread((t) => [...t, { q, a }]);
  }

  function toggleSpeak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const text = J.briefing + " Here's my read. " + J.myRead.map((m: any) => m.text).join(" ");
    synth.cancel();
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    sentences.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s.trim());
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 1.03;
      if (i === 0) u.onstart = () => setSpeaking(true);
      if (i === sentences.length - 1) u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    });
  }

  return (
    <div className="panel jarvis">
      <div className="jhead">
        <JarvisOrb energy={energy} listening={energy > 0.3} />
        <div className="jmeta"><b>JARVIS</b><span><i />BRAND ARCHITECT · ONLINE</span></div>
      </div>

      <div className="jbody">
        <div className="briefing">
          {done ? <span dangerouslySetInnerHTML={hudHighlight(typed)} /> : <span>{typed}<span className="cursor" /></span>}
        </div>
        {done && (
          <div style={{ marginTop: 12 }}>
            <div className="jread-h">My read</div>
            {J.myRead.map((m: any, i: number) => (
              <div className="jread-row" key={i}><span className="dot" style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }} /><span className="txt">{m.text}</span></div>
            ))}
          </div>
        )}
        {done && D && (
          <div className="jdirective">
            <div className="jd-k"><span className="sevdot" style={{ width: 7, height: 7, background: D.color }} />TOP DIRECTIVE · {D.sev}</div>
            <div className="jd-t">{D.title}</div>
            <div className="jd-m">{D.money > 0 ? `~$${D.money.toLocaleString()} on the table · ` : ""}{D.metric}</div>
          </div>
        )}
      </div>

      <div className="jvoice">
        <button className={speaking ? "speaking" : ""} onClick={toggleSpeak}>
          {speaking ? <><span style={{ width: 9, height: 9, background: "currentColor", display: "inline-block" }} /> Stop</> : <><span style={{ width: 0, height: 0, borderLeft: "9px solid currentColor", borderTop: "6px solid transparent", borderBottom: "6px solid transparent" }} /> Brief me out loud</>}
        </button>
        <span>{speaking ? "speaking…" : "reads your brief + read aloud"}</span>
      </div>

      <div className="askit">
        {thread.length > 0 && (
          <div className="qa-thread" ref={threadRef}>
            {thread.map((t, i) => (
              <div key={i} style={{ display: "contents" }}>
                <div className="qa-q">{t.q}</div>
                <TypedAnswer text={t.a} />
              </div>
            ))}
          </div>
        )}
        <div className="chips">
          {["what should i fix?", "how's the booking path?", "where did leads come from?", "is it working?"].map((c) => (
            <button key={c} className="chip" onClick={() => submit(c)}>{c}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask JARVIS…" />
          <button className="send" type="submit">→</button>
        </form>
      </div>
    </div>
  );
}
