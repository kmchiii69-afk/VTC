'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';
import { ResourceInline, type Resource } from '@/components/ui/resources-section';

const ASSISTANT_TOUR: TourStep[] = [
  { title: 'Meet SooWei', body: 'This is your AI channel — ask anything, or use a task tool to analyze content and generate ideas.' },
  { target: 'assistant-tasks', title: 'Task tools', body: 'Analyze a reel or YouTube video, review a script, or generate on-brand ideas — results save to your Content Brain.' },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_MODES = [
  { id: 'analyze-reel',   label: 'Analyze Reel',   hint: 'Paste a script or Instagram/Shorts URL…'        },
  { id: 'analyze-yt',     label: 'Analyze YT',     hint: 'Paste a long-form YouTube URL…'                 },
  { id: 'review-script',  label: 'Review Script',  hint: 'Paste a script to score before SooWei sees it…' },
  { id: 'generate-ideas', label: 'Generate Ideas', hint: 'Add context or leave blank to generate 4 ideas…' },
] as const;

type TaskMode = typeof TASK_MODES[number]['id'] | null;

const G       = '#c9a455';
const GB      = 'rgba(201,164,85,0.15)';
const GBorder = 'rgba(201,164,85,0.18)';
const Muted   = '#a89e8a';

// ─── Brain types ──────────────────────────────────────────────────────────────

interface SavedHook    { text: string; concept?: string; ts: number; }
interface SavedIdea    { title: string; hook: string; concept: string; format: string; overall: number; why: string; ts: number; }
interface TrackedObj   { text: string; category: string; count: number; last_seen: number; }
interface ContentBrain { hooks: SavedHook[]; ideas: SavedIdea[]; objections: TrackedObj[]; mechanics: string[]; }

const EMPTY_BRAIN: ContentBrain = { hooks: [], ideas: [], objections: [], mechanics: [] };
const BRAIN_KEY = 'goh_content_brain';

// ─── useBrain ─────────────────────────────────────────────────────────────────

// Team-shared Content Brain, persisted in Supabase (content_brain). Local state
// updates optimistically and writes through to the DB; localStorage is kept as
// an offline cache and as the source for a one-time migration into the DB.
function useBrain() {
  const [brain, set] = useState<ContentBrain>(EMPTY_BRAIN);
  const ready = useRef(false);

  function post(kind: string, text: string, data: unknown, incrementCount = false) {
    fetch('/api/content/brain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, text, data, incrementCount }),
    }).catch(() => {});
  }
  function del(kind: string, text: string) {
    fetch('/api/content/brain', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, text }),
    }).catch(() => {});
  }
  function upd(fn: (b: ContentBrain) => ContentBrain) {
    set(prev => { const next = fn(prev); try { localStorage.setItem(BRAIN_KEY, JSON.stringify(next)); } catch {} return next; });
  }

  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    (async () => {
      let dbBrain: ContentBrain | null = null;
      try { const r = await fetch('/api/content/brain'); if (r.ok) dbBrain = await r.json(); } catch {}
      let local: ContentBrain | null = null;
      try { const s = localStorage.getItem(BRAIN_KEY); if (s) local = JSON.parse(s); } catch {}

      const hasDb = !!dbBrain && (dbBrain.hooks.length || dbBrain.ideas.length || dbBrain.objections.length || dbBrain.mechanics.length);
      if (hasDb) {
        set(dbBrain!);
        try { localStorage.setItem(BRAIN_KEY, JSON.stringify(dbBrain)); } catch {}
      } else if (local) {
        // One-time migration: push existing localStorage brain up to the DB.
        set(local);
        for (const h of local.hooks) post('hook', h.text, { concept: h.concept });
        for (const i of local.ideas) post('idea', i.title, i);
        for (const o of local.objections) post('objection', o.text, { category: o.category });
        for (const m of local.mechanics) post('mechanic', m, null);
      } else if (dbBrain) {
        set(dbBrain);
      }
    })();
  }, []);

  return {
    brain,
    saveHook(text: string, concept?: string) {
      if (!text.trim()) return;
      upd(b => b.hooks.some(h => h.text === text) ? b : { ...b, hooks: [{ text, concept, ts: Date.now() }, ...b.hooks].slice(0, 50) });
      post('hook', text, { concept });
    },
    approveIdea(idea: Omit<SavedIdea, 'ts'>) {
      upd(b => ({ ...b, ideas: [{ ...idea, ts: Date.now() }, ...b.ideas].slice(0, 30) }));
      post('idea', idea.title, idea);
    },
    trackObjections(objections: Array<{ objection: string; category: string }>) {
      if (!objections?.length) return;
      upd(b => {
        const map = new Map(b.objections.map(o => [o.text.toLowerCase(), o]));
        for (const o of objections) {
          const key = o.objection.toLowerCase().trim();
          const ex = map.get(key);
          if (ex) map.set(key, { ...ex, count: ex.count + 1, last_seen: Date.now() });
          else map.set(key, { text: o.objection, category: o.category, count: 1, last_seen: Date.now() });
        }
        return { ...b, objections: [...map.values()].sort((a, c) => c.count - a.count).slice(0, 30) };
      });
      for (const o of objections) post('objection', o.objection, { category: o.category }, true);
    },
    saveMechanic(m: string) {
      if (!m.trim()) return;
      upd(b => b.mechanics.includes(m) ? b : { ...b, mechanics: [m, ...b.mechanics].slice(0, 20) });
      post('mechanic', m, null);
    },
    removeHook(i: number) { upd(b => { const t = b.hooks[i]?.text; if (t) del('hook', t); return { ...b, hooks: b.hooks.filter((_, j) => j !== i) }; }); },
    removeIdea(i: number) { upd(b => { const t = b.ideas[i]?.title; if (t) del('idea', t); return { ...b, ideas: b.ideas.filter((_, j) => j !== i) }; }); },
    removeMechanic(i: number) { upd(b => { const t = b.mechanics[i]; if (t) del('mechanic', t); return { ...b, mechanics: b.mechanics.filter((_, j) => j !== i) }; }); },
  };
}

// ─── Memory context builder ───────────────────────────────────────────────────

function buildMemory(brain: ContentBrain, task: TaskMode): string {
  if (!task) return '';
  const parts: string[] = [];
  if (task === 'generate-ideas') {
    if (brain.hooks.length)
      parts.push('SAVED HOOKS — SooWei approved these. Match this energy and style:\n' + brain.hooks.slice(0, 5).map(h => `• "${h.text}"`).join('\n'));
    if (brain.ideas.length)
      parts.push('PREVIOUSLY APPROVED IDEAS — use as calibration:\n' + brain.ideas.slice(0, 3).map(d => `• ${d.title}: "${d.hook}" (${d.overall}/5)`).join('\n'));
    if (brain.objections.length)
      parts.push('RECURRING SALES OBJECTIONS — at least 1 idea should address these:\n' + brain.objections.slice(0, 5).map(o => `• "${o.text}" (seen ${o.count}x, ${o.category})`).join('\n'));
    if (brain.mechanics.length)
      parts.push('PROVEN MECHANICS FROM ANALYZED REELS — use these frameworks:\n' + brain.mechanics.slice(0, 5).map(m => `• ${m}`).join('\n'));
  }
  if (task === 'review-script') {
    if (brain.hooks.length)
      parts.push('STRONG HOOKS FOR CALIBRATION:\n' + brain.hooks.slice(0, 3).map(h => `• "${h.text}"`).join('\n'));
  }
  return parts.join('\n\n');
}

// ─── Visual sub-components ────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(201,164,85,0.55)',
      textTransform: 'uppercase', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(201,164,85,0.08)', margin: '14px 0' }} />;
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  const pct = (score / 5) * 100;
  const color = score >= 4 ? '#4ade80' : score >= 3 ? G : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ fontSize: 11, color: Muted, minWidth: 130, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 16, textAlign: 'right', fontFamily: "'DM Sans', sans-serif" }}>{score}</span>
    </div>
  );
}

function Verdict({ v }: { v: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    'send-to-soowei': { label: '✓ Send to SooWei', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
    'needs-work':     { label: '⚠ Needs Work',     color: G,         bg: GB },
    'reject':         { label: '✗ Reject',          color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
    'closer-issue':   { label: '⚠ Closer Issue',    color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
    'lead-issue':     { label: '⚠ Lead Issue',      color: G,         bg: GB },
    'mixed':          { label: '⚠ Mixed',           color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  };
  const c = map[v] ?? { label: v, color: Muted, bg: 'rgba(255,255,255,0.05)' };
  return (
    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20,
      background: c.bg, color: c.color, fontSize: 11, fontWeight: 700,
      border: `1px solid ${c.color}30`, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.03em' }}>
      {c.label}
    </span>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${G}`, paddingLeft: 12, margin: '4px 0' }}>
      <span style={{ fontSize: 13, color: '#e8dcc8', fontStyle: 'italic',
        fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.6 }}>"{text}"</span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 2 }}>{children}</div>;
}

function SaveBtn({ onClick, saved, label }: { onClick: () => void; saved: boolean; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600,
      background: saved ? GB : 'rgba(255,255,255,0.04)',
      border: `1px solid ${saved ? GBorder : 'rgba(255,255,255,0.08)'}`,
      color: saved ? G : 'rgba(240,232,212,0.55)',
      cursor: saved ? 'default' : 'pointer',
      fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.04em',
      transition: 'all 0.15s ease',
    }}>
      {saved ? `✓ ${label} saved` : `＋ Save ${label}`}
    </button>
  );
}

function ThumbRow({ onApprove, onPass, approved }: { onApprove: () => void; onPass: () => void; approved: boolean | null }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <button onClick={onApprove} style={{
        padding: '4px 12px', borderRadius: 10, fontSize: 10, fontWeight: 600,
        background: approved === true ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${approved === true ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
        color: approved === true ? '#4ade80' : 'rgba(240,232,212,0.55)',
        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease',
      }}>
        {approved === true ? '✓ Approved' : '↑ Approve'}
      </button>
      <button onClick={onPass} style={{
        padding: '4px 12px', borderRadius: 10, fontSize: 10, fontWeight: 600,
        background: approved === false ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${approved === false ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.08)'}`,
        color: approved === false ? '#f87171' : 'rgba(240,232,212,0.55)',
        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease',
      }}>
        {approved === false ? '✗ Passed' : '↓ Pass'}
      </button>
    </div>
  );
}

const CRITERIA: Record<string, string> = {
  view_potential: 'View Potential', preselling_power: 'Pre-Selling',
  proven_concept: 'Proven Concept', icp_resonance: 'ICP Resonance',
  intrigue_payoff: 'Intrigue & Payoff', brand_alignment: 'Brand Alignment',
};

// ─── Transcript breakdown (clickable highlights) ──────────────────────────────

interface Highlight { quote: string; label?: string; why?: string; restructure?: string; }

function HighlightDetail({ h, showQuote }: { h: Highlight; showQuote?: boolean }) {
  return (
    <div style={{ marginTop: 10, background: GB, borderRadius: 8, padding: '10px 12px',
      border: `1px solid ${GBorder}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {showQuote && <div style={{ fontSize: 12, color: '#e8dcc8', fontStyle: 'italic', fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.5 }}>"{h.quote}"</div>}
      {h.label && <div style={{ fontSize: 11, fontWeight: 700, color: G, fontFamily: "'DM Sans', sans-serif" }}>{h.label}</div>}
      {h.why && <div style={{ fontSize: 12, color: Muted, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>{h.why}</div>}
      {h.restructure && <div style={{ fontSize: 11.5, color: '#c8c0b0', lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}><span style={{ color: G, fontWeight: 600 }}>Reuse it: </span>{h.restructure}</div>}
    </div>
  );
}

// Shows the actual transcript with the model's verbatim highlights as clickable
// spans; tapping one expands its plain-English breakdown. Replaces the old
// abstract "Layer Breakdown". Highlights it can't locate in the transcript are
// shown as cards underneath so nothing is lost.
function TranscriptBreakdown({ transcript, highlights }: { transcript?: string; highlights?: Highlight[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const hs = Array.isArray(highlights) ? highlights.filter((h) => h && h.quote) : [];
  if (!transcript && !hs.length) return null;

  type Hit = { start: number; end: number; i: number };
  const hits: Hit[] = [];
  if (transcript) {
    hs.forEach((h, i) => {
      const esc = h.quote.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (esc.length < 4) return;
      try {
        const m = new RegExp(esc, 'i').exec(transcript);
        if (m) hits.push({ start: m.index, end: m.index + m[0].length, i });
      } catch { /* skip unparseable quote */ }
    });
  }
  hits.sort((a, b) => a.start - b.start);
  const clean: Hit[] = [];
  let cursor = -1;
  for (const h of hits) { if (h.start >= cursor) { clean.push(h); cursor = h.end; } }
  const matched = new Set(clean.map((h) => h.i));
  const unmatched = hs.filter((_, i) => !matched.has(i));

  const segs: Array<{ text: string; i: number | null }> = [];
  if (transcript) {
    let pos = 0;
    for (const h of clean) {
      if (h.start > pos) segs.push({ text: transcript.slice(pos, h.start), i: null });
      segs.push({ text: transcript.slice(h.start, h.end), i: h.i });
      pos = h.end;
    }
    if (pos < transcript.length) segs.push({ text: transcript.slice(pos), i: null });
  }

  return (
    <>
      <Divider />
      <Section>
        <Label>{clean.length ? 'Transcript — tap a highlight' : 'Breakdown'}</Label>
        {transcript && (
          <div style={{ fontSize: 13, lineHeight: 1.95, color: '#c8c0b0', fontFamily: "'DM Sans', sans-serif",
            maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {segs.map((s, idx) => s.i === null
              ? <span key={idx}>{s.text}</span>
              : <span key={idx} onClick={() => setOpen(open === s.i ? null : s.i)}
                  style={{ background: open === s.i ? 'rgba(201,164,85,0.3)' : GB,
                    borderBottom: `1.5px solid ${G}`, borderRadius: 3, padding: '1px 2px',
                    cursor: 'pointer', color: '#f0e8d4', transition: 'background 0.15s ease' }}>{s.text}</span>
            )}
          </div>
        )}
        {open !== null && hs[open] && <HighlightDetail h={hs[open]} />}
        {unmatched.length > 0 && (
          <div style={{ marginTop: clean.length ? 12 : 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unmatched.map((h, i) => <HighlightDetail key={i} h={h} showQuote />)}
          </div>
        )}
      </Section>
    </>
  );
}

// Performance summary — only renders when the user supplied real stats.
function Performance({ p }: { p?: { summary?: string; engagement_rate?: string; verdict?: string } }) {
  if (!p || p.verdict === 'unknown' || p.summary === 'No data provided' || (!p.summary && !p.verdict)) return null;
  const v = (p.verdict || '').toLowerCase();
  const color = v === 'outlier' || v === 'strong' ? '#4ade80' : v === 'underperformed' ? '#f87171' : G;
  return (
    <>
      <Divider />
      <Section>
        <Label>Performance</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          {v && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            background: `${color}1a`, color, border: `1px solid ${color}40`, textTransform: 'uppercase',
            letterSpacing: '0.04em', fontFamily: "'DM Sans', sans-serif" }}>{v}</span>}
          {p.engagement_rate && p.engagement_rate !== 'n/a' && <span style={{ fontSize: 11, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>{p.engagement_rate} engagement</span>}
        </div>
        {p.summary && <div style={{ fontSize: 12, color: Muted, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>{p.summary}</div>}
      </Section>
    </>
  );
}

// ─── Brain Panel ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BrainPanel({ brain, on }: { brain: ContentBrain; on: ReturnType<typeof useBrain> }) {
  const [copied, setCopied] = useState<number | null>(null);

  function copyHook(text: string, i: number) {
    navigator.clipboard.writeText(text).then(() => { setCopied(i); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  }

  const totalItems = brain.hooks.length + brain.ideas.length + brain.objections.length + brain.mechanics.length;

  if (totalItems === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 32, gap: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>◈</div>
        <div style={{ fontSize: 13, color: Muted, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7 }}>
          Your Content Brain is empty.
        </div>
        <div style={{ fontSize: 11, color: 'rgba(168,158,138,0.5)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, maxWidth: 280 }}>
          Analyze reels to save hooks. Approve ideas to calibrate future generation. Run sales intel to track objections.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Hook Library */}
      {brain.hooks.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Label>Hook Library — {brain.hooks.length} saved</Label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {brain.hooks.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${GBorder}`,
                borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
                transition: 'background 0.15s ease' }}
                onClick={() => copyHook(h.text, i)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,164,85,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: '#e8dcc8', fontFamily: "'Cormorant Garamond', serif",
                    fontStyle: 'italic', lineHeight: 1.6 }}>"{h.text}"</span>
                  {h.concept && (
                    <div style={{ fontSize: 10, color: 'rgba(168,158,138,0.5)', marginTop: 2,
                      fontFamily: "'DM Sans', sans-serif" }}>{h.concept}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: copied === i ? '#4ade80' : 'rgba(168,158,138,0.4)',
                    fontFamily: "'DM Sans', sans-serif", transition: 'color 0.2s' }}>
                    {copied === i ? '✓ copied' : 'click to copy'}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); on.removeHook(i); }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(248,113,113,0.3)', fontSize: 12, padding: '0 2px',
                    transition: 'color 0.15s ease', lineHeight: 1,
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.7)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.3)')}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved Ideas */}
      {brain.ideas.length > 0 && (
        <div>
          <Label>Approved Ideas — {brain.ideas.length} saved</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {brain.ideas.map((idea, i) => (
              <div key={i} style={{ border: `1px solid rgba(74,222,128,0.12)`,
                borderRadius: 8, padding: '10px 12px', background: 'rgba(74,222,128,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8',
                      fontFamily: "'DM Sans', sans-serif" }}>{idea.title}</span>
                    <span style={{ fontSize: 9, background: GB, color: G, padding: '1px 7px',
                      borderRadius: 8, marginLeft: 7, fontFamily: "'DM Sans', sans-serif" }}>{idea.format}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80',
                      fontFamily: "'DM Sans', sans-serif" }}>{Number(idea.overall).toFixed(1)}</span>
                    <button onClick={() => on.removeIdea(i)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(248,113,113,0.3)', fontSize: 12, padding: '0 2px',
                      transition: 'color 0.15s ease', lineHeight: 1,
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.7)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.3)')}>✕</button>
                  </div>
                </div>
                {idea.hook && (
                  <div style={{ fontSize: 11, color: Muted, fontStyle: 'italic',
                    fontFamily: "'Cormorant Garamond', serif" }}>"{idea.hook}"</div>
                )}
                {idea.why && (
                  <div style={{ fontSize: 10, color: 'rgba(168,158,138,0.5)', marginTop: 4,
                    fontFamily: "'DM Sans', sans-serif" }}>{idea.why}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Objection Tracker */}
      {brain.objections.length > 0 && (
        <div>
          <Label>Objection Tracker — {brain.objections.reduce((sum, o) => sum + o.count, 0)} total across {brain.objections.length} unique</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {brain.objections.map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${GBorder}` }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%',
                  background: o.count >= 3 ? 'rgba(248,113,113,0.15)' : GB,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: o.count >= 3 ? '#f87171' : G,
                  fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                  {o.count}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#e8dcc8', fontFamily: "'DM Sans', sans-serif" }}>{o.text}</div>
                </div>
                <span style={{ fontSize: 9, background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  padding: '1px 7px', borderRadius: 8, flexShrink: 0,
                  fontFamily: "'DM Sans', sans-serif" }}>{o.category}</span>
              </div>
            ))}
          </div>
          {brain.objections.some(o => o.count >= 2) && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(168,158,138,0.5)',
              fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
              💡 Run <strong style={{ color: Muted }}>Generate Ideas</strong> — the system will automatically create content to address your top objections.
            </div>
          )}
        </div>
      )}

      {/* Proven Mechanics */}
      {brain.mechanics.length > 0 && (
        <div>
          <Label>Proven Mechanics — {brain.mechanics.length} saved</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {brain.mechanics.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 10, fontSize: 11,
                background: GB, border: `1px solid ${GBorder}`, color: '#e8dcc8',
                fontFamily: "'DM Sans', sans-serif" }}>
                {m}
                <button onClick={() => on.removeMechanic(i)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(248,113,113,0.35)', fontSize: 11, padding: 0, lineHeight: 1, marginLeft: 2,
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.7)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(248,113,113,0.35)')}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task result renderers ────────────────────────────────────────────────────

interface BrainCbs {
  saveHook: (t: string, concept?: string) => void;
  approveIdea: (idea: Omit<SavedIdea, 'ts'>) => void;
  trackObjections: (o: Array<{ objection: string; category: string }>) => void;
  saveMechanic: (m: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AnalyzeReelResult({ r, cbs }: { r: any; cbs: BrainCbs }) {
  const [hookSaved, setHookSaved] = useState(false);
  const [savedMechanics, setSavedMechanics] = useState<Set<string>>(new Set());

  function doSaveHook() {
    if (hookSaved || !r.hook) return;
    cbs.saveHook(r.hook, r.underlying_pattern);
    setHookSaved(true);
  }

  function doSaveMechanic(m: string) {
    if (savedMechanics.has(m)) return;
    cbs.saveMechanic(m);
    setSavedMechanics(prev => new Set([...prev, m]));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {r.hook && (
        <Section>
          <Label>Hook</Label>
          <Quote text={r.hook} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            {r.overall_score > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: G, fontFamily: "'DM Sans', sans-serif" }}>{Number(r.overall_score).toFixed(1)}</span>
                <span style={{ fontSize: 12, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>/5 overall</span>
              </div>
            )}
            <SaveBtn onClick={doSaveHook} saved={hookSaved} label="hook" />
          </div>
        </Section>
      )}

      <Performance p={r.performance} />

      {r.scores && Object.values(r.scores).some((v) => Number(v) > 0) && (
        <>
          <Divider />
          <Section>
            <Label>Scores</Label>
            {Object.entries(r.scores).map(([k, v]) => (
              <ScoreRow key={k} label={CRITERIA[k] ?? k} score={Number(v)} />
            ))}
          </Section>
        </>
      )}

      <TranscriptBreakdown transcript={r.transcript} highlights={r.highlights} />
      {/* Back-compat: older responses returned `layers` instead of `highlights`. */}
      {!r.highlights && Array.isArray(r.layers) && r.layers.length > 0 && (
        <TranscriptBreakdown
          transcript={r.transcript}
          highlights={r.layers.map((l: { name: string; what: string; why: string; mechanic: string }) => ({
            quote: l.what, label: l.name, why: l.why, restructure: l.mechanic,
          }))}
        />
      )}

      {Array.isArray(r.master_mechanics) && r.master_mechanics.length > 0 && (
        <>
          <Divider />
          <Section>
            <Label>Master Mechanics</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {r.master_mechanics.map((m: string, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 10, fontSize: 11,
                  background: savedMechanics.has(m) ? GB : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${savedMechanics.has(m) ? GBorder : 'rgba(255,255,255,0.08)'}`,
                  color: savedMechanics.has(m) ? G : '#e8dcc8',
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', transition: 'all 0.15s ease',
                }}
                  onClick={() => doSaveMechanic(m)}
                  title={savedMechanics.has(m) ? 'Saved to Brain' : 'Click to save mechanic'}>
                  {savedMechanics.has(m) ? '✓ ' : '＋ '}{m}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(168,158,138,0.4)', marginTop: 5,
              fontFamily: "'DM Sans', sans-serif" }}>Click a mechanic to save it to your Brain</div>
          </Section>
        </>
      )}

      {r.underlying_pattern && (
        <>
          <Divider />
          <Section>
            <Label>The Pattern</Label>
            <div style={{ background: GB, borderRadius: 8, padding: '10px 14px',
              border: `1px solid rgba(201,164,85,0.25)`, fontSize: 13, color: '#e8dcc8',
              lineHeight: 1.7, fontFamily: "'DM Sans', sans-serif" }}>
              {r.underlying_pattern}
            </div>
          </Section>
        </>
      )}

      {Array.isArray(r.replication_angles) && r.replication_angles.length > 0 && (
        <>
          <Divider />
          <Section>
            <Label>Replication Ideas</Label>
            {r.replication_angles.map((a: { title: string; hook: string }, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8', marginBottom: 4,
                  fontFamily: "'DM Sans', sans-serif" }}>→ {a.title}</div>
                {a.hook && <Quote text={a.hook} />}
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AnalyzeYTResult({ r, cbs }: { r: any; cbs: BrainCbs }) {
  const [savedClips, setSavedClips] = useState<Set<number>>(new Set());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {r?.one_line_verdict && (
        <Section>
          <Label>Verdict</Label>
          <div style={{ fontSize: 13, color: '#e8dfc8', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, marginBottom: r?.overall_score > 0 ? 8 : 0 }}>{r.one_line_verdict}</div>
          {r?.overall_score > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: G, fontFamily: "'DM Sans', sans-serif" }}>{Number(r.overall_score).toFixed(1)}</span>
              <span style={{ fontSize: 12, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>/5 overall</span>
            </div>
          )}
        </Section>
      )}

      <Performance p={r?.performance} />

      {r?.scores && Object.values(r.scores).some((v) => Number(v) > 0) && (
        <><Divider /><Section><Label>Scores</Label>
          {Object.entries(r.scores).map(([k, v]) => (
            <ScoreRow key={k} label={CRITERIA[k] ?? k} score={Number(v)} />
          ))}
        </Section></>
      )}

      {r?.content_strategy_notes && (
        <><Divider /><Section>
          <Label>Funnel Role</Label>
          <div style={{ fontSize: 12, color: Muted, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>{r.content_strategy_notes}</div>
        </Section></>
      )}

      {r?.structure?.length > 0 && (
        <><Divider /><Section><Label>Video Structure</Label>
          {r.structure.map((s: { section: string; timestamp_approx?: string; what_happens: string; retention_mechanic: string }, i: number) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < r.structure.length - 1 ? `1px solid rgba(201,164,85,0.08)` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: G, fontFamily: "'DM Sans', sans-serif" }}>{s.section}</span>
                {s.timestamp_approx && <span style={{ fontSize: 10, color: Muted, fontFamily: "'DM Mono', monospace" }}>{s.timestamp_approx}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#c8c0b0', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, marginBottom: 3 }}>{s.what_happens}</div>
              <div style={{ fontSize: 11, color: Muted, fontFamily: "'DM Sans', sans-serif", fontStyle: 'italic' }}>{s.retention_mechanic}</div>
            </div>
          ))}
        </Section></>
      )}

      <TranscriptBreakdown transcript={r?.transcript} highlights={r?.highlights} />

      {r?.reel_clips?.length > 0 && (
        <><Divider /><Section><Label>Reel Clips to Extract</Label>
          {r.reel_clips.map((c: { hook: string; timestamp_range?: string; source_moment?: string; title?: string; score?: string; checks_passed?: string[]; why?: string }, i: number) => {
            const score = c.score || '';
            const scoreColor = score.startsWith('3') ? '#4ade80' : score.startsWith('2') ? G : Muted;
            return (
              <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < r.reel_clips.length - 1 ? `1px solid rgba(201,164,85,0.08)` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: Muted, fontFamily: "'DM Mono', monospace" }}>{c.timestamp_range || c.source_moment || ''}</span>
                  {score && <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, background: `${scoreColor}1a`,
                    border: `1px solid ${scoreColor}40`, borderRadius: 20, padding: '2px 9px', fontFamily: "'DM Sans', sans-serif" }}>
                    {score.startsWith('3') ? '✅ ' : '⚠️ '}{score}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", marginBottom: 5 }}>"{c.hook || c.title}"</div>
                {Array.isArray(c.checks_passed) && c.checks_passed.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {c.checks_passed.map((chk, j) => (
                      <span key={j} style={{ fontSize: 9.5, color: G, background: GB, border: `1px solid ${GBorder}`,
                        borderRadius: 10, padding: '2px 8px', fontFamily: "'DM Sans', sans-serif" }}>✓ {chk}</span>
                    ))}
                  </div>
                )}
                {c.why && <div style={{ fontSize: 11.5, color: Muted, lineHeight: 1.55, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{c.why}</div>}
                <SaveBtn label="Save Hook" saved={savedClips.has(i)} onClick={() => { cbs.saveHook(c.hook || c.title || '', c.why); setSavedClips(p => new Set([...p, i])); }} />
              </div>
            );
          })}
        </Section></>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReviewScriptResult({ r }: { r: any }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Label>Verdict</Label>
          {r.verdict && <Verdict v={r.verdict} />}
        </div>
        {r.overall && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: Muted, letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>Score</div>
            <span style={{ fontSize: 26, fontWeight: 700, color: G, fontFamily: "'DM Sans', sans-serif" }}>{Number(r.overall).toFixed(1)}</span>
            <span style={{ fontSize: 11, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>/5</span>
          </div>
        )}
      </div>

      {r.scores && (
        <>
          <Divider />
          <Label>Scores</Label>
          {Object.entries(r.scores).map(([k, v]) => {
            const score = typeof v === 'object' && v !== null ? (v as { score: number }).score : Number(v);
            const note  = typeof v === 'object' && v !== null ? (v as { note?: string }).note : undefined;
            return (
              <div key={k}>
                <ScoreRow label={CRITERIA[k] ?? k} score={score} />
                {note && <div style={{ fontSize: 10, color: 'rgba(168,158,138,0.5)', paddingLeft: 142,
                  marginTop: -4, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{note}</div>}
              </div>
            );
          })}
        </>
      )}

      {r.what_works && (
        <><Divider /><Section><Label>What Works</Label>
          <p style={{ fontSize: 12, color: Muted, lineHeight: 1.75, margin: 0,
            fontFamily: "'DM Sans', sans-serif" }}>{r.what_works}</p>
        </Section></>
      )}

      {r.what_to_fix && (
        <><Divider /><Section><Label>What to Fix</Label>
          <p style={{ fontSize: 12, color: Muted, lineHeight: 1.75, margin: 0,
            fontFamily: "'DM Sans', sans-serif" }}>{r.what_to_fix}</p>
        </Section></>
      )}

      {(r.revised_hook || r.revised_close) && (
        <><Divider />
          <Section>
            <Label>Stronger Version</Label>
            {r.revised_hook && <><div style={{ fontSize: 10, color: G, marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>Hook</div><Quote text={r.revised_hook} /></>}
            {r.revised_close && <><div style={{ fontSize: 10, color: G, margin: '10px 0 4px', fontFamily: "'DM Sans', sans-serif" }}>Close</div><Quote text={r.revised_close} /></>}
          </Section>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GenerateIdeasResult({ r, cbs }: { r: any; cbs: BrainCbs }) {
  const [ratings, setRatings] = useState<Record<number, boolean | null>>({});
  const [hookSaved, setHookSaved] = useState<Record<number, boolean>>({});

  function rate(i: number, approved: boolean) {
    if (ratings[i] !== undefined) return;
    setRatings(prev => ({ ...prev, [i]: approved }));
    const idea = r.ideas?.[i];
    if (approved && idea) {
      cbs.approveIdea({ title: idea.title, hook: idea.hook, concept: idea.concept,
        format: idea.format, overall: idea.overall, why: idea.why_it_works });
    }
  }

  function saveHook(i: number) {
    if (hookSaved[i]) return;
    const idea = r.ideas?.[i];
    if (idea?.hook) {
      cbs.saveHook(idea.hook, idea.title);
      setHookSaved(prev => ({ ...prev, [i]: true }));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(r.ideas ?? []).map((idea: {
        title: string; concept: string; hook: string; format: string;
        overall: number; why_it_works: string; scores: Record<string, number>
      }, i: number) => (
        <div key={i} style={{
          border: `1px solid ${ratings[i] === true ? 'rgba(74,222,128,0.25)' : ratings[i] === false ? 'rgba(248,113,113,0.15)' : GBorder}`,
          borderRadius: 10, padding: '14px 16px',
          background: ratings[i] === true ? 'rgba(74,222,128,0.03)' : 'transparent',
          transition: 'border-color 0.2s ease, background 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8dcc8', marginBottom: 4,
                fontFamily: "'DM Sans', sans-serif" }}>{idea.title}</div>
              <span style={{ fontSize: 9, background: GB, color: G, padding: '2px 8px',
                borderRadius: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{idea.format}</span>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: G, fontFamily: "'DM Sans', sans-serif" }}>{Number(idea.overall).toFixed(1)}</span>
              <span style={{ fontSize: 10, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>/5</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: Muted, lineHeight: 1.7, margin: '0 0 10px',
            fontFamily: "'DM Sans', sans-serif" }}>{idea.concept}</p>
          {idea.hook && <Quote text={idea.hook} />}
          {idea.why_it_works && (
            <div style={{ marginTop: 8, fontSize: 11, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>
              <span style={{ color: G, fontWeight: 600 }}>Why it works: </span>{idea.why_it_works}
            </div>
          )}
          {idea.scores && (
            <><Divider />
              {Object.entries(idea.scores).map(([k, v]) => (
                <ScoreRow key={k} label={CRITERIA[k] ?? k} score={Number(v)} />
              ))}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
            <ThumbRow onApprove={() => rate(i, true)} onPass={() => rate(i, false)} approved={ratings[i] ?? null} />
            {idea.hook && <SaveBtn onClick={() => saveHook(i)} saved={!!hookSaved[i]} label="hook" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SalesIntelResult({ r, cbs }: { r: any; cbs: BrainCbs }) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    if (Array.isArray(r.objections) && r.objections.length > 0) {
      cbs.trackObjections(r.objections.map((o: { objection: string; category: string }) => ({
        objection: o.objection, category: o.category,
      })));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <Label>Verdict</Label>
          {r.verdict && <Verdict v={r.verdict} />}
        </div>
        {r.close_likelihood && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: Muted, letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>Close Likelihood</div>
            <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              color: r.close_likelihood >= 7 ? '#4ade80' : r.close_likelihood >= 5 ? G : '#f87171' }}>
              {r.close_likelihood}
            </span>
            <span style={{ fontSize: 11, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>/10</span>
          </div>
        )}
      </div>
      {r.verdict_reason && (
        <p style={{ fontSize: 12, color: Muted, lineHeight: 1.75, margin: '0 0 4px',
          fontFamily: "'DM Sans', sans-serif" }}>{r.verdict_reason}</p>
      )}

      {Array.isArray(r.objections) && r.objections.length > 0 && (
        <>
          <Divider />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Label>Objections</Label>
            <span style={{ fontSize: 9, color: '#4ade80', fontFamily: "'DM Sans', sans-serif",
              background: 'rgba(74,222,128,0.08)', padding: '2px 8px', borderRadius: 8 }}>
              ✓ Added to Brain
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.objections.map((o: { objection: string; category: string; better_response?: string }, i: number) => (
              <div key={i} style={{ border: `1px solid ${GBorder}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: o.better_response ? 8 : 0 }}>
                  <span style={{ fontSize: 9, background: 'rgba(248,113,113,0.1)', color: '#f87171',
                    padding: '2px 7px', borderRadius: 8, fontWeight: 700, flexShrink: 0,
                    fontFamily: "'DM Sans', sans-serif" }}>{o.category}</span>
                  <span style={{ fontSize: 12, color: '#e8dcc8', fontFamily: "'DM Sans', sans-serif" }}>{o.objection}</span>
                </div>
                {o.better_response && (
                  <div style={{ background: GB, borderRadius: 6, padding: '6px 10px',
                    borderLeft: `2px solid ${G}`, fontSize: 11, color: '#e8dcc8',
                    fontFamily: "'DM Sans', sans-serif" }}>
                    <span style={{ color: G, fontWeight: 600 }}>Better: </span>{o.better_response}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {r.summary && (
        <><Divider /><Section><Label>Summary</Label>
          <p style={{ fontSize: 12, color: Muted, lineHeight: 1.75, margin: 0,
            fontFamily: "'DM Sans', sans-serif" }}>{r.summary}</p>
        </Section></>
      )}

      {Array.isArray(r.content_angles) && r.content_angles.length > 0 && (
        <>
          <Divider /><Section><Label>Content to Film</Label>
            {r.content_angles.map((a: { angle: string; format: string }, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ color: G, flexShrink: 0, marginTop: 1 }}>→</span>
                <span style={{ fontSize: 12, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>
                  {a.angle}
                  <span style={{ fontSize: 9, color: G, background: GB, padding: '1px 6px',
                    borderRadius: 8, marginLeft: 6 }}>{a.format}</span>
                </span>
              </div>
            ))}
          </Section>
        </>
      )}

      {r.action_items && (
        <>
          <Divider /><Section><Label>Action Items</Label>
            {Object.entries(r.action_items as Record<string, string[]>).map(([cat, items]) =>
              Array.isArray(items) && items.length > 0 ? (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: G, fontWeight: 600, textTransform: 'capitalize',
                    marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>{cat.replace(/_/g, ' ')}</div>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 3 }}>
                      <span style={{ color: G, flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: 12, color: Muted, fontFamily: "'DM Sans', sans-serif" }}>{item}</span>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TaskResultRenderer({ task, data, cbs }: { task: string; data: any; cbs: BrainCbs }) {
  const blocked = data?._blocked || data?.raw || (task === 'analyze-reel' && data?.overall_score === 0 && !data?.hook);
  if (blocked) {
    const rawMsg: string = data?._message ?? 'Content not accessible. Paste the script or caption text directly.';
    const platform: string | undefined = data?._platform;
    // Render line breaks in the message
    const lines = rawMsg.split('\n');
    return (
      <div style={{ background: GB, borderRadius: 10, padding: '14px 16px',
        border: `1px solid rgba(201,164,85,0.25)` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: G, marginBottom: 8,
          fontFamily: "'DM Sans', sans-serif" }}>⚠ {platform ? `${platform} detected` : 'Content not accessible'}</div>
        <div style={{ fontSize: 12, color: Muted, lineHeight: 1.8, fontFamily: "'DM Sans', sans-serif" }}>
          {lines.map((line, i) => <div key={i}>{line || <br />}</div>)}
        </div>
        {platform === 'Instagram' && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <a href="https://snapinsta.app" target="_blank" rel="noreferrer" style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700,
              background: GB, border: `1px solid ${GBorder}`, color: G,
              textDecoration: 'none', fontFamily: "'DM Sans', sans-serif",
            }}>Open SnapInsta →</a>
            <a href="https://snaptik.app" target="_blank" rel="noreferrer" style={{
              padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: Muted, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif",
            }}>Open SnapTik →</a>
          </div>
        )}
      </div>
    );
  }

  if (task === 'analyze-reel')   return <AnalyzeReelResult r={data} cbs={cbs} />;
  if (task === 'analyze-yt')     return <AnalyzeYTResult r={data} cbs={cbs} />;
  if (task === 'review-script')  return <ReviewScriptResult r={data} />;
  if (task === 'generate-ideas') return <GenerateIdeasResult r={data} cbs={cbs} />;
  if (task === 'sales-intel')    return <SalesIntelResult r={data} cbs={cbs} />;
  return null;
}

// ─── Chat message type ────────────────────────────────────────────────────────

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sops?: { badge: string; title: string; group: string }[];
  modules?: { title: string }[];
  resources?: { slug: string; title: string }[];
  recordings?: { id: string; title: string }[];
  taskData?: { task: string; result: unknown };
}

// ─── Resource popup ───────────────────────────────────────────────────────────
// Opens an in-app resource (offer doc, product market fit, etc.) the bot linked,
// rendered in a popup over the chat — no need to leave /select.
function ResourcePopup({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [resource, setResource] = useState<Resource | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/resources/${slug}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.resource) setResource(d.resource); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,5,4,0.66)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 40px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(20,16,9,0.97)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(201,164,85,0.14)', flexShrink: 0 }}>
          <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.2rem', fontWeight: 300, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource?.title ?? 'Loading…'}</span>
          <button onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, cursor: 'pointer', flexShrink: 0, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22 }}>
          {resource ? <ResourceInline resource={resource} /> : (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading resource…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AssistantPage() {
  const router = useRouter();
  const [authed, setAuthed]       = useState(false);
  const [visible, setVisible]     = useState(false);
  const [messages, setMessages]   = useState<ChatMsg[]>([]);
  const [resourceSlug, setResourceSlug] = useState<string | null>(null); // open resource popup
  const [input, setInput]         = useState('');
  const [visuals, setVisuals]     = useState('');
  const [stats, setStats]         = useState({ views: '', likes: '', comments: '', shares: '', saves: '' });
  const [awaitingContext, setAwaitingContext] = useState(false);
  const pendingReview = useRef<string>(''); // script held while we ask the client for context
  const [loading, setLoading]     = useState(false);
  const [focused, setFocused]     = useState(false);
  const [taskMode, setTaskMode]   = useState<TaskMode>(null);
  const [showBrain, setShowBrain]           = useState(false);
  const [showTools, setShowTools]           = useState(true); // task tools shown by default
  const [conversations, setConversations]   = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [typing, setTyping]                 = useState(false);
  const [offerStatus, setOfferStatus] = useState<'idle' | 'uploading' | 'removing' | 'done' | 'error'>('idle');
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chatConvId = useRef<string | null>(null); // content-bot conversation thread (persisted)
  const offerFileRef = useRef<HTMLInputElement>(null);
  const streamAbort = useRef<AbortController | null>(null);

  const uploadOffer = async (file: File) => {
    setOfferStatus('uploading');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/me/content-context/upload', { method: 'POST', body: fd }).catch(() => null);
    setOfferStatus(res && res.ok ? 'done' : 'error');
    if (offerFileRef.current) offerFileRef.current.value = '';
  };
  // Attaching the wrong PDF used to be permanent — it stayed as the bot's context
  // with nothing to undo it.
  const removeOffer = async () => {
    setOfferStatus('removing');
    const res = await fetch('/api/me/content-context/upload', { method: 'DELETE' }).catch(() => null);
    setOfferStatus(res && res.ok ? 'idle' : 'error');
  };
  const brainHooks = useBrain();
  const { brain } = brainHooks;

  const brainCount = brain.hooks.length + brain.ideas.length + brain.objections.length + brain.mechanics.length;

  const cbs: BrainCbs = {
    saveHook: brainHooks.saveHook,
    approveIdea: brainHooks.approveIdea,
    trackObjections: brainHooks.trackObjections,
    saveMechanic: brainHooks.saveMechanic,
  };

  useEffect(() => {
    setAuthed(true);
    setTimeout(() => setVisible(true), 120);
    loadConversations();
    // Restore this user's own saved chat history (per-account, persists across
    // visits) and resume the same conversation thread.
    fetch('/api/chat/history', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.conversationId) chatConvId.current = d.conversationId;
        if (Array.isArray(d?.messages) && d.messages.length) {
          setMessages(d.messages.map((m: { role: 'user' | 'assistant'; content: string; sops?: { badge: string; title: string; group: string }[]; modules?: { title: string }[]; resources?: { slug: string; title: string }[]; recordings?: { id: string; title: string }[] }) => ({
            role: m.role,
            content: m.content,
            sops: Array.isArray(m.sops) ? m.sops : [],
            modules: Array.isArray(m.modules) ? m.modules : [],
            resources: Array.isArray(m.resources) ? m.resources : [],
            recordings: Array.isArray(m.recordings) ? m.recordings : [],
          })));
          // Load history silently into state — don't auto-open the chat overlay.
          // It surfaces only when the client uses the chat (sends a message) or
          // taps the "Open conversation" button below.
        }
      })
      .catch(() => {});
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        // New clients must finish onboarding before reaching the assistant.
        if (u && u.role !== 'admin') {
          fetch('/api/me/onboarding', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((ob) => { if (ob && !ob.onboardedAt) router.replace('/onboarding'); })
            .catch(() => {});
          // Warm this client's content context (onboarding docs + roadmap) so
          // the scripting bot tailors reviews to them. The reply also tells us
          // whether a document is already attached, so the remove option shows
          // on a return visit rather than only right after an upload.
          fetch('/api/me/content-context', { method: 'POST' })
            .then((r) => (r.ok ? r.json() : null))
            .then((c) => { if (c?.hasOffer) setOfferStatus('done'); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showBrain && overlayRef.current) overlayRef.current.scrollTop = overlayRef.current.scrollHeight;
  }, [messages, loading, showBrain]);

  // Chat now lives persistently in the main column — no overlay to open/close.
  function openOverlay() { /* no-op: chat is always visible */ }

  const loadConversations = () =>
    fetch('/api/chat/conversations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.conversations)) setConversations(d.conversations); })
      .catch(() => {});

  function newChat() {
    streamAbort.current?.abort();
    setMessages([]); chatConvId.current = null;
    setTaskMode(null); setShowBrain(false); setShowTools(false);
    setInput(''); setTyping(false); setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function loadConversation(id: string) {
    setShowBrain(false);
    if (id === chatConvId.current) return;
    const r = await fetch(`/api/chat/conversations/${id}`, { cache: 'no-store' }).catch(() => null);
    if (!r || !r.ok) return;
    const d = await r.json().catch(() => null);
    if (!d?.messages) return;
    streamAbort.current?.abort();
    setTyping(false); setTaskMode(null);
    chatConvId.current = d.id;
    setMessages(d.messages.map((m: { role: 'user' | 'assistant'; content: string; meta?: { sops?: unknown[]; modules?: unknown[]; resources?: unknown[]; recordings?: unknown[] } | null }) => ({
      role: m.role,
      content: m.content,
      sops: Array.isArray(m.meta?.sops) ? m.meta!.sops : [],
      modules: Array.isArray(m.meta?.modules) ? m.meta!.modules : [],
      resources: Array.isArray(m.meta?.resources) ? m.meta!.resources : [],
      recordings: Array.isArray(m.meta?.recordings) ? m.meta!.recordings : [],
    })));
  }

  async function deleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    if (id === chatConvId.current) newChat();
    loadConversations();
  }

  function selectTask(id: TaskMode) {
    setTaskMode(taskMode === id ? null : id);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function send() {
    const text = input.trim();
    if (taskMode !== 'generate-ideas' && !text) return;
    if (loading) return;

    const displayText = text || '(generate ideas)';
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: displayText }]);
    setInput('');
    setLoading(true);
    openOverlay();
    setShowBrain(false);

    try {
      if (taskMode) {
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        const memoryCtx = buildMemory(brain, taskMode);
        const isAnalyze = taskMode === 'analyze-reel' || taskMode === 'analyze-yt';

        // Only send stats that were actually filled in.
        const filledStats = Object.fromEntries(
          Object.entries(stats).filter(([, v]) => String(v).trim() !== '')
        );

        // If the bot just asked this client for business context, treat THIS
        // message as that context: save it, then re-run the pending review.
        const savingContext = awaitingContext && taskMode === 'review-script';
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: taskMode,
            input: savingContext ? pendingReview.current : (isUrl ? '' : text),
            url: savingContext ? '' : (isUrl ? text : ''),
            context: memoryCtx || undefined,
            visuals: isAnalyze && visuals.trim() ? visuals.trim() : undefined,
            stats: isAnalyze && Object.keys(filledStats).length ? filledStats : undefined,
            saveContext: savingContext ? text : undefined,
          }),
        });
        setVisuals('');
        setStats({ views: '', likes: '', comments: '', shares: '', saves: '' });
        if (savingContext) { setAwaitingContext(false); pendingReview.current = ''; }

        let data: { task?: string; result?: unknown; error?: string };
        try { data = await res.json(); } catch { data = { error: 'Parse error' }; }

        const result = data.result as { _needs_context?: boolean; _message?: string } | undefined;

        if (!res.ok || data.error) {
          setMessages((prev) => [...prev, { role: 'assistant', content: data.error ?? 'Something went wrong.' }]);
        } else if (result?._needs_context) {
          // Bot needs the client's business context — render the ask as a plain
          // message and remember the script so the next message re-runs it.
          pendingReview.current = text;
          setAwaitingContext(true);
          setMessages((prev) => [...prev, { role: 'assistant', content: result._message ?? '' }]);
        } else if (data.task === 'chat') {
          // Conversational fallback — render as plain message
          const msg = (data.result as { message?: string })?.message ?? '';
          setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
        } else {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: '',
            taskData: { task: data.task ?? taskMode, result: data.result },
          }]);
        }
        setLoading(false);

      } else {
        streamAbort.current?.abort();
        const abort = new AbortController();
        streamAbort.current = abort;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, conversationId: chatConvId.current }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => null);
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: err?.error === 'API key not configured'
              ? "API key isn't set up yet — let SooWei know."
              : "Hey, give that one another shot — should work now.",
            sops: [], modules: [],
          }]);
          setLoading(false);
          return;
        }

        // The reply streams in as it's written. Show the bubble the moment the
        // first words land rather than sitting on a spinner for the whole answer.
        setMessages((prev) => [...prev, { role: 'assistant', content: '', sops: [], modules: [], resources: [], recordings: [] }]);
        setLoading(false);
        setTyping(true);

        const replaceLast = (m: ChatMsg) =>
          setMessages((prev) => {
            if (!prev.length) return prev; // thread was cleared mid-stream
            const copy = [...prev];
            copy[copy.length - 1] = m;
            return copy;
          });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let live = '';
        let settled = false;

        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // SSE frames are separated by a blank line; keep any partial tail.
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
              const line = frame.split('\n').find((l) => l.startsWith('data: '));
              if (!line) continue;
              let evt: { t?: string; v?: string; answer?: string; sops?: unknown[]; modules?: unknown[]; resources?: unknown[]; recordings?: unknown[]; conversationId?: string };
              try { evt = JSON.parse(line.slice(6)); } catch { continue; }

              if (evt.t === 'delta') {
                live += evt.v ?? '';
                replaceLast({ role: 'assistant', content: live, sops: [], modules: [], resources: [], recordings: [] });
              } else if (evt.t === 'done') {
                settled = true;
                // Render the server's final text verbatim, so what's on screen
                // always matches what got saved to the thread.
                replaceLast({
                  role: 'assistant',
                  content: evt.answer ?? live,
                  sops: (evt.sops ?? []) as ChatMsg['sops'],
                  modules: (evt.modules ?? []) as ChatMsg['modules'],
                  resources: (evt.resources ?? []) as ChatMsg['resources'],
                  recordings: (evt.recordings ?? []) as ChatMsg['recordings'],
                });
                if (evt.conversationId) {
                  chatConvId.current = evt.conversationId;
                  setTimeout(loadConversations, 400);
                }
              }
            }
          }
        } catch {
          // Connection dropped — keep whatever already arrived.
        }

        // Stream ended without a 'done' frame (dropped connection, tab sleep).
        if (!settled) {
          replaceLast({
            role: 'assistant',
            content: live
              ? `${live}\n\nThat one got cut off — ask me again and I'll finish the thought.`
              : "Hey, give that one another shot — should work now.",
            sops: [], modules: [], resources: [], recordings: [],
          });
        }
        setTyping(false);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Give that another shot — should work now." }]);
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  if (!authed) return null;

  const currentHint = TASK_MODES.find((t) => t.id === taskMode)?.hint ?? 'Ask SooWei anything…';

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#060504', display: 'flex' }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:.2} 50%{opacity:.9} }
        textarea::placeholder, input::placeholder { color: rgba(240,232,212,0.28) !important; }
        button:focus { outline: none; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.15); border-radius: 2px; }
      `}</style>

      <MeshBg speed={0.3} />

      {/* ── Sidebar ── */}
      <aside style={{ position: 'relative', zIndex: 5, width: 264, flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(8,6,4,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(201,164,85,0.1)' }}>

        {/* Logo + company name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px 16px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/onboarding/goh-logo.png" alt="VTC" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="font-serif" style={{ fontSize: '1.05rem', fontWeight: 400, color: '#f0e8d4', lineHeight: 1.05 }}>VTC</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.55)', marginTop: 3 }}>VTC Advisor</div>
          </div>
        </div>

        {/* New chat */}
        <button onClick={newChat}
          style={{ margin: '0 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
            background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', color: G,
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.02em', transition: 'background 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,164,85,0.16)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(201,164,85,0.1)')}>
          <span style={{ fontSize: 17, lineHeight: 1, marginTop: -1 }}>+</span> New chat
        </button>

        {/* History */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 10px 10px' }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(201,164,85,0.7)', padding: '6px 8px 8px' }}>Recent</div>
          {conversations.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(240,232,212,0.25)', padding: '2px 8px', fontFamily: "'DM Sans', sans-serif" }}>No chats yet.</div>
          )}
          {conversations.map((c) => {
            const active = c.id === chatConvId.current;
            return (
              <div key={c.id} onClick={() => loadConversation(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 9px', borderRadius: 9, cursor: 'pointer',
                  background: active ? 'rgba(201,164,85,0.1)' : 'transparent', marginBottom: 2, transition: 'background 0.12s' }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; const d = e.currentTarget.querySelector('[data-del]') as HTMLElement | null; if (d) d.style.opacity = '1'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; const d = e.currentTarget.querySelector('[data-del]') as HTMLElement | null; if (d) d.style.opacity = '0'; }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: active ? '#f0e8d4' : 'rgba(240,232,212,0.62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                <button data-del onClick={(e) => deleteConv(c.id, e)} title="Delete chat"
                  style={{ opacity: 0, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.35)', fontSize: 12, lineHeight: 1, padding: 2, transition: 'opacity 0.12s' }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* Home */}
        <button onClick={() => router.push('/select')}
          style={{ margin: 12, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'none', border: '1px solid rgba(201,164,85,0.12)', color: 'rgba(201,164,85,0.55)',
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'color 0.2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.55)')}>
          ← Home
        </button>
      </aside>

      {/* ── Main column ── */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, minWidth: 0, height: '100%',
        display: 'flex', flexDirection: 'column',
        opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}>
        <ProfileButton />

        <div ref={overlayRef} style={{ flex: 1, overflowY: 'auto', padding: '68px 24px 16px' }}>
          {showBrain ? (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="font-serif" style={{ fontSize: '1rem', color: 'rgba(201,164,85,0.6)' }}>Content Brain</span>
                <button onClick={() => setShowBrain(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: Muted, fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>← Back to chat</button>
              </div>
              <BrainPanel brain={brain} on={brainHooks} />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 16, paddingBottom: '8vh' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/onboarding/goh-logo.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain', opacity: 0.92 }} />
              <div className="font-serif" style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 300, color: '#f0e8d4', lineHeight: 1 }}>
                Ask <em style={{ color: G, fontStyle: 'italic' }}>SooWei</em>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(240,232,212,0.4)', maxWidth: 430, lineHeight: 1.6 }}>
                Ask anything about your content, offer, or roadmap — or open the tools to analyze a video or review a script.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8,
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'user' ? (
                    <div style={{ maxWidth: '85%', padding: '9px 14px',
                      background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.14)',
                      borderRadius: '12px 3px 12px 12px',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '13px', lineHeight: 1.6, color: 'rgba(240,232,212,0.7)' }}>
                      {msg.content}
                    </div>
                  ) : msg.taskData ? (
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${GBorder}`, borderRadius: 14, padding: '16px 18px' }}>
                      <TaskResultRenderer task={msg.taskData.task} data={msg.taskData.result} cbs={cbs} />
                    </div>
                  ) : (
                    <div style={{ maxWidth: '92%', padding: '2px 0',
                      fontFamily: "'DM Sans', sans-serif", fontSize: '14.5px', lineHeight: 1.75,
                      color: 'rgba(240,232,212,0.88)', display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {msg.content.split(/\n\n+/).filter(Boolean).map((para, pi) => (
                        <span key={pi} style={{ display: 'block' }}>
                          {para.split('\n').map((line, li, arr) => (
                            <span key={li}>{line}{li < arr.length - 1 && <br />}</span>
                          ))}
                        </span>
                      ))}
                      {typing && i === messages.length - 1 && (
                        <span style={{ display: 'inline-block', width: 2, height: '1em',
                          background: 'rgba(201,164,85,0.7)', marginLeft: 2, verticalAlign: 'middle',
                          animation: 'blink 0.8s ease-in-out infinite' }} />
                      )}
                    </div>
                  )}

                  {!typing && msg.sops && msg.sops.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '92%' }}>
                      {msg.sops.map((sop) => (
                        <button key={sop.badge} onClick={() => router.push(`/sops?sop=${sop.badge}`)}
                          style={{ padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                            border: '1px solid rgba(201,164,85,0.22)', background: 'transparent',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '10px', fontWeight: 600,
                            color: 'rgba(201,164,85,0.7)', letterSpacing: '0.03em' }}>
                          SOP {sop.badge} — {sop.title.length > 22 ? sop.title.slice(0,22)+'…' : sop.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {!typing && msg.modules && msg.modules.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '92%' }}>
                      {msg.modules.map((mod) => (
                        <button key={mod.title} onClick={() => router.push('/modules')}
                          style={{ padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                            border: '1px solid rgba(255,255,255,0.07)', background: 'transparent',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '10px', fontWeight: 600,
                            color: 'rgba(240,232,212,0.56)', letterSpacing: '0.03em' }}>
                          ▶ {mod.title.length > 28 ? mod.title.slice(0,28)+'…' : mod.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {!typing && msg.recordings && msg.recordings.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '92%' }}>
                      {msg.recordings.map((rec) => (
                        <button key={rec.id} onClick={() => router.push(`/hub?rec=${encodeURIComponent(rec.id)}`)}
                          style={{ padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                            border: '1px solid rgba(201,164,85,0.22)', background: 'transparent',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '10px', fontWeight: 600,
                            color: 'rgba(201,164,85,0.7)', letterSpacing: '0.03em' }}>
                          ▶ {rec.title.length > 28 ? rec.title.slice(0,28)+'…' : rec.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {!typing && msg.resources && msg.resources.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '92%' }}>
                      {msg.resources.map((r) => (
                        <button key={r.slug} onClick={() => setResourceSlug(r.slug)}
                          style={{ padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                            border: '1px solid rgba(201,164,85,0.3)', background: 'rgba(201,164,85,0.06)',
                            fontFamily: "'DM Sans', sans-serif", fontSize: '10px', fontWeight: 600,
                            color: 'rgba(201,164,85,0.85)', letterSpacing: '0.03em',
                            display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          📄 {r.title.length > 28 ? r.title.slice(0,28)+'…' : r.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 5, alignSelf: 'flex-start', padding: '4px 0' }}>
                  {[0,1,2].map((d) => (
                    <div key={d} style={{ width: 5, height: 5, borderRadius: '50%',
                      background: 'rgba(201,164,85,0.4)', animation: `blink 1.1s ease-in-out ${d*0.18}s infinite` }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Composer ── */}
        {!showBrain && (
          <div style={{ padding: '0 24px 20px', flexShrink: 0 }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              {/* Tools (task pills) */}
              {showTools && (
                <div data-tour="assistant-tasks" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {TASK_MODES.map((t) => {
                    const active = taskMode === t.id;
                    return (
                      <button key={t.id} onMouseDown={(e) => { e.preventDefault(); selectTask(t.id); }}
                        style={{ padding: '7px 16px', borderRadius: 20,
                          background: active ? GB : 'rgba(201,164,85,0.09)',
                          border: `1px solid ${active ? 'rgba(201,164,85,0.5)' : 'rgba(201,164,85,0.28)'}`,
                          color: active ? G : 'rgba(240,232,212,0.9)',
                          fontSize: '12px', fontWeight: active ? 700 : 600, letterSpacing: '0.03em',
                          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Analyze inputs (visuals + stats) */}
              {(taskMode === 'analyze-reel' || taskMode === 'analyze-yt') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <input value={visuals} onChange={(e) => setVisuals(e.target.value)}
                    placeholder="Optional: describe what you see visually in the video…"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.1)', borderRadius: 8,
                      padding: '7px 12px', fontSize: '11px', color: 'rgba(240,232,212,0.6)', outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '9.5px', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Stats (optional)</span>
                    {(['views', 'likes', 'comments', 'shares', 'saves'] as const).map((k) => (
                      <input key={k} value={stats[k]} onChange={(e) => setStats((s) => ({ ...s, [k]: e.target.value.replace(/[^\d.,kKmM]/g, '') }))}
                        placeholder={k} inputMode="numeric"
                        style={{ width: 78, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.1)', borderRadius: 8,
                          padding: '5px 8px', fontSize: '11px', color: 'rgba(240,232,212,0.7)', outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Composer box */}
              <div style={{ background: 'rgba(12,10,7,0.75)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                border: `1px solid ${focused ? 'rgba(201,164,85,0.42)' : 'rgba(201,164,85,0.18)'}`, borderRadius: 20,
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)', padding: '8px 8px 8px 8px',
                display: 'flex', alignItems: 'flex-end', gap: 6, transition: 'border-color 0.2s' }}>
                <button onClick={() => setShowTools((v) => !v)} title="Tools"
                  style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: showTools || taskMode ? GB : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showTools || taskMode ? 'rgba(201,164,85,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    color: showTools || taskMode ? G : 'rgba(201,164,85,0.55)',
                    cursor: 'pointer', fontSize: 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  aria-label="Tools">+</button>
                <textarea ref={inputRef} value={input}
                  onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
                  onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  placeholder={taskMode ? currentHint : 'Ask SooWei anything…'} disabled={loading} rows={1}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    fontFamily: "'DM Sans', sans-serif", fontSize: '13.5px', color: 'rgba(240,232,212,0.9)',
                    lineHeight: 1.6, resize: 'none', padding: '8px 4px', maxHeight: 160, minHeight: 20 }} />
                <button onClick={() => setShowBrain(true)} title="Content Brain"
                  style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: brainCount > 0 ? 'rgba(201,164,85,0.6)' : 'rgba(240,232,212,0.3)',
                    cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  aria-label="Content Brain">
                  ◈
                  {brainCount > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -4, background: G, color: '#060504', borderRadius: 6,
                      fontSize: 8, fontWeight: 800, padding: '1px 4px', lineHeight: 1.3 }}>{brainCount}</span>
                  )}
                </button>
                <input ref={offerFileRef} type="file" accept="application/pdf,.pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOffer(f); }} style={{ display: 'none' }} />
                <button onClick={() => offerFileRef.current?.click()} disabled={offerStatus === 'uploading'}
                  title="Attach a document (PDF)"
                  style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: offerStatus === 'done' ? '#4ade80' : 'rgba(201,164,85,0.55)',
                    cursor: offerStatus === 'uploading' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, padding: 0 }}
                  aria-label="Attach document">📎</button>
                <button onClick={send} disabled={loading || (taskMode !== 'generate-ideas' && !input.trim())}
                  style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: (input.trim() || taskMode === 'generate-ideas') && !loading ? GB : 'rgba(201,164,85,0.05)',
                    border: `1px solid ${(input.trim() || taskMode === 'generate-ideas') && !loading ? 'rgba(201,164,85,0.38)' : 'rgba(201,164,85,0.1)'}`,
                    cursor: (input.trim() || taskMode === 'generate-ideas') && !loading ? 'pointer' : 'default',
                    color: (input.trim() || taskMode === 'generate-ideas') && !loading ? G : 'rgba(201,164,85,0.2)',
                    fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  aria-label="Send">↑</button>
              </div>
              {offerStatus !== 'idle' && (
                <div style={{ padding: '8px 6px 0', fontSize: 11, fontFamily: "'DM Sans', sans-serif",
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  color: offerStatus === 'error' ? '#ef4444' : offerStatus === 'done' ? '#4ade80' : 'rgba(240,232,212,0.6)' }}>
                  <span>
                    {offerStatus === 'uploading' ? 'Reading your document…'
                      : offerStatus === 'removing' ? 'Removing your document…'
                      : offerStatus === 'done' ? '📎 Document attached — I’ll use it in my answers'
                      : 'Couldn’t read that PDF — try another file.'}
                  </span>
                  {offerStatus === 'done' && (
                    <button onClick={removeOffer}
                      title="Stop using this document — I’ll forget what was in it"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif", fontSize: 11, textDecoration: 'underline',
                        color: 'rgba(240,232,212,0.55)' }}>Remove</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {resourceSlug && <ResourcePopup slug={resourceSlug} onClose={() => setResourceSlug(null)} />}
      <PageTour id="assistant" steps={ASSISTANT_TOUR} />
    </main>
  );
}
