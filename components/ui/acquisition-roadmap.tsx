'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_ACQ_ROADMAP, normalizeRoadmap, totalSteps, currentWeekIdx,
  type AcqRoadmapDef, type AcqRoadmapWeek, type AcqRoadmapStep, type AcqRoadmapResource,
} from '@/lib/acquisition-roadmap-data';

// The Acquisition Roadmap section of the acquisition board. Visually mirrors the
// main /roadmap (week tabs, step cards, progress bar, sequential unlock). The
// definition is admin-editable and shared globally; each client's ticks are
// their own. Acq-admins get an inline editor to add/edit weeks, steps and
// resource links.

const GOLD = '#c9a455';
const CREAM = '#f0e8d4';

const glass: React.CSSProperties = {
  background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(201,164,85,0.18)', borderRadius: 18,
};
const resourcePill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 9,
  background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)',
  color: GOLD, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const input: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 8,
  color: CREAM, fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: '8px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnGold: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: '#0a0806', background: GOLD, border: 'none',
};
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(201,164,85,0.75)',
  background: 'transparent', border: '1px solid rgba(201,164,85,0.28)',
};
const smallLabel: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
  fontWeight: 700, color: 'rgba(201,164,85,0.5)',
};
const errText: React.CSSProperties = { color: '#f87171', fontFamily: "'DM Sans', sans-serif", fontSize: 12 };
const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.45)', fontSize: 15, padding: '0 4px' };

const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isEmbeddable = (u: string) => /calendly\.com|calendar\.google\.com/i.test(u);

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '1rem' }}>
      <div style={{ flex: 1, height: 2, background: 'rgba(201,164,85,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#4ade80' : 'rgba(201,164,85,0.55)', borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: pct === 100 ? '#4ade80' : 'rgba(201,164,85,0.5)', letterSpacing: '0.05em', flexShrink: 0 }}>
        {value}/{total}
      </span>
    </div>
  );
}

// ── Week tab ────────────────────────────────────────────────────────────────
function WeekTab({ week, active, locked, done, pct, onClick }: {
  week: AcqRoadmapWeek; active: boolean; locked: boolean; done: boolean; pct: number; onClick: () => void;
}) {
  const [h, setH] = useState(false);
  const lit = active || (h && !locked);
  return (
    <button
      onClick={() => { if (!locked) onClick(); }}
      disabled={locked}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: active ? 'rgba(201,164,85,0.09)' : 'transparent',
        border: active ? '1px solid rgba(201,164,85,0.28)' : '1px solid rgba(201,164,85,0.1)',
        borderRadius: 100, padding: '7px 16px', cursor: locked ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s', opacity: locked ? 0.4 : 1,
      }}
    >
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: lit ? 'rgba(201,164,85,0.55)' : 'rgba(201,164,85,0.22)' }}>{week.num}</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: active ? 600 : 400, letterSpacing: '0.08em', color: lit ? GOLD : 'rgba(201,164,85,0.4)' }}>{week.label}</span>
      {locked && <span style={{ fontSize: '9px' }}>🔒</span>}
      {!locked && done && <span style={{ fontSize: '9px', color: '#4ade80' }}>✓</span>}
      {!locked && !done && pct > 0 && <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.45)' }}>{pct}%</span>}
    </button>
  );
}

// ── Step card (view) ──────────────────────────────────────────────────────────
function StepCard({ step, index, completed, locked, onToggle }: {
  step: AcqRoadmapStep; index: number; completed: boolean; locked: boolean; onToggle: () => void;
}) {
  const [h, setH] = useState(false);
  const resources = step.resources ?? [];
  const showDetails = !locked && (!!step.desc?.trim() || resources.length > 0);
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: completed ? 'rgba(201,164,85,0.04)' : h && !locked ? 'rgba(201,164,85,0.06)' : 'rgba(0,0,0,0.22)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: completed ? '1px solid rgba(201,164,85,0.2)' : h && !locked ? '1px solid rgba(201,164,85,0.25)' : '1px solid rgba(201,164,85,0.1)',
        borderRadius: 14, padding: '0.95rem 1.25rem', width: '100%', minHeight: 72, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', transition: 'all 0.2s ease',
        opacity: locked ? 0.5 : completed ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>{String(index + 1).padStart(2, '0')}</span>
          <span style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.05rem', fontWeight: 300,
            color: completed ? 'rgba(201,164,85,0.55)' : h && !locked ? CREAM : 'rgba(240,232,212,0.75)', lineHeight: 1.35,
            textDecorationLine: completed ? 'line-through' : 'none', textDecorationColor: 'rgba(201,164,85,0.3)',
          }}>{step.text}</span>
        </div>
        {locked ? (
          <span title="Complete the previous week to unlock" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,232,212,0.55)', fontSize: '13px' }}>🔒</span>
        ) : (
          <button
            onClick={onToggle} title={completed ? 'Mark incomplete' : 'Mark complete'}
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: completed ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
              border: completed ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.1)',
              color: completed ? '#4ade80' : 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
          >✓</button>
        )}
      </div>
      {showDetails && (
        <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid rgba(201,164,85,0.1)' }}>
          {step.desc?.trim() && (
            <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.6, color: 'rgba(240,232,212,0.62)', whiteSpace: 'pre-wrap' }}>{step.desc}</p>
          )}
          {resources.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: step.desc?.trim() ? 12 : 0 }}>
              {resources.filter((r) => r.url.trim()).map((r) => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" style={resourcePill}>
                  {r.label.trim() || r.url} {isEmbeddable(r.url) ? '↗' : '↗'}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin editor ──────────────────────────────────────────────────────────────
function RoadmapEditor({ initial, onCancel, onSaved }: {
  initial: AcqRoadmapDef; onCancel: () => void; onSaved: (d: AcqRoadmapDef) => void;
}) {
  const [draft, setDraft] = useState<AcqRoadmapDef>(() => normalizeRoadmap(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const mutWeeks = (fn: (weeks: AcqRoadmapWeek[]) => AcqRoadmapWeek[]) => setDraft((d) => ({ weeks: fn(d.weeks.map((w) => ({ ...w, steps: w.steps.map((s) => ({ ...s, resources: (s.resources ?? []).map((r) => ({ ...r })) })) }))) }));
  const setWeek = (wi: number, patch: Partial<AcqRoadmapWeek>) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, ...patch } : w));
  const addWeek = () => mutWeeks((ws) => [...ws, { id: newId(), num: String(ws.length + 1).padStart(2, '0'), label: `Week ${ws.length + 1}`, title: '', sub: '', steps: [] }]);
  const removeWeek = (wi: number) => mutWeeks((ws) => ws.filter((_, i) => i !== wi));
  const moveWeek = (wi: number, dir: -1 | 1) => mutWeeks((ws) => { const j = wi + dir; if (j < 0 || j >= ws.length) return ws; const c = [...ws]; [c[wi], c[j]] = [c[j], c[wi]]; return c; });

  const setStep = (wi: number, si: number, patch: Partial<AcqRoadmapStep>) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: w.steps.map((s, j) => j === si ? { ...s, ...patch } : s) } : w));
  const addStep = (wi: number) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: [...w.steps, { id: newId(), text: '', desc: '', resources: [] }] } : w));
  const removeStep = (wi: number, si: number) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: w.steps.filter((_, j) => j !== si) } : w));
  const moveStep = (wi: number, si: number, dir: -1 | 1) => mutWeeks((ws) => ws.map((w, i) => { if (i !== wi) return w; const j = si + dir; if (j < 0 || j >= w.steps.length) return w; const c = [...w.steps]; [c[si], c[j]] = [c[j], c[si]]; return { ...w, steps: c }; }));

  const setRes = (wi: number, si: number, ri: number, patch: Partial<AcqRoadmapResource>) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: w.steps.map((s, j) => j === si ? { ...s, resources: (s.resources ?? []).map((r, k) => k === ri ? { ...r, ...patch } : r) } : s) } : w));
  const addRes = (wi: number, si: number) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: w.steps.map((s, j) => j === si ? { ...s, resources: [...(s.resources ?? []), { id: newId(), label: '', url: '' }] } : s) } : w));
  const removeRes = (wi: number, si: number, ri: number) => mutWeeks((ws) => ws.map((w, i) => i === wi ? { ...w, steps: w.steps.map((s, j) => j === si ? { ...s, resources: (s.resources ?? []).filter((_, k) => k !== ri) } : s) } : w));

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/acquisition/roadmap', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ def: draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Save failed'); return; }
      onSaved(normalizeRoadmap(j.def ?? draft));
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ ...glass, border: '1px dashed rgba(201,164,85,0.45)', padding: '12px 16px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#0a0806', background: GOLD, borderRadius: 4, padding: '2px 6px' }}>ADMIN</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(240,232,212,0.7)', flex: 1 }}>Editing the roadmap for <strong style={{ color: CREAM }}>every</strong> acquisition client. Tick progress is per-client and stays intact.</span>
        <button onClick={save} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save roadmap'}</button>
        <button onClick={onCancel} disabled={saving} style={btnGhost}>Cancel</button>
        {err && <span style={errText}>{err}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {draft.weeks.map((w, wi) => (
          <div key={w.id} style={{ ...glass, padding: 'clamp(1rem, 3vw, 1.6rem)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={smallLabel}>Week {wi + 1}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button onClick={() => moveWeek(wi, -1)} disabled={wi === 0} title="Move up" style={{ ...iconBtn, opacity: wi === 0 ? 0.3 : 1 }}>↑</button>
                <button onClick={() => moveWeek(wi, 1)} disabled={wi === draft.weeks.length - 1} title="Move down" style={{ ...iconBtn, opacity: wi === draft.weeks.length - 1 ? 0.3 : 1 }}>↓</button>
                <button onClick={() => removeWeek(wi)} title="Remove week" style={{ ...iconBtn, color: '#f87171' }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={w.label} onChange={(e) => setWeek(wi, { label: e.target.value })} placeholder="Week One" style={{ ...input, flex: '0 0 30%' }} />
              <input value={w.title} onChange={(e) => setWeek(wi, { title: e.target.value })} placeholder="Title (e.g. Data Analysis)" style={{ ...input, flex: 1 }} />
            </div>
            <input value={w.sub ?? ''} onChange={(e) => setWeek(wi, { sub: e.target.value })} placeholder="One-line description (optional)" style={{ ...input, marginBottom: 14 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {w.steps.map((s, si) => (
                <div key={s.id} style={{ border: '1px solid rgba(201,164,85,0.14)', borderRadius: 12, padding: '10px 12px', background: 'rgba(0,0,0,0.18)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, color: 'rgba(201,164,85,0.4)', flexShrink: 0 }}>{String(si + 1).padStart(2, '0')}</span>
                    <input value={s.text} onChange={(e) => setStep(wi, si, { text: e.target.value })} placeholder="Step text" style={input} />
                    <button onClick={() => moveStep(wi, si, -1)} disabled={si === 0} title="Move up" style={{ ...iconBtn, opacity: si === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveStep(wi, si, 1)} disabled={si === w.steps.length - 1} title="Move down" style={{ ...iconBtn, opacity: si === w.steps.length - 1 ? 0.3 : 1 }}>↓</button>
                    <button onClick={() => removeStep(wi, si)} title="Remove step" style={{ ...iconBtn, color: '#f87171' }}>✕</button>
                  </div>
                  <textarea value={s.desc ?? ''} onChange={(e) => setStep(wi, si, { desc: e.target.value })} rows={2} placeholder="Note (optional)" style={{ ...input, marginTop: 8, resize: 'vertical', lineHeight: 1.5 }} />
                  <div style={{ ...smallLabel, marginTop: 10, marginBottom: 6 }}>Resources / docs</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(s.resources ?? []).map((r, ri) => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={r.label} onChange={(e) => setRes(wi, si, ri, { label: e.target.value })} placeholder="Label" style={{ ...input, flex: '0 0 32%' }} />
                        <input value={r.url} onChange={(e) => setRes(wi, si, ri, { url: e.target.value })} placeholder="https://…" style={{ ...input, flex: 1 }} />
                        <button onClick={() => removeRes(wi, si, ri)} title="Remove" style={iconBtn}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => addRes(wi, si)} style={{ ...btnGhost, marginTop: 8, padding: '6px 12px' }}>+ Add resource</button>
                </div>
              ))}
            </div>
            <button onClick={() => addStep(wi)} style={{ ...btnGhost, marginTop: 12 }}>+ Add step</button>
          </div>
        ))}
      </div>
      <button onClick={addWeek} style={{ ...btnGhost, marginTop: 16 }}>+ Add week</button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function AcquisitionRoadmap({ isAdmin = false, client }: { isAdmin?: boolean; client?: string }) {
  const [def, setDef] = useState<AcqRoadmapDef | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [canEdit, setCanEdit] = useState(isAdmin);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [jumped, setJumped] = useState(false);

  useEffect(() => {
    setDef(null); setJumped(false); setEditing(false);
    const q = client ? `?client=${encodeURIComponent(client)}` : '';
    fetch(`/api/acquisition/roadmap${q}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const nd = d?.def ? normalizeRoadmap(d.def) : DEFAULT_ACQ_ROADMAP;
        setDef(nd);
        setCompleted(new Set<string>(Array.isArray(d?.completed) ? d.completed : []));
        setCanEdit(!!d?.canEdit || isAdmin);
      })
      .catch(() => { setDef(DEFAULT_ACQ_ROADMAP); setCompleted(new Set()); });
  }, [client, isAdmin]);

  // Jump to the week the client is currently on, once loaded.
  useEffect(() => {
    if (def && !jumped) { setActiveIdx(currentWeekIdx(def, completed)); setJumped(true); }
  }, [def, jumped, completed]);

  const toggle = async (itemId: string) => {
    const now = !completed.has(itemId);
    setCompleted((prev) => { const n = new Set(prev); if (now) n.add(itemId); else n.delete(itemId); return n; });
    try {
      await fetch('/api/acquisition/roadmap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, completed: now, client }),
      });
    } catch { /* keep optimistic state */ }
  };

  const total = useMemo(() => (def ? totalSteps(def) : 0), [def]);
  const doneCount = useMemo(() => (def ? def.weeks.reduce((n, w) => n + w.steps.filter((s) => completed.has(s.id)).length, 0) : 0), [def, completed]);

  if (!def) {
    return <div style={{ ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</div>;
  }

  if (editing) {
    return <RoadmapEditor initial={def} onCancel={() => setEditing(false)} onSaved={(d) => { setDef(d); setEditing(false); setActiveIdx((i) => Math.min(i, Math.max(0, d.weeks.length - 1))); }} />;
  }

  const active = def.weeks[Math.min(activeIdx, def.weeks.length - 1)];
  // Every week is open to every member — no sequential gating.
  const canPrev = activeIdx > 0;
  const canNext = activeIdx < def.weeks.length - 1;

  return (
    <div>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.9rem' }}>
          <button onClick={() => setEditing(true)} style={btnGhost}>✎ Edit roadmap</button>
        </div>
      )}

      {def.weeks.length === 0 ? (
        <div style={{ ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.55)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5 }}>
          No roadmap yet.{canEdit ? ' Click “Edit roadmap” to add the first week.' : ''}
        </div>
      ) : (<>
        {/* Overall progress + week tabs */}
        <div style={{ maxWidth: 400, margin: '0 auto 1.25rem' }}>
          <ProgressBar value={doneCount} total={total} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {def.weeks.map((w, i) => {
            const c = w.steps.filter((s) => completed.has(s.id)).length;
            return (
              <WeekTab
                key={w.id} week={w} active={activeIdx === i}
                locked={false} done={w.steps.length > 0 && c === w.steps.length}
                pct={w.steps.length ? Math.round((c / w.steps.length) * 100) : 0}
                onClick={() => setActiveIdx(i)}
              />
            );
          })}
        </div>

        {/* Active week */}
        <div style={{ ...glass, padding: '1.75rem 2rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: '0.5rem' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.35)', letterSpacing: '0.1em' }}>{active.label}</span>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.2)', letterSpacing: '0.1em' }}>{active.steps.length} steps</span>
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300, color: CREAM, lineHeight: 1.15, margin: '0 0 0.4rem' }}>{active.title || active.label}</h2>
          {active.sub?.trim() && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(240,232,212,0.58)', lineHeight: 1.6, margin: '0 0 0.25rem' }}>{active.sub}</p>}
          <ProgressBar value={active.steps.filter((s) => completed.has(s.id)).length} total={active.steps.length} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {active.steps.map((s, i) => (
            <StepCard key={s.id} step={s} index={i} completed={completed.has(s.id)} locked={false} onToggle={() => toggle(s.id)} />
          ))}
          {active.steps.length === 0 && (
            <div style={{ ...glass, padding: '1.5rem', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No steps in this week yet.</div>
          )}
        </div>

        {/* Week nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(201,164,85,0.08)' }}>
          <button onClick={() => { if (canPrev) setActiveIdx(activeIdx - 1); }} disabled={!canPrev}
            style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? 'rgba(201,164,85,0.5)' : 'rgba(201,164,85,0.15)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, padding: 0 }}>← Prev</button>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.25)', letterSpacing: '0.1em' }}>{activeIdx + 1} / {def.weeks.length}</span>
          <button onClick={() => { if (canNext) setActiveIdx(activeIdx + 1); }} disabled={!canNext}
            style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', color: canNext ? 'rgba(201,164,85,0.5)' : 'rgba(201,164,85,0.15)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            Next →
          </button>
        </div>
      </>)}
    </div>
  );
}
