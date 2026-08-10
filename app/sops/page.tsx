'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SOPS, GROUP_LABELS, type SopGroup, type SopEntry } from '@/lib/sops-os-data';
import { MeshBg } from '@/components/ui/mesh-bg';

const GROUPS: SopGroup[] = ['content', 'offer', 'cash-injection', 'fulfillment', 'systems', 'creative-specialist'];

// ─── SOP Reader Overlay (embedded PDF viewer) ─────────────────────────────────

function SopReader({ sop, onClose, onDelete }: { sop: SopEntry; onClose: () => void; onDelete?: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(4,3,2,0.94)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.25rem 2rem', gap: 16,
        borderBottom: '1px solid rgba(201,164,85,0.1)',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(201,164,85,0.6)', fontSize: '12px',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            transition: 'color 0.2s', padding: 0, flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.6)')}
        >
          ← Back
        </button>

        <div style={{ minWidth: 0, flex: 1, textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(1.1rem, 2vw, 1.5rem)', fontWeight: 300, color: '#f0e8d4',
            lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {sop.title}
          </div>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '9px',
            letterSpacing: '0.25em', textTransform: 'uppercase',
            color: 'rgba(201,164,85,0.4)', marginTop: 4,
          }}>
            {GROUP_LABELS[sop.group]} · {sop.div} · #{sop.badge}
          </div>
        </div>

        <a
          href={sop.file}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flexShrink: 0,
            background: 'rgba(201,164,85,0.07)',
            border: '1px solid rgba(201,164,85,0.2)',
            borderRadius: 100, padding: '7px 16px',
            color: 'rgba(201,164,85,0.8)', textDecoration: 'none',
            fontFamily: "'DM Sans', sans-serif", fontSize: '10px',
            letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700,
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201,164,85,0.14)';
            e.currentTarget.style.color = '#c9a455';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(201,164,85,0.07)';
            e.currentTarget.style.color = 'rgba(201,164,85,0.8)';
          }}
        >
          Open in new tab ↗
        </a>

        {onDelete && (
          <button
            onClick={onDelete}
            style={{
              flexShrink: 0, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 100, padding: '7px 16px', color: 'rgba(239,68,68,0.85)', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700,
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/* PDF body */}
      <iframe
        src={`${sop.file}#view=FitH`}
        title={sop.title}
        style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
      />
    </div>
  );
}

// ─── Glass Plate Card ─────────────────────────────────────────────────────────

function SopCard({ sop, onClick }: { sop: SopEntry; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(201,164,85,0.07)' : 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: hovered
          ? '1px solid rgba(201,164,85,0.3)'
          : '1px solid rgba(201,164,85,0.12)',
        borderRadius: 16,
        padding: '1.25rem 1.25rem 1rem',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex', flexDirection: 'column',
        minHeight: 160,
        transition: 'all 0.2s ease',
        width: '100%',
        boxShadow: hovered
          ? '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(201,164,85,0.08)'
          : '0 2px 12px rgba(0,0,0,0.2)',
      } as React.CSSProperties}
    >
      {/* Badge */}
      <span style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: '9px', fontWeight: 400,
        color: 'rgba(201,164,85,0.35)',
        marginBottom: '0.65rem',
        letterSpacing: '0.08em',
      }}>
        {sop.badge}
      </span>

      {/* Title */}
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 'clamp(1rem, 1.4vw, 1.2rem)',
        fontWeight: 300,
        color: hovered ? '#f0e8d4' : 'rgba(240,232,212,0.82)',
        lineHeight: 1.2,
        marginBottom: '0.5rem',
        transition: 'color 0.2s',
      }}>
        {sop.title}
      </span>

      {/* Sub */}
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px', color: 'rgba(240,232,212,0.5)',
        lineHeight: 1.55, flex: 1,
      }}>
        {sop.sub}
      </span>

      {/* Division tag */}
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '8.5px', letterSpacing: '0.22em',
        textTransform: 'uppercase', fontWeight: 700,
        color: hovered ? 'rgba(201,164,85,0.45)' : 'rgba(201,164,85,0.25)',
        transition: 'color 0.2s',
        marginTop: '0.85rem',
      }}>
        {sop.div}
      </span>
    </button>
  );
}

// ─── Group Tab ────────────────────────────────────────────────────────────────

function GroupTab({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = active || hovered;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'rgba(201,164,85,0.09)' : 'transparent',
        border: active
          ? '1px solid rgba(201,164,85,0.28)'
          : '1px solid rgba(201,164,85,0.1)',
        borderRadius: 100,
        padding: '7px 16px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 7,
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '11px', fontWeight: active ? 600 : 400,
        letterSpacing: '0.08em',
        color: lit ? '#c9a455' : 'rgba(201,164,85,0.4)',
        transition: 'color 0.2s',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: '9px',
        color: lit ? 'rgba(201,164,85,0.55)' : 'rgba(201,164,85,0.22)',
        transition: 'color 0.2s',
      }}>
        {count}
      </span>
    </button>
  );
}

// ─── Group Selector Screen ────────────────────────────────────────────────────

function GroupSelectorItem({ g, count, onClick }: { g: SopGroup; count: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'baseline', gap: 16,
        padding: '10px 20px',
        transition: 'opacity 0.2s',
        opacity: hovered ? 1 : 0.65,
      }}
    >
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 'clamp(2.4rem, 5.5vw, 4rem)',
        fontWeight: 300,
        color: hovered ? '#f0e8d4' : 'rgba(240,232,212,0.8)',
        letterSpacing: '-0.01em', lineHeight: 1,
        transition: 'color 0.2s',
      }}>
        {GROUP_LABELS[g]}
      </span>
      <span style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: '11px', fontWeight: 400,
        color: hovered ? 'rgba(201,164,85,0.7)' : 'rgba(201,164,85,0.3)',
        transition: 'color 0.2s', paddingBottom: 6,
      }}>
        {count}
      </span>
    </button>
  );
}

// ─── Admin: add a Creative Specialist SOP ─────────────────────────────────────

const csInput: React.CSSProperties = { padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 8, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const csPrimary: React.CSSProperties = { padding: '9px 16px', background: 'rgba(201,164,85,0.16)', border: '1px solid rgba(201,164,85,0.35)', borderRadius: 8, color: '#c9a455', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const csGhost: React.CSSProperties = { padding: '9px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, cursor: 'pointer' };

function CreateSopModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return; }
    if (!file) { setErr('Attach a PDF'); return; }
    setSaving(true); setErr('');
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('sub', sub.trim());
    fd.append('file', file);
    const res = await fetch('/api/admin/sops/creative', { method: 'POST', body: fd }).catch(() => null);
    setSaving(false);
    if (res && res.ok) onCreated();
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to add'); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(4,3,2,0.78)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'rgba(20,16,9,0.97)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.15rem' }}>New Creative Specialist SOP</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a89e8a', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={csInput} />
        <textarea value={sub} onChange={(e) => setSub(e.target.value)} rows={2} placeholder="Short description (optional)" style={{ ...csInput, resize: 'vertical' }} />
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; setFile(f || null); if (f) setErr(''); }} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={csGhost}>{file ? 'Change PDF' : 'Attach PDF'}</button>
          {file && <span style={{ fontSize: 12, color: '#d9cfba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{file.name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={save} disabled={saving} style={csPrimary}>{saving ? 'Adding…' : 'Add SOP'}</button>
          <button onClick={onClose} style={csGhost}>Cancel</button>
          {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function SopsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed] = useState(false);
  const [visible, setVisible] = useState(false);
  // null = show landing selector; SopGroup = show that group's grid
  const [selectedGroup, setSelectedGroup] = useState<SopGroup | null>(null);
  const [activeSop, setActiveSop] = useState<SopEntry | null>(null);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [creative, setCreative] = useState<{ id: string; title: string; sub: string; file: string }[]>([]);
  const [creating, setCreating] = useState(false);

  const loadCreative = () =>
    fetch('/api/sops/creative', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCreative(Array.isArray(d) ? d : []))
      .catch(() => {});

  useEffect(() => {
    setAuthed(true);
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((u) => setIsAdmin(u?.role === 'admin')).catch(() => {});
    loadCreative();
    setTimeout(() => {
      setVisible(true);
      // Open specific SOP if ?sop=badge param present
      const badge = searchParams.get('sop');
      if (badge) {
        const target = SOPS.find((s) => s.badge === badge);
        if (target) {
          setSelectedGroup(target.group);
          setActiveSop(target);
        }
      }
    }, 80);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin-managed Creative Specialist SOPs → SopEntry shape, merged with the
  // static catalog for display, counts, and search.
  const allSops = useMemo<SopEntry[]>(() => {
    const dyn: SopEntry[] = creative.map((c) => ({
      badge: c.id, title: c.title, sub: c.sub || '', group: 'creative-specialist', div: 'Creative Specialist', file: c.file,
    }));
    return [...SOPS, ...dyn];
  }, [creative]);

  const groupCounts = useMemo(() => {
    const c: Record<SopGroup, number> = { content: 0, offer: 0, 'cash-injection': 0, fulfillment: 0, systems: 0, 'creative-specialist': 0 };
    for (const s of allSops) c[s.group]++;
    return c;
  }, [allSops]);

  // Surface groups with SOPs; always show Creative Specialist to admins so they
  // can add the first one.
  const activeGroups = useMemo(
    () => GROUPS.filter((g) => groupCounts[g] > 0 || (isAdmin && g === 'creative-specialist')),
    [groupCounts, isAdmin],
  );

  const displayedSops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return allSops.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.sub.toLowerCase().includes(q) ||
          s.div.toLowerCase().includes(q)
      );
    }
    if (selectedGroup) return allSops.filter((s) => s.group === selectedGroup);
    return [];
  }, [selectedGroup, search, allSops]);

  const deleteCreative = async (id: string) => {
    if (!confirm('Delete this SOP? This can’t be undone.')) return;
    await fetch(`/api/admin/sops/creative/${id}`, { method: 'DELETE' }).catch(() => {});
    setActiveSop(null);
    loadCreative();
  };

  if (!authed) return null;

  const isSearching = !!search.trim();
  // Show grid when a group is selected OR searching
  const showGrid = isSearching || selectedGroup !== null;

  const handleBack = () => {
    if (showGrid && !isSearching) {
      setSelectedGroup(null);
    } else if (isSearching) {
      setSearch('');
    } else {
      router.push('/select');
    }
  };

  return (
    <main style={{
      position: 'relative', width: '100vw', height: '100vh',
      overflow: 'hidden', background: '#050403',
    }}>
      <MeshBg speed={0.2} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)',
      }} />

      {activeSop && (
        <SopReader
          sop={activeSop}
          onClose={() => setActiveSop(null)}
          onDelete={isAdmin && activeSop.group === 'creative-specialist' ? () => deleteCreative(activeSop.badge) : undefined}
        />
      )}
      {creating && <CreateSopModal onCreated={() => { setCreating(false); loadCreative(); }} onClose={() => setCreating(false)} />}

      {/* Back arrow — always visible */}
      <button
        onClick={handleBack}
        style={{
          position: 'fixed', top: 28, left: 32, zIndex: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(201,164,85,0.5)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
          fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'color 0.2s', padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >
        {showGrid ? '← Back' : '← Menu'}
      </button>

      {/* Scrollable column */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        overflowY: 'auto',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        padding: showGrid ? '80px 28px 110px' : '0 28px',
        display: showGrid ? 'block' : 'flex',
        alignItems: showGrid ? undefined : 'center',
        justifyContent: showGrid ? undefined : 'center',
        minHeight: '100%',
      }}>

        {/* ── Landing selector ── */}
        {!showGrid && (
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '10px', letterSpacing: '0.4em',
              textTransform: 'uppercase', fontWeight: 700,
              color: 'rgba(201,164,85,0.4)', marginBottom: '2.5rem',
            }}>
              SOP Library
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              {activeGroups.map((g) => (
                <GroupSelectorItem
                  key={g}
                  g={g}
                  count={groupCounts[g]}
                  onClick={() => setSelectedGroup(g)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Grid view ── */}
        {showGrid && (
          <>
            {/* Header row */}
            <div style={{ textAlign: 'left', width: '100%', maxWidth: 1120, margin: '0 auto 2rem' }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px', letterSpacing: '0.4em',
                textTransform: 'uppercase', fontWeight: 700,
                color: 'rgba(201,164,85,0.45)',
                marginBottom: '1.5rem',
              }}>
                {isSearching ? 'Search' : selectedGroup ? GROUP_LABELS[selectedGroup] : 'SOP Library'}
              </p>

              {/* Group tabs — visible in grid, hidden while searching */}
              {!isSearching && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-start',
                  gap: 6, flexWrap: 'wrap',
                }}>
                  {activeGroups.map((g) => (
                    <GroupTab
                      key={g}
                      label={GROUP_LABELS[g]}
                      count={groupCounts[g]}
                      active={selectedGroup === g}
                      onClick={() => setSelectedGroup(g)}
                    />
                  ))}
                </div>
              )}

              {/* Search results count */}
              {isSearching && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase',
                  color: 'rgba(201,164,85,0.4)',
                }}>
                  {displayedSops.length} result{displayedSops.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Glass plate grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
              maxWidth: 1120,
              margin: '0 auto',
            }}>
              {displayedSops.map((sop) => (
                <SopCard key={sop.badge} sop={sop} onClick={() => setActiveSop(sop)} />
              ))}
              {isAdmin && !isSearching && selectedGroup === 'creative-specialist' && (
                <button
                  onClick={() => setCreating(true)}
                  style={{
                    minHeight: 160, borderRadius: 16, cursor: 'pointer',
                    background: 'rgba(201,164,85,0.05)', border: '1px dashed rgba(201,164,85,0.35)',
                    color: '#c9a455', fontFamily: "'DM Sans', sans-serif", fontSize: '14px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.05)'; }}
                >
                  + Add SOP
                </button>
              )}
              {displayedSops.length === 0 && !(isAdmin && !isSearching && selectedGroup === 'creative-specialist') && (
                <p style={{
                  gridColumn: '1/-1', textAlign: 'center',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                  color: 'rgba(240,232,212,0.22)', paddingTop: '3rem',
                }}>
                  Nothing found
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Search bar — fixed bottom */}
      <div style={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, width: '100%', maxWidth: 400, padding: '0 24px',
      }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search SOPs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.2)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(201,164,85,0.15)',
              borderRadius: 100,
              padding: '11px 40px 11px 18px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px', color: 'rgba(240,232,212,0.85)',
              outline: 'none', caretColor: '#c9a455',
              letterSpacing: '0.02em',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            } as React.CSSProperties}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(201,164,85,0.35)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201,164,85,0.15)')}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(201,164,85,0.4)', fontSize: 16,
                lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SopsPage() {
  return (
    <Suspense fallback={null}>
      <SopsPageInner />
    </Suspense>
  );
}
