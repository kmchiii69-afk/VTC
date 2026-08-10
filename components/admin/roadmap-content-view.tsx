'use client';

import { useEffect, useState } from 'react';
import { PHASES } from '@/lib/roadmap-data';
import { CREATIVE_PHASES } from '@/lib/creative-roadmap-data';

const gold = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

interface Link { label: string; url: string }
interface Override { description: string | null; links: Link[] }

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(201,164,85,0.18)', borderRadius: 8, color: cream,
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
};

function ItemEditor({ itemId, initialDesc, initialLinks, onCancel, onSaved }: {
  itemId: string; initialDesc: string; initialLinks: Link[];
  onCancel: () => void; onSaved: (o: Override) => void;
}) {
  const [desc, setDesc] = useState(initialDesc);
  const [links, setLinks] = useState<Link[]>(initialLinks.length ? initialLinks : []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const cleanLinks = links.filter((l) => l.label.trim() && l.url.trim());
    try {
      const res = await fetch('/api/roadmap-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, description: desc, links: cleanLinks }),
      });
      if (res.ok) onSaved({ description: desc.trim() ? desc : null, links: cleanLinks });
      else { const d = await res.json().catch(() => ({})); setErr(d.error || 'Save failed'); }
    } catch { setErr('Network error'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '12px 14px', background: 'rgba(201,164,85,0.05)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10, marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: faint, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Description</label>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: 6, marginBottom: 14, resize: 'vertical', lineHeight: 1.5 }} placeholder="What this step is and why it matters…" />

      <label style={{ fontSize: 11, color: faint, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Links</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, marginBottom: 10 }}>
        {links.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={l.label} onChange={(e) => setLinks((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Label" style={{ ...inputStyle, flex: 1 }} />
            <input value={l.url} onChange={(e) => setLinks((p) => p.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" style={{ ...inputStyle, flex: 2 }} />
            <button onClick={() => setLinks((p) => p.filter((_, j) => j !== i))} title="Remove" style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.8)', borderRadius: 8, cursor: 'pointer', padding: '7px 10px', flexShrink: 0 }}>✕</button>
          </div>
        ))}
        <button onClick={() => setLinks((p) => [...p, { label: '', url: '' }])} style={{ alignSelf: 'flex-start', background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.25)', color: gold, borderRadius: 8, cursor: 'pointer', padding: '7px 12px', fontSize: 12.5, fontFamily: "'DM Sans', sans-serif" }}>+ Add link</button>
      </div>

      {err && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ background: gold, border: 'none', color: '#0a0806', borderRadius: 8, cursor: 'pointer', padding: '8px 16px', fontSize: 12.5, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: sub, borderRadius: 8, cursor: 'pointer', padding: '8px 16px', fontSize: 12.5, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
      </div>
    </div>
  );
}

export function RoadmapContentView() {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [editing, setEditing] = useState<string | null>(null);
  // Two separate roadmaps share this editor (overrides are keyed by item id, so
  // one table serves both): the standard client one and the Creative Specialist
  // one shown instead to members tagged `creative_specialist`.
  const [which, setWhich] = useState<'client' | 'creative'>('client');

  useEffect(() => {
    fetch('/api/roadmap-content').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.overrides) setOverrides(d.overrides); }).catch(() => {});
  }, []);

  return (
    <div>
      <p style={{ fontSize: 13, color: sub, lineHeight: 1.6, margin: '0 0 16px', maxWidth: 620 }}>
        Edit the description and resource links shown inside each roadmap step&apos;s dropdown. Changes apply to every client on that roadmap. (Run <code style={{ color: gold }}>supabase-roadmap-content.sql</code> once if saving fails.)
      </p>

      <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 22, borderRadius: 100, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.14)' }}>
        {([['client', 'Client Roadmap'], ['creative', 'Creative Specialist']] as const).map(([key, label]) => {
          const active = which === key;
          return (
            <button key={key} onClick={() => { setWhich(key); setEditing(null); }} style={{
              padding: '7px 16px', borderRadius: 100, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, letterSpacing: '0.05em',
              background: active ? 'rgba(201,164,85,0.14)' : 'transparent',
              border: active ? '1px solid rgba(201,164,85,0.3)' : '1px solid transparent',
              color: active ? gold : 'rgba(201,164,85,0.45)',
            }}>{label}</button>
          );
        })}
      </div>

      {(which === 'creative' ? CREATIVE_PHASES : PHASES).map((phase) => (
        <div key={phase.id} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, color: phase.color }}>{phase.label}</span>
            <span className="font-serif" style={{ fontSize: '1.05rem', color: cream }}>{phase.title}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {phase.items.map((item) => {
              const ov = overrides[item.id];
              const effDesc = (ov?.description ?? item.desc) ?? '';
              const effLinks = (ov && ov.links.length ? ov.links : item.links) ?? [];
              if (editing === item.id) {
                return (
                  <ItemEditor
                    key={item.id}
                    itemId={item.id}
                    initialDesc={effDesc}
                    initialLinks={effLinks}
                    onCancel={() => setEditing(null)}
                    onSaved={(o) => { setOverrides((p) => ({ ...p, [item.id]: o })); setEditing(null); }}
                  />
                );
              }
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.1)', borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: cream, fontWeight: 600, marginBottom: 3 }}>
                      {item.text}{ov && <span style={{ marginLeft: 8, fontSize: 10, color: gold, letterSpacing: '0.08em', textTransform: 'uppercase' }}>· edited</span>}
                    </div>
                    <div style={{ fontSize: 12, color: faint, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{effDesc || '— no description —'}</div>
                    {effLinks.length > 0 && (
                      <div style={{ fontSize: 11, color: 'rgba(201,164,85,0.7)', marginTop: 5 }}>{effLinks.length} link{effLinks.length > 1 ? 's' : ''}</div>
                    )}
                  </div>
                  <button onClick={() => setEditing(item.id)} style={{ flexShrink: 0, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', color: gold, borderRadius: 8, cursor: 'pointer', padding: '7px 14px', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Edit</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
