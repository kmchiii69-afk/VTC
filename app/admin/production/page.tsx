'use client';

import { useEffect, useState } from 'react';

// Team-facing production board. Admin creates videos per client, posts scripts,
// then advances editing → delivered. Client-owned steps (approve/record/upload)
// show as read-only status here. Writes go to /api/admin/videos.

const RED = '#F55A4E';
const CREAM = '#f0e8d4';
const DIM = 'rgba(240,232,212,0.55)';
const DONE = '#7ed492';

interface Progress { [k: string]: { done: true; at: string; by: string }; }
interface Video {
  id: string; client_email: string; title: string;
  script_url: string | null; script_note: string | null;
  recording_url: string | null; final_url: string | null; progress: Progress;
}

const LABELS = ['Script Ready', 'Script Approved', 'Recorded', 'Recording Uploaded', 'Editing', 'Delivered'];
const isDone = (p: Progress, i: number) => !!p[String(i)]?.done;
const doneCount = (p: Progress) => { let n = 0; for (let i = 0; i < 6; i++) { if (isDone(p, i)) n++; else break; } return n; };

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,87,78,0.18)', borderRadius: 14, padding: '18px 20px' };
const input: React.CSSProperties = { height: 38, padding: '0 12px', borderRadius: 8, fontSize: 13, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(245,87,78,0.25)', color: CREAM, outline: 'none' };
const btn = (primary = true): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: primary ? 'none' : `1px solid ${RED}66`, background: primary ? RED : 'transparent', color: primary ? '#160404' : RED, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' });

export default function AdminProductionPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch('/api/admin/videos', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Admin access required.'); return r.json(); })
      .then((d) => setVideos(d.videos ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!newEmail.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/admin/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientEmail: newEmail.trim(), title: newTitle.trim() || 'Untitled video' }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setVideos((p) => [d.video, ...p]); setNewEmail(''); setNewTitle('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const patch = async (videoId: string, body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/admin/videos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, ...body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setVideos((p) => p.map((v) => (v.id === videoId ? d.video : v)));
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
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: CREAM, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(40px,7vw,72px) clamp(20px,5vw,32px)' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: RED, marginBottom: 10 }}>VTC · Team</div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, marginBottom: 8 }}>Production board</h1>
        <p style={{ color: DIM, marginBottom: 24, lineHeight: 1.6 }}>Create a video for a client, post the script, then move it through editing and delivery. Client steps (approve, record, upload) update themselves.</p>

        {/* New video */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: DIM, marginBottom: 12 }}>New video</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Client email" style={{ ...input, flex: 1, minWidth: 220 }} />
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Video title" style={{ ...input, flex: 1, minWidth: 220 }} />
            <button disabled={busy || !newEmail.trim()} onClick={create} style={btn()}>Create</button>
          </div>
        </div>

        {err && <p style={{ color: RED, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: DIM }}>Loading…</p>}
        {!loading && videos.length === 0 && <p style={{ color: DIM }}>No videos yet.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {videos.map((v) => {
            const dc = doneCount(v.progress);
            return (
              <div key={v.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>{v.title}</div>
                    <div style={{ fontSize: 12.5, color: DIM }}>{v.client_email}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dc >= 6 ? DONE : RED }}>{dc >= 6 ? 'Delivered' : `${LABELS[dc] ?? ''} · ${dc}/6`}</span>
                </div>

                {/* Checkpoint dots */}
                <div style={{ display: 'flex', gap: 6, margin: '14px 0', flexWrap: 'wrap' }}>
                  {LABELS.map((l, i) => (
                    <span key={i} title={l} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                      background: isDone(v.progress, i) ? 'rgba(126,212,146,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isDone(v.progress, i) ? DONE : 'rgba(255,255,255,0.12)'}`,
                      color: isDone(v.progress, i) ? DONE : 'rgba(255,255,255,0.4)' }}>{isDone(v.progress, i) ? '✓ ' : ''}{l}</span>
                  ))}
                </div>

                {v.recording_url && <div style={{ fontSize: 12.5, marginBottom: 8 }}>📤 Recording: <a href={v.recording_url} target="_blank" rel="noopener noreferrer" style={{ color: RED }}>{v.recording_url}</a></div>}

                {/* Team actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <PostScript video={v} onPost={(scriptUrl, scriptNote) => patch(v.id, { action: 'post_script', scriptUrl, scriptNote })} busy={busy} />
                  {isDone(v.progress, 3) && !isDone(v.progress, 4) && <button disabled={busy} onClick={() => patch(v.id, { action: 'set_editing' })} style={btn()}>Start editing</button>}
                  {isDone(v.progress, 4) && !isDone(v.progress, 5) && <DeliverBtn onDeliver={(finalUrl) => patch(v.id, { action: 'deliver', finalUrl })} busy={busy} />}
                  <button disabled={busy} onClick={() => remove(v.id)} style={{ ...btn(false), color: '#c96', borderColor: 'rgba(204,153,102,0.4)', marginLeft: 'auto' }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PostScript({ video, onPost, busy }: { video: Video; onPost: (url: string, note: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(video.script_url ?? '');
  const [note, setNote] = useState(video.script_note ?? '');
  const posted = !!video.progress['0']?.done;
  if (!open) return <button disabled={busy} onClick={() => setOpen(true)} style={btn(!posted)}>{posted ? 'Edit script' : 'Post script'}</button>;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Script link (Google Doc…)" style={{ ...input, flex: 1, minWidth: 220 }} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...input, flex: 1, minWidth: 180 }} />
      <button disabled={busy} onClick={() => { onPost(url, note); setOpen(false); }} style={btn()}>Save</button>
    </div>
  );
}

function DeliverBtn({ onDeliver, busy }: { onDeliver: (url: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  if (!open) return <button disabled={busy} onClick={() => setOpen(true)} style={btn()}>Deliver</button>;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Final video link" style={{ ...input, flex: 1, minWidth: 220 }} />
      <button disabled={busy} onClick={() => { onDeliver(url); setOpen(false); }} style={btn()}>Mark delivered</button>
    </div>
  );
}
