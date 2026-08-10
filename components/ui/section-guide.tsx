'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, X, Pencil, Plus } from 'lucide-react';
import { type SectionGuide as Guide, loomEmbedUrl } from '@/lib/guides';
import { trackView } from '@/lib/track';

const G = '#c9a455';

// Module-level cache so switching portal views doesn't refetch every time.
let cache: Guide[] | null = null;
let adminCache: boolean | null = null;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((fn) => fn()); }

async function loadGuides(force = false): Promise<Guide[]> {
  if (cache && !force) return cache;
  const r = await fetch('/api/guides').catch(() => null);
  cache = r && r.ok ? await r.json().catch(() => []) : [];
  notify();
  return cache!;
}

async function loadAdmin(): Promise<boolean> {
  if (adminCache !== null) return adminCache;
  const r = await fetch('/api/auth/me').catch(() => null);
  const u = r && r.ok ? await r.json().catch(() => null) : null;
  adminCache = u?.role === 'admin';
  return adminCache;
}

export function SectionGuide({ section }: { section: string }) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until we know there's a guide
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const dismissKey = `guide_dismissed_${section}`;

  const sync = () => {
    const g = (cache || []).find((x) => x.section === section) || null;
    setGuide(g);
    setUrl(g?.loom_url || '');
    setTitle(g?.title || '');
  };

  useEffect(() => {
    const fn = () => sync();
    listeners.add(fn);
    loadGuides().then(sync);
    loadAdmin().then(setIsAdmin);
    try { setDismissed(localStorage.getItem(dismissKey) === '1'); } catch {}
    return () => { listeners.delete(fn); };
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(dismissKey, '1'); } catch {} };
  const undismiss = () => { setDismissed(false); try { localStorage.removeItem(dismissKey); } catch {} };

  const save = async () => {
    setSaving(true); setErr('');
    const res = await fetch('/api/guides', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, loom_url: url.trim(), title: title.trim() || null }),
    });
    setSaving(false);
    if (res.ok) { await loadGuides(true); setEditing(false); }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || 'Failed to save'); }
  };

  const embed = loomEmbedUrl(guide?.loom_url);

  // Open the guide video, logging a view for members (not admins).
  const watch = () => {
    if (!embed) return;
    if (!isAdmin) trackView('guide_view', section, guide?.title || undefined);
    setOpen(true);
  };

  // ── Admin editor ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div style={card}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 600, marginBottom: 10 }}>
          Section guide · Loom walkthrough
        </div>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste Loom share link (https://www.loom.com/share/…)" style={input} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional, e.g. 'How to use the Roadmap')" style={{ ...input, marginTop: 8 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save guide'}</button>
          <button onClick={() => { setEditing(false); setUrl(guide?.loom_url || ''); setErr(''); }} style={btnGhost}>Cancel</button>
          {guide?.loom_url && (
            <button onClick={() => { setUrl(''); setTimeout(save, 0); }} disabled={saving} style={{ ...btnGhost, color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', marginLeft: 'auto' }}>Remove</button>
          )}
          {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#857a67', marginTop: 8 }}>Tip: in Loom, click <strong>Share → Copy link</strong> and paste it here.</div>
      </div>
    );
  }

  // ── No guide yet ────────────────────────────────────────────────────────────
  if (!guide?.loom_url) {
    if (!isAdmin) return null; // members see nothing until a guide exists
    return (
      <button onClick={() => setEditing(true)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'rgba(201,164,85,0.7)', textAlign: 'left' }}>
        <Plus size={15} /> <span style={{ fontSize: 13 }}>Add a guide video for this section</span>
      </button>
    );
  }

  // ── Dismissed → slim reopen pill ──────────────────────────────────────────
  if (dismissed) {
    return (
      <button onClick={undismiss} title="Show section guide" style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 18,
        padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
        background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.18)',
        color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
      }}>
        <Play size={12} /> Watch section guide
      </button>
    );
  }

  // ── Banner card ──────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', rowGap: 12 }}>
        <button onClick={watch} style={{
          flexShrink: 0, width: 52, height: 52, borderRadius: 12, cursor: 'pointer',
          background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: G,
        }}>
          <Play size={20} fill={G} />
        </button>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>
            Section guide
          </div>
          <div className="font-serif" style={{ fontSize: '1.05rem', color: '#f0e8d4', marginTop: 2, lineHeight: 1.2 }}>
            {guide.title || 'How to use this section'}
          </div>
        </div>
        <button onClick={watch} style={btnPrimary}>Watch</button>
        {isAdmin && (
          <button onClick={() => setEditing(true)} title="Edit guide" style={iconBtn}><Pencil size={14} /></button>
        )}
        <button onClick={dismiss} title="Dismiss" style={iconBtn}><X size={15} /></button>
      </div>

      {open && embed && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 880 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.1rem' }}>{guide.title || 'How to use this section'}</span>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a' }}><X size={22} /></button>
            </div>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 14, overflow: 'hidden', background: '#000', border: '1px solid rgba(201,164,85,0.2)' }}>
              <iframe src={embed} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(201,164,85,0.16)',
  borderRadius: 14, padding: '14px 16px', marginBottom: 20, width: '100%',
  fontFamily: "'DM Sans', sans-serif",
};

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)',
  borderRadius: 8, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 18px', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.32)',
  borderRadius: 8, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.1em',
  textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
};

const btnGhost: React.CSSProperties = {
  padding: '9px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#857a67',
  padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
