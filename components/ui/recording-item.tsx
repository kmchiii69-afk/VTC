'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, FileText, Send, Upload, Pencil, X, Plus, GripVertical } from 'lucide-react';
import { recordingCategory, RECORDING_CATEGORIES, type Recording } from '@/lib/recordings';
import { RecordingEmbed } from '@/components/ui/recording-embed';
import { MeshBg } from '@/components/ui/mesh-bg';
import { trackView } from '@/lib/track';
import { Dots } from '@/components/ui/loaders';

const G = '#c9a455';
const STANDARD_CAT_IDS: string[] = RECORDING_CATEGORIES.map((c) => c.id);

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

// Centered recordings experience (no side column):
//  - category pill-tabs at the top (matches the /roadmap phase tabs),
//  - the selected recording plays in a centered player styled exactly like the
//    /modules player (breadcrumb · number · serif title · glass video · prev/next · up-next),
//  - below it, the recordings of the active category are listed as centered cards
//    styled like the /roadmap step cards.
// Rendered full-screen via a portal so it escapes any transformed ancestor.
export function RecordingsPlayer({
  recordings, isAdmin = false, onDelete, onChanged, title, blurb, onBack, backLabel = 'Menu', hideSummary = false, initialId,
}: {
  recordings: Recording[];
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
  onChanged?: () => void;
  title: string;          // page eyebrow (category name, or "Call Recordings")
  blurb?: string;         // optional sub-line under the eyebrow
  onBack?: () => void;    // "← <backLabel>" link, top-left (matches /roadmap, /modules)
  backLabel?: string;
  hideSummary?: boolean;  // hide the "Summary document" section (e.g. 1-1 check-ins)
  initialId?: string;     // preselect this recording on mount (e.g. /hub?rec=<id>)
}) {
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Portal to document.body so the fixed full-screen layout escapes any
  // transformed/filtered ancestor (which would trap position:fixed).
  useEffect(() => { setMounted(true); }, []);

  // Local mirror of the recordings so admins can drag-and-drop to reorder
  // optimistically. `localRef` always holds the latest list synchronously (drag
  // events can fire faster than React re-renders), and we persist from it on
  // drop; the parent's onChanged refetch then re-syncs from the saved order.
  const [local, setLocal] = useState<Recording[]>(recordings);
  const localRef = useRef<Recording[]>(recordings);
  useEffect(() => { setLocal(recordings); localRef.current = recordings; }, [recordings]);
  const applyLocal = (next: Recording[]) => { localRef.current = next; setLocal(next); };

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCat, setDropCat] = useState<string | null>(null);

  const presentCats = Array.from(new Set(local.map((r) => r.category)));
  const allStandard = presentCats.length > 0 && presentCats.every((c) => STANDARD_CAT_IDS.includes(c));
  // Admins see every standard category as a tab (even empty ones) so a card can
  // be dragged into a category that has no recordings yet.
  const cats = isAdmin && allStandard ? STANDARD_CAT_IDS.slice() : presentCats;
  const multi = cats.length > 1;
  const [activeCat, setActiveCat] = useState<string>('');
  // Default to the first tab that actually has recordings, not just the first
  // standard tab. Admins always see all standard tabs (so empty ones can be
  // dragged into), but the hub hands us a single category at a time — falling
  // back to cats[0] (content_mastermind) would make every OTHER category open
  // blank until you manually clicked its tab.
  const firstPopulated = cats.find((c) => local.some((r) => r.category === c)) ?? cats[0] ?? '';
  const effectiveCat = cats.includes(activeCat) ? activeCat : firstPopulated;

  // Recordings in the active category — numbering + prev/next are scoped to it
  // (like /roadmap steps are scoped to a phase).
  const catItems = local.filter((r) => r.category === effectiveCat);
  const selected = catItems.find((r) => r.id === selectedId) ?? catItems[0] ?? null;
  const idx = selected ? catItems.findIndex((r) => r.id === selected.id) : -1;
  const prev = idx > 0 ? catItems[idx - 1] : null;
  const next = idx >= 0 && idx < catItems.length - 1 ? catItems[idx + 1] : null;
  const numberOf = (id: string) => catItems.findIndex((r) => r.id === id) + 1;

  const titleOf = (rec: Recording) => rec.title || recordingCategory(rec.category)?.name || 'Recording';

  const select = (rec: Recording) => {
    if (!isAdmin) trackView('recording_view', rec.id, rec.title || undefined);
    setEditing(false);
    setSelectedId(rec.id);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const removeSelected = () => {
    if (selected && onDelete) { onDelete(selected.id); setSelectedId(null); setEditing(false); }
  };

  // ── Drag-and-drop reordering (admins) ──────────────────────────────────────
  // Drag a session card to reorder within its category; drop it on another
  // category's tab to move it there. Only enabled while not editing/adding.
  const canReorder = isAdmin && allStandard && !editing && !adding;

  const persistOrder = (list: Recording[]) => {
    const items = list.map((r, i) => ({ id: r.id, category: r.category, sort_order: i }));
    fetch('/api/recordings/reorder', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }).then(() => onChanged?.()).catch(() => {});
  };

  // Reorder within the same category as the drag passes over a sibling card.
  const onCardDragEnter = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const cur = localRef.current;
    const from = cur.findIndex((r) => r.id === dragId);
    const to = cur.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0 || cur[from].category !== cur[to].category) return;
    const next = cur.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyLocal(next);
  };

  // Move the dragged card into a different category (dropped on a tab), placing
  // it at the end of that category.
  const moveToCategory = (cat: string) => {
    if (!dragId) return;
    const cur = localRef.current;
    const from = cur.findIndex((r) => r.id === dragId);
    if (from < 0 || cur[from].category === cat) return;
    const next = cur.slice();
    const [orig] = next.splice(from, 1);
    const moved = { ...orig, category: cat };
    let lastIdx = -1;
    next.forEach((r, i) => { if (r.category === cat) lastIdx = i; });
    next.splice(lastIdx + 1, 0, moved);
    applyLocal(next);
    setActiveCat(cat);
  };

  const endDrag = () => {
    if (dragId) persistOrder(localRef.current);
    setDragId(null);
    setDropCat(null);
  };

  // Roadmap-style selection card (centered, no side column).
  const RecordingCard = (rec: Recording) => {
    const active = selected?.id === rec.id;
    const dragging = dragId === rec.id;
    return (
      <button
        key={rec.id}
        onClick={() => select(rec)}
        draggable={canReorder}
        onDragStart={canReorder ? (e) => { setDragId(rec.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onDragEnter={canReorder ? () => onCardDragEnter(rec.id) : undefined}
        onDragOver={canReorder ? (e) => e.preventDefault() : undefined}
        onDragEnd={canReorder ? endDrag : undefined}
        style={{
          width: '100%', textAlign: 'left', cursor: canReorder ? 'grab' : 'pointer',
          background: active ? 'rgba(201,164,85,0.08)' : 'rgba(0,0,0,0.22)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: active ? '1px solid rgba(201,164,85,0.35)' : '1px solid rgba(201,164,85,0.1)',
          borderRadius: 14, padding: '0.85rem 1.1rem', transition: 'background 0.2s ease, border-color 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 12,
          opacity: dragging ? 0.4 : 1,
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.06)'; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.22)'; }}
      >
        {canReorder && (
          <span style={{ flexShrink: 0, color: 'rgba(201,164,85,0.35)', display: 'flex', alignItems: 'center', cursor: 'grab' }} title="Drag to reorder">
            <GripVertical size={14} />
          </span>
        )}
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: active ? 'rgba(201,164,85,0.6)' : 'rgba(201,164,85,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>
          {String(numberOf(rec.id)).padStart(2, '0')}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.05rem', fontWeight: 300, lineHeight: 1.35, color: active ? '#f0e8d4' : 'rgba(240,232,212,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titleOf(rec)}
        </span>
        {active && <span style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: G }}>▶ Now playing</span>}
      </button>
    );
  };

  const overlay = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#050403', overflow: 'hidden' }}>
      <MeshBg speed={0.2} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)' }} />

      {onBack && (
        <button
          onClick={onBack}
          style={{ position: 'fixed', top: 28, left: 32, zIndex: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s', padding: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
        >
          ← {backLabel}
        </button>
      )}

      <div ref={scrollRef} style={{ position: 'absolute', inset: 0, zIndex: 2, overflowY: 'auto', padding: '80px clamp(16px, 4vw, 28px) 80px' }}>
        {/* Header (left-aligned) */}
        <div style={{ textAlign: 'left', marginBottom: '2rem', maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.45)', margin: '0 0 0.5rem' }}>
            {title}
          </p>
          {blurb && <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(240,232,212,0.55)', lineHeight: 1.6, margin: 0, maxWidth: 540 }}>{blurb}</p>}

          {multi && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap', marginTop: '1.25rem' }}>
              {cats.map((c) => {
                const info = recordingCategory(c);
                const on = c === effectiveCat;
                const dropTarget = canReorder && dropCat === c;
                return (
                  <button
                    key={c}
                    onClick={() => { setActiveCat(c); setSelectedId(null); }}
                    onDragOver={canReorder ? (e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropCat(c); } } : undefined}
                    onDragLeave={canReorder ? () => setDropCat((p) => (p === c ? null : p)) : undefined}
                    onDrop={canReorder ? (e) => { e.preventDefault(); moveToCategory(c); setDropCat(null); } : undefined}
                    style={{ background: dropTarget ? 'rgba(201,164,85,0.22)' : on ? 'rgba(201,164,85,0.09)' : 'transparent', border: dropTarget ? '1px solid rgba(201,164,85,0.6)' : on ? '1px solid rgba(201,164,85,0.28)' : '1px solid rgba(201,164,85,0.1)', borderRadius: 100, padding: '7px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s', transform: dropTarget ? 'scale(1.06)' : 'none' }}
                  >
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: on ? 'rgba(201,164,85,0.55)' : 'rgba(201,164,85,0.22)' }}>{info ? info.day.slice(0, 3) : ''}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', fontWeight: on ? 600 : 400, letterSpacing: '0.08em', color: on ? '#c9a455' : 'rgba(201,164,85,0.4)' }}>{info ? info.name : c}</span>
                  </button>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div style={{ marginTop: '1.1rem' }}>
              <button
                onClick={() => setAdding((a) => !a)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 100, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer' }}
              >
                {adding ? <><X size={13} /> Close</> : <><Plus size={14} /> Add recording</>}
              </button>
            </div>
          )}
        </div>

        {isAdmin && adding && (
          <div style={{ maxWidth: 540, margin: '0 auto 1.75rem' }}>
            <AddRecordingPanel onAdded={() => { setAdding(false); onChanged?.(); }} />
          </div>
        )}

        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          {selected ? (
            <div className="view-in">
              {/* Section breadcrumb */}
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.35)', fontWeight: 700, margin: '0 0 0.75rem' }}>
                {recordingCategory(selected.category)?.name ?? 'Recording'}
              </p>

              {/* Number + title (+ admin controls) */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, minWidth: 0 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: 'rgba(201,164,85,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>
                    {String(numberOf(selected.id)).padStart(2, '0')}
                  </span>
                  <h1 className="font-serif" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300, color: '#f0e8d4', lineHeight: 1.15, margin: 0 }}>
                    {titleOf(selected)}
                  </h1>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingTop: 6 }}>
                    <button onClick={() => setEditing((e) => !e)} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Pencil size={12} /> {editing ? 'Close' : 'Edit'}
                    </button>
                    {onDelete && (
                      <button onClick={removeSelected} title="Delete recording" style={{ ...linkBtn, color: 'rgba(239,68,68,0.7)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <X size={13} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isAdmin && editing && <div style={{ marginBottom: 16 }}><EditPanel rec={selected} onChanged={onChanged} onDone={() => setEditing(false)} /></div>}

              {/* Player (glass container, matches /modules) */}
              <div style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
                {selected.embed_code ? (
                  <RecordingEmbed html={selected.embed_code} />
                ) : selected.fathom_url ? (
                  <div style={{ padding: 18 }}>
                    <a href={selected.fathom_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 8, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.06em' }}>Watch ↗</a>
                  </div>
                ) : (
                  <div style={{ padding: 18, fontSize: 12, color: '#857a67', fontFamily: "'DM Sans', sans-serif" }}>No video attached.</div>
                )}
              </div>

              {/* Prev / index / Next (matches /modules) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderTop: '1px solid rgba(201,164,85,0.08)' }}>
                <button
                  onClick={() => prev && select(prev)} disabled={!prev}
                  style={{ background: 'none', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 10, padding: '10px 20px', cursor: prev ? 'pointer' : 'default', color: prev ? 'rgba(201,164,85,0.6)' : 'rgba(201,164,85,0.15)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, transition: 'all 0.2s', opacity: prev ? 1 : 0.4 }}
                  onMouseEnter={(e) => { if (prev) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a455'; } }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = prev ? 'rgba(201,164,85,0.6)' : 'rgba(201,164,85,0.15)'; }}
                >
                  ← Previous
                </button>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(201,164,85,0.25)', letterSpacing: '0.1em' }}>
                  {numberOf(selected.id)} / {catItems.length}
                </span>
                <button
                  onClick={() => next && select(next)} disabled={!next}
                  style={{ background: next ? 'rgba(201,164,85,0.08)' : 'none', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10, padding: '10px 20px', cursor: next ? 'pointer' : 'default', color: next ? 'rgba(201,164,85,0.8)' : 'rgba(201,164,85,0.15)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, transition: 'all 0.2s', opacity: next ? 1 : 0.4 }}
                  onMouseEnter={(e) => { if (next) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a455'; } }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = next ? 'rgba(201,164,85,0.08)' : 'none'; (e.currentTarget as HTMLButtonElement).style.color = next ? 'rgba(201,164,85,0.8)' : 'rgba(201,164,85,0.15)'; }}
                >
                  Next →
                </button>
              </div>

              {/* Up next (matches /modules) */}
              {next && (
                <button
                  onClick={() => select(next)}
                  style={{ width: '100%', textAlign: 'left', background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.1)', borderRadius: 14, padding: '1rem 1.25rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.28)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.06)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.1)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.2)'; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.35)', fontWeight: 700, margin: '0 0 4px' }}>Up Next</p>
                    <p className="font-serif" style={{ fontSize: '1.1rem', fontWeight: 300, color: 'rgba(240,232,212,0.75)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(next)}</p>
                  </div>
                  <span style={{ color: 'rgba(201,164,85,0.4)', fontSize: '18px', flexShrink: 0 }}>→</span>
                </button>
              )}

              {!hideSummary && <SummarySection rec={selected} isAdmin={isAdmin} onChanged={onChanged} />}
              <AskBox rec={selected} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#857a67', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              No recordings in this category yet.
            </div>
          )}

          {/* Selection cards (centered, matches /roadmap steps) */}
          {catItems.length > 0 && (
            <div style={{ marginTop: '2.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 0.75rem' }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.3)', margin: 0 }}>
                  All sessions
                </p>
                {canReorder && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(240,232,212,0.5)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <GripVertical size={12} style={{ color: 'rgba(201,164,85,0.5)' }} /> Drag to reorder · drop on a tab above to move between categories
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {catItems.map(RecordingCard)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : null;
}

// ── Admin: add a new recording (centered panel) ──────────────────────────────
function AddRecordingPanel({ onAdded }: { onAdded: () => void }) {
  const [cat, setCat] = useState<string>(RECORDING_CATEGORIES[0].id);
  const [embed, setEmbed] = useState('');
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [notifySummary, setNotifySummary] = useState('');
  const [transcript, setTranscript] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const pdfRef = useRef<HTMLInputElement>(null);

  const add = async () => {
    if (!embed.trim()) { setErr('Paste the embed code'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/recordings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat, embed_code: embed.trim(), call_date: date || null, title: title.trim() || null, summary_url: summary.trim() || null, summary: notifySummary.trim() || null, transcript: transcript.trim() || null }),
    }).catch(() => null);
    if (!res || !res.ok) { setSaving(false); const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to add'); return; }
    if (pdf) {
      const created = await res.json().catch(() => null);
      if (created?.id) {
        const fd = new FormData(); fd.append('file', pdf);
        const up = await fetch(`/api/recordings/${created.id}/summary`, { method: 'POST', body: fd }).catch(() => null);
        if (!up || !up.ok) { setSaving(false); const d = up ? await up.json().catch(() => ({})) : {}; setErr(d.error || 'Added, but PDF upload failed.'); onAdded(); return; }
      }
    }
    setSaving(false);
    setEmbed(''); setDate(''); setTitle(''); setSummary(''); setNotifySummary(''); setTranscript(''); setPdf(null);
    if (pdfRef.current) pdfRef.current.value = '';
    onAdded();
  };

  const fieldStyle: React.CSSProperties = { ...inputStyle, width: '100%' };
  return (
    <div style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>Add a recording</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...fieldStyle, flex: '1 1 200px' }}>
          {RECORDING_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.day} · {c.name} · {c.coach}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Date the call happened" style={{ ...fieldStyle, flex: '0 1 170px' }} />
      </div>
      <textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={2} placeholder="Embed code (Fathom iframe…)" style={{ ...fieldStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" style={fieldStyle} />
      <textarea value={notifySummary} onChange={(e) => setNotifySummary(e.target.value)} rows={2} placeholder="Call summary — 2 lines shown in the Discord notification (optional)" style={{ ...fieldStyle, resize: 'vertical' }} />
      <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} placeholder="Transcript (optional) — auto-generates the 2-line summary, overrides the box above" style={{ ...fieldStyle, resize: 'vertical' }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; setPdf(f || null); if (f) setErr(''); }} style={{ display: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => pdfRef.current?.click()} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Upload size={13} /> {pdf ? 'Change PDF' : 'Summary PDF'}</button>
        {pdf && <span style={{ fontSize: 12, color: '#d9cfba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{pdf.name}</span>}
        <span style={{ fontSize: 12, color: '#857a67' }}>or paste a link:</span>
      </div>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!!pdf} placeholder="Summary document link (Google Doc, PDF, Notion…)" style={{ ...fieldStyle, opacity: pdf ? 0.5 : 1 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={add} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Adding…' : 'Add recording'}</button>
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Admin: edit a recording's title, embed code, date, and category ──────────
function EditPanel({ rec, onChanged, onDone }: { rec: Recording; onChanged?: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(rec.title || '');
  const [date, setDate] = useState(rec.call_date || '');
  const [cat, setCat] = useState(rec.category);
  const [embed, setEmbed] = useState(rec.embed_code || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const res = await fetch(`/api/recordings/${rec.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || null,
        call_date: date || null,
        category: cat,
        embed_code: embed.trim() || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) { onChanged?.(); onDone(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to save'); }
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.16)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>
        Edit recording
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}>
          {RECORDING_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.day} · {c.name} · {c.coach}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Date the call happened" style={{ ...inputStyle, flex: '0 1 160px', minWidth: 0 }} />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" style={{ ...inputStyle, width: '100%' }} />
      <textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3}
        placeholder="Replace embed code (e.g. <iframe src=&quot;https://fathom.video/embed/...&quot;></iframe>)"
        style={{ ...inputStyle, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button onClick={onDone} style={btnGhost}>Cancel</button>
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Summary document: link/PDF for members; admins can upload a PDF or paste a link ──
function SummarySection({ rec, isAdmin, onChanged }: { rec: Recording; isAdmin: boolean; onChanged?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(rec.summary_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const saveLink = async () => {
    setSaving(true); setErr('');
    const res = await fetch(`/api/recordings/${rec.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary_url: url.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) { setEditing(false); onChanged?.(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to save'); }
  };

  const uploadPdf = async (file: File) => {
    setUploading(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/recordings/${rec.id}/summary`, { method: 'POST', body: fd }).catch(() => null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (res && res.ok) { setEditing(false); onChanged?.(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Upload failed'); }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadPdf(f);
  };

  return (
    <div style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600, marginBottom: 8 }}>
        Summary document
      </div>

      {/* hidden file input shared by the upload buttons */}
      {isAdmin && <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onPick} style={{ display: 'none' }} />}

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
            </button>
            <span style={{ fontSize: 12, color: '#857a67' }}>or paste a link:</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (Google Doc, PDF, Notion)" style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
            <button onClick={saveLink} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save link'}</button>
            <button onClick={() => { setEditing(false); setUrl(rec.summary_url || ''); setErr(''); }} style={btnGhost}>Cancel</button>
          </div>
          {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        </div>
      ) : rec.summary_url ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a href={rec.summary_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8,
            background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G,
            textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5,
          }}>
            <FileText size={14} /> Open summary document ↗
          </a>
          {isAdmin && <button onClick={() => setEditing(true)} style={linkBtn}>Replace</button>}
        </div>
      ) : isAdmin ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload PDF'}
          </button>
          <button onClick={() => setEditing(true)} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} /> Paste a link instead
          </button>
          {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#857a67' }}>No summary attached yet.</div>
      )}
    </div>
  );
}

// ── AI chat box about this recording ──────────────────────────────────────────
function AskBox({ rec }: { rec: Recording }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [showCtx, setShowCtx] = useState(false);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/recordings/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, context, title: rec.title || '' }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = res.ok ? (data.answer || 'No response.') : (data.error === 'API key not configured' ? "The assistant isn't configured yet — let the team know." : 'Something went wrong, try again.');
      setMsgs((p) => [...p, { role: 'assistant', content: answer }]);
    } catch {
      setMsgs((p) => [...p, { role: 'assistant', content: 'Network error, try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>
          Ask about this call
        </div>
        <button onClick={() => setShowCtx((s) => !s)} style={linkBtn}>
          {showCtx ? 'Hide notes' : context ? 'Notes added ✓' : '＋ Paste summary / notes'}
        </button>
      </div>

      {showCtx && (
        <textarea
          value={context} onChange={(e) => setContext(e.target.value)} rows={4}
          placeholder="Paste the call summary or your notes here so answers are grounded in this specific call…"
          style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 10, fontSize: 12.5 }}
        />
      )}

      {msgs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div style={{
                padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'rgba(201,164,85,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.22)' : 'rgba(255,255,255,0.07)'}`,
                color: m.role === 'user' ? '#f0e8d4' : '#d9cfba', fontFamily: "'DM Sans', sans-serif",
              }}>{m.content}</div>
            </div>
          ))}
          {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 2px' }}><Dots /></div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask anything about this call…"
          style={{ ...inputStyle, flex: 1, resize: 'none', fontSize: 13 }}
        />
        <button onClick={send} disabled={loading || !input.trim()} title="Send" style={{
          ...btnPrimary, padding: '10px 12px', opacity: loading || !input.trim() ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Send size={15} /></button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(201,164,85,0.15)', borderRadius: 8, color: '#f0e8d4',
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  padding: '10px 16px', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.32)',
  borderRadius: 8, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', flexShrink: 0,
};
const btnGhost: React.CSSProperties = {
  padding: '9px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,164,85,0.7)',
  fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, padding: 0,
};
