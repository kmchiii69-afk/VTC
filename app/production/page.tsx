'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';

// VTC production pipeline — the client's "roadmap" per video. Each video moves
// through 6 checkpoints; the client acts on their own steps (approve script,
// mark recorded, upload recording) and watches the team's steps.

const RED = '#e0908a';       // soft light red accent
const RED_STRONG = '#F55A4E';
const CREAM = '#f0e8d4';
const DIM = 'rgba(240,232,212,0.55)';
const DONE = '#7ed492';

interface Checkpoint { id: number; label: string; owner: 'team' | 'client'; hint: string; }
type Progress = Record<string, { done: true; at: string; by: string }>;
interface Video {
  id: string; title: string;
  script_url: string | null; script_note: string | null;
  recording_url: string | null; final_url: string | null;
  progress: Progress;
}

const isDone = (p: Progress, i: number) => !!p[String(i)]?.done;
const doneCount = (p: Progress, total: number) => {
  let n = 0; for (let i = 0; i < total; i++) { if (isDone(p, i)) n++; else break; } return n;
};

function StageRow({ cp, video, total, busy, onAction }: {
  cp: Checkpoint; video: Video; total: number; busy: boolean;
  onAction: (action: string, url?: string) => void;
}) {
  const [link, setLink] = useState('');
  const p = video.progress;
  const complete = isDone(p, cp.id);
  const unlocked = cp.id === 0 ? true : isDone(p, cp.id - 1);
  const current = unlocked && !complete;
  const at = p[String(cp.id)]?.at;

  const dot: React.CSSProperties = {
    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
    background: complete ? 'rgba(126,212,146,0.14)' : current ? 'rgba(224,144,138,0.14)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${complete ? DONE : current ? RED : 'rgba(255,255,255,0.14)'}`,
    color: complete ? DONE : current ? RED : 'rgba(255,255,255,0.3)',
  };

  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', opacity: unlocked ? 1 : 0.45 }}>
      <div style={dot}>{complete ? '✓' : unlocked ? '' : '🔒'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: complete ? DIM : CREAM }}>{cp.label}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: cp.owner === 'client' ? RED : 'rgba(255,255,255,0.32)',
            border: `1px solid ${cp.owner === 'client' ? 'rgba(224,144,138,0.4)' : 'rgba(255,255,255,0.14)'}`,
            borderRadius: 20, padding: '2px 8px' }}>
            {cp.owner === 'client' ? 'Your step' : 'Team'}
          </span>
          {complete && at && <span style={{ fontSize: 11.5, color: DONE }}>✓ {new Date(at).toLocaleDateString()}</span>}
        </div>
        {(current || (complete && (cp.id === 0 || cp.id === 3 || cp.id === 5))) && (
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>{cp.hint}</p>
        )}

        {/* Script link (visible once posted) */}
        {cp.id === 0 && complete && video.script_url && (
          <a href={video.script_url} target="_blank" rel="noopener noreferrer" style={pill}>📄 View script ↗</a>
        )}
        {cp.id === 0 && complete && video.script_note && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: DIM, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>“{video.script_note}”</p>
        )}

        {/* Client actions on their current step */}
        {current && cp.id === 1 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {video.script_url && <a href={video.script_url} target="_blank" rel="noopener noreferrer" style={pill}>📄 Read the script ↗</a>}
            <button disabled={busy} onClick={() => onAction('approve_script')} style={btn}>Approve script</button>
          </div>
        )}
        {current && cp.id === 2 && (
          <button disabled={busy} onClick={() => onAction('mark_recorded')} style={{ ...btn, marginTop: 10 }}>I&apos;ve recorded it</button>
        )}
        {current && cp.id === 3 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Paste recording link (Drive / Loom / Dropbox)"
                style={{ flex: 1, minWidth: 240, height: 40, padding: '0 14px', borderRadius: 9, fontSize: 13,
                  background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(224,144,138,0.3)', color: CREAM, outline: 'none' }}
              />
              <button disabled={busy || !link.trim()} onClick={() => onAction('submit_recording', link.trim())} style={btn}>Submit</button>
            </div>
          </div>
        )}

        {/* Uploaded recording link (read-only reflection) */}
        {cp.id === 3 && complete && video.recording_url && (
          <a href={video.recording_url} target="_blank" rel="noopener noreferrer" style={pill}>📤 Your recording ↗</a>
        )}
        {/* Team step in progress */}
        {cp.owner === 'team' && current && cp.id !== 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: RED }}>⏳ Waiting on your VTC team…</p>
        )}
        {/* Delivered final */}
        {cp.id === 5 && complete && video.final_url && (
          <a href={video.final_url} target="_blank" rel="noopener noreferrer" style={{ ...pill, borderColor: DONE, color: DONE, background: 'rgba(126,212,146,0.1)' }}>▶ Watch the final video ↗</a>
        )}
      </div>
    </div>
  );
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '7px 13px', borderRadius: 9,
  background: 'rgba(224,144,138,0.1)', border: '1px solid rgba(224,144,138,0.3)',
  color: RED, textDecoration: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const btn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 9, border: 'none', background: RED_STRONG, color: '#1a0605',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? DONE : RED, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: pct === 100 ? DONE : RED, flexShrink: 0 }}>{value}/{total}</span>
    </div>
  );
}

export default function ProductionPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const load = () => {
    fetch('/api/me/videos', { cache: 'no-store' })
      .then((r) => { if (r.status === 401) { router.replace('/'); return null; } if (!r.ok) throw new Error('Could not load your videos'); return r.json(); })
      .then((d) => { if (d) { setVideos(d.videos); setCheckpoints(d.checkpoints); } })
      .catch((e) => setErr(e.message))
      .finally(() => { setLoading(false); setTimeout(() => setVisible(true), 60); });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (videoId: string, action: string, url?: string) => {
    setBusyId(videoId); setErr(null);
    try {
      const res = await fetch('/api/me/videos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, action, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setVideos((prev) => prev.map((v) => (v.id === videoId ? data.video : v)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const total = checkpoints.length || 6;

  return (
    <main style={{ position: 'relative', width: '100vw', minHeight: '100vh', overflowX: 'hidden', background: '#050403' }}>
      <MeshBg speed={0.2} />
      <button onClick={() => router.push('/select')} style={{ position: 'fixed', top: 28, left: 32, zIndex: 10, background: 'none', border: 'none', cursor: 'pointer', color: RED, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>← Menu</button>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 820, margin: '0 auto', padding: '84px 24px 80px',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(14px)', transition: 'opacity 0.5s, transform 0.5s' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: RED, marginBottom: 8 }}>VTC · Production</div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 'clamp(2rem,4vw,2.8rem)', color: CREAM, margin: '0 0 6px' }}>Your videos</h1>
        <p style={{ color: DIM, margin: '0 0 32px', lineHeight: 1.6 }}>Every video moves through the same checkpoints. Handle your steps as they light up — your team handles the rest.</p>

        {loading && <p style={{ color: DIM }}>Loading…</p>}
        {err && <p style={{ color: RED_STRONG, marginBottom: 16 }}>{err}</p>}

        {!loading && videos.length === 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(224,144,138,0.18)', borderRadius: 16, padding: '26px 24px' }}>
            <p style={{ color: CREAM, fontSize: 16, marginBottom: 6 }}>No videos in production yet.</p>
            <p style={{ color: DIM, lineHeight: 1.6, margin: 0 }}>As soon as your team kicks off your first video, it&apos;ll show up here with your script and checkpoints.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {videos.map((v) => {
            const dc = doneCount(v.progress, total);
            const delivered = dc >= total;
            return (
              <div key={v.id} style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: `1px solid ${delivered ? 'rgba(126,212,146,0.3)' : 'rgba(224,144,138,0.2)'}`, borderRadius: 18, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: '1.5rem', color: CREAM, margin: 0 }}>{v.title}</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: delivered ? DONE : RED }}>
                    {delivered ? 'Delivered' : (checkpoints[dc]?.label ?? 'In progress')}
                  </span>
                </div>
                <div style={{ margin: '12px 0 4px' }}><ProgressBar value={dc} total={total} /></div>
                <div style={{ marginTop: 10 }}>
                  {checkpoints.map((cp) => (
                    <StageRow key={cp.id} cp={cp} video={v} total={total} busy={busyId === v.id} onAction={(a, u) => act(v.id, a, u)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
