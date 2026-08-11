'use client';

import { useEffect, useState } from 'react';
import { THEME as T } from '@/lib/theme';

// Team/admin production board. Create videos, assign seats, and advance each
// video through its team-owned stages. Client stages (interview, record,
// review) update themselves from /production.

interface Stage { key: string; label: string; owner: string; actor: 'client' | 'team'; hint: string; }
type Progress = Record<string, { done: true; at: string; by: string }>;
interface Video {
  id: string; client_email: string; title: string; script_type: string; dfy: boolean;
  script_url: string | null; recording_url: string | null; final_url: string | null;
  versions: Record<string, string>; assignees: Record<string, string>; status_note: string | null;
  progress: Progress; stages: Stage[];
}

const isDone = (p: Progress, k: string) => !!p[k]?.done;
const currentStage = (v: Video): Stage | null => v.stages.find((s) => !isDone(v.progress, s.key)) ?? null;

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '18px 20px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' };
const input: React.CSSProperties = { height: 38, padding: '0 12px', borderRadius: 8, fontSize: 13, background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink, outline: 'none' };
const btn = (primary = true): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.accent : 'transparent', color: primary ? T.accentInk : T.accentSoft, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' });

const SEATS = ['strategist', 'scriptwriter', 'qa', 'editor', 'thumbnail'];

export default function AdminProductionPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nEmail, setNEmail] = useState('');
  const [nTitle, setNTitle] = useState('');
  const [nType, setNType] = useState('outline');
  const [nDfy, setNDfy] = useState('dfy');

  const load = () => {
    fetch('/api/admin/videos', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Admin access required.'); return r.json(); })
      .then((d) => setVideos(d.videos ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const patch = async (videoId: string, body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/admin/videos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, ...body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setVideos((p) => p.map((v) => (v.id === videoId ? d.video : v)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const create = async () => {
    if (!nEmail.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/admin/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmail: nEmail.trim(), title: nTitle.trim() || 'Untitled video', scriptType: nType, dfy: nDfy === 'dfy' }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setVideos((p) => [d.video, ...p]); setNEmail(''); setNTitle('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const remove = async (videoId: string) => {
    if (!confirm('Delete this video?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/videos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId }) });
      if (res.ok) setVideos((p) => p.filter((v) => v.id !== videoId));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 940, margin: '0 auto', padding: 'clamp(40px,7vw,72px) clamp(20px,5vw,32px)' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 10 }}>VTC · Team</div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, marginBottom: 8 }}>Production board</h1>
        <p style={{ color: T.inkDim, marginBottom: 24, lineHeight: 1.6 }}>Create a video, assign seats, and move it through its team stages. Client steps update themselves.</p>

        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.inkDim, marginBottom: 12 }}>New video</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="Client email" style={{ ...input, flex: 1, minWidth: 200 }} />
            <input value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Video title" style={{ ...input, flex: 1, minWidth: 180 }} />
            <select value={nType} onChange={(e) => setNType(e.target.value)} style={{ ...input, minWidth: 130 }}>
              <option value="outline">Outline</option>
              <option value="full">Full script</option>
              <option value="interview">Interview</option>
            </select>
            <select value={nDfy} onChange={(e) => setNDfy(e.target.value)} style={{ ...input, minWidth: 110 }}>
              <option value="dfy">DFY (edit)</option>
              <option value="dwy">DWY (package)</option>
            </select>
            <button disabled={busy || !nEmail.trim()} onClick={create} style={btn()}>Create</button>
          </div>
        </div>

        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}
        {!loading && videos.length === 0 && <p style={{ color: T.inkDim }}>No videos yet.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {videos.map((v) => {
            const cur = currentStage(v);
            const canDeliver = v.stages.some((s) => s.key === 'published') && cur?.key !== 'published' && !!cur;
            return (
              <div key={v.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{v.title}</div>
                    <div style={{ fontSize: 12.5, color: T.inkDim }}>{v.client_email} · {v.dfy ? 'DFY' : 'DWY'} · {v.script_type}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: cur ? T.accentSoft : T.ok }}>{cur ? cur.label : 'Delivered'}</span>
                </div>

                {/* Stage chips */}
                <div style={{ display: 'flex', gap: 6, margin: '14px 0', flexWrap: 'wrap' }}>
                  {v.stages.map((s) => {
                    const done = isDone(v.progress, s.key);
                    const isCur = cur?.key === s.key;
                    return (
                      <span key={s.key} title={s.owner} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                        background: done ? 'rgba(143,209,158,0.16)' : isCur ? 'rgba(183,93,105,0.2)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${done ? T.ok : isCur ? T.accent : 'rgba(255,245,235,0.14)'}`,
                        color: done ? T.ok : isCur ? T.accentSoft : T.inkFaint }}>{done ? '✓ ' : ''}{s.label}</span>
                    );
                  })}
                </div>

                {v.recording_url && <div style={{ fontSize: 12.5, marginBottom: 8 }}>🎬 Footage: <a href={v.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accentSoft }}>{v.recording_url}</a></div>}

                {/* Team actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cur && cur.actor === 'team' && cur.key !== 'published' && (
                    <button disabled={busy} onClick={() => patch(v.id, cur.key === 'scripting' ? { action: 'post_script' } : { action: 'complete_stage', stageKey: cur.key })} style={btn()}>
                      {cur.key === 'scripting' ? 'Post script' : `Complete: ${cur.label}`}
                    </button>
                  )}
                  {cur && cur.actor === 'client' && (
                    <span style={{ fontSize: 12, color: T.accentSoft }}>⏳ Waiting on client — {cur.label}</span>
                  )}
                  {canDeliver && cur?.key === 'published' && (
                    <PromptBtn label="Deliver" placeholder="Final video link" onSubmit={(url) => patch(v.id, { action: 'deliver', finalUrl: url })} busy={busy} />
                  )}
                  <PromptBtn label="Status note" placeholder="e.g. Chase footage" onSubmit={(note) => patch(v.id, { action: 'set_status', note })} busy={busy} ghost />
                  <button disabled={busy} onClick={() => remove(v.id)} style={{ ...btn(false), marginLeft: 'auto' }}>Delete</button>
                </div>

                {/* Seat assignments */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                  {SEATS.map((role) => (
                    <PromptBtn key={role} label={`${role}: ${v.assignees[role]?.split('@')[0] ?? '—'}`}
                      placeholder={`${role} email`} onSubmit={(email) => patch(v.id, { action: 'assign', role, email })} busy={busy} ghost small />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PromptBtn({ label, placeholder, onSubmit, busy, ghost, small }: {
  label: string; placeholder: string; onSubmit: (val: string) => void; busy: boolean; ghost?: boolean; small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const style: React.CSSProperties = ghost
    ? { padding: small ? '5px 10px' : '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.accentSoft, fontSize: small ? 11 : 12.5, fontWeight: 600, cursor: 'pointer' }
    : { padding: '8px 14px', borderRadius: 8, border: 'none', background: T.accent, color: T.accentInk, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
  if (!open) return <button disabled={busy} onClick={() => setOpen(true)} style={style}>{label}</button>;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
        style={{ height: 32, padding: '0 10px', borderRadius: 8, fontSize: 12.5, background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink, outline: 'none' }} />
      <button disabled={busy} onClick={() => { onSubmit(val.trim()); setOpen(false); setVal(''); }} style={{ ...style, background: T.accent, color: T.accentInk, border: 'none' }}>OK</button>
    </span>
  );
}
