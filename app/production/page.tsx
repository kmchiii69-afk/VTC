'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';

// VTC client roadmap — each video's real production pipeline. The client sees
// where every video sits and acts on their own steps (interview, record &
// submit footage, review & approve). Team stages show "with your team".

interface Stage { key: string; label: string; owner: string; actor: 'client' | 'team'; hint: string; }
type Progress = Record<string, { done: true; at: string; by: string }>;
interface Video {
  id: string; title: string; script_type: string; dfy: boolean;
  script_url: string | null; recording_url: string | null; final_url: string | null;
  versions: Record<string, string>; status_note: string | null;
  progress: Progress; stages: Stage[];
}

const isDone = (p: Progress, k: string) => !!p[k]?.done;
const doneCount = (v: Video) => v.stages.filter((s) => isDone(v.progress, s.key)).length;
const currentIdx = (v: Video) => {
  const i = v.stages.findIndex((s) => !isDone(v.progress, s.key));
  return i === -1 ? v.stages.length : i;
};

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '8px 14px', borderRadius: 10,
  background: 'rgba(234,205,194,0.1)', border: `1px solid ${T.border}`, color: T.accentSoft,
  textDecoration: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
const btn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 10, border: 'none', background: T.accent, color: T.accentInk,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  ...btn, background: 'transparent', color: T.accentSoft, border: `1px solid ${T.border}`,
};
const field: React.CSSProperties = {
  flex: 1, minWidth: 220, height: 40, padding: '0 14px', borderRadius: 10, fontSize: 13,
  background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink, outline: 'none',
};

function StageRow({ stage, video, idx, cur, busy, onAction }: {
  stage: Stage; video: Video; idx: number; cur: number; busy: boolean;
  onAction: (action: string, payload?: { url?: string; note?: string }) => void;
}) {
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const complete = isDone(video.progress, stage.key);
  const isCurrent = idx === cur;
  const locked = idx > cur;
  const at = video.progress[stage.key]?.at;

  const dot: React.CSSProperties = {
    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
    background: complete ? 'rgba(143,209,158,0.16)' : isCurrent ? 'rgba(183,93,105,0.2)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${complete ? T.ok : isCurrent ? T.accent : 'rgba(255,245,235,0.16)'}`,
    color: complete ? T.ok : isCurrent ? T.accentSoft : T.inkFaint,
  };

  const clientActionable = isCurrent && stage.actor === 'client';

  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${T.border}`, opacity: locked ? 0.5 : 1 }}>
      <div style={dot}>{complete ? '✓' : locked ? '🔒' : ''}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: complete ? T.inkDim : T.ink }}>{stage.label}</span>
          {stage.actor === 'client' && (
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: T.accentSoft, border: `1px solid ${T.border}`, borderRadius: 20, padding: '2px 8px' }}>Your step</span>
          )}
          {complete && at && <span style={{ fontSize: 11.5, color: T.ok }}>✓ {new Date(at).toLocaleDateString()}</span>}
        </div>
        {isCurrent && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: T.inkDim, lineHeight: 1.5 }}>{stage.hint}</p>}

        {/* Team stage in progress */}
        {isCurrent && stage.actor === 'team' && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: T.accentSoft }}>⏳ With your VTC team…</p>
        )}

        {/* Interview (Victor placeholder) */}
        {clientActionable && stage.key === 'interview' && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href={`https://victor.placeholder/interview/${video.id}`} target="_blank" rel="noopener noreferrer" style={pill}>🎙️ Open interview ↗</a>
            <button disabled={busy} onClick={() => onAction('complete_interview')} style={btn}>I&apos;ve completed it</button>
          </div>
        )}

        {/* Record & submit footage */}
        {clientActionable && stage.key === 'record' && (
          <div style={{ marginTop: 10 }}>
            {video.script_url && <a href={video.script_url} target="_blank" rel="noopener noreferrer" style={pill}>📄 Your script ↗</a>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste footage link (Drive / Dropbox)" style={field} />
              <button disabled={busy || !link.trim()} onClick={() => onAction('submit_footage', { url: link.trim() })} style={btn}>Submit footage</button>
            </div>
          </div>
        )}

        {/* Client review */}
        {clientActionable && stage.key === 'client_review' && (
          <div style={{ marginTop: 10 }}>
            {(video.final_url || video.versions.V1) && (
              <a href={video.final_url || video.versions.V1} target="_blank" rel="noopener noreferrer" style={pill}>▶ Watch your video ↗</a>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Changes you'd like (optional)" style={field} />
              <button disabled={busy} onClick={() => onAction('request_changes', { note: note.trim() })} style={btnGhost}>Request changes</button>
              <button disabled={busy} onClick={() => onAction('approve_video')} style={btn}>Approve</button>
            </div>
          </div>
        )}

        {/* Delivered */}
        {stage.key === 'published' && complete && video.final_url && (
          <a href={video.final_url} target="_blank" rel="noopener noreferrer" style={{ ...pill, borderColor: T.ok, color: T.ok }}>▶ Watch the final video ↗</a>
        )}
      </div>
    </div>
  );
}

export default function ProductionPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch('/api/me/videos', { cache: 'no-store' })
      .then((r) => { if (r.status === 401) { router.replace('/'); return null; } if (!r.ok) throw new Error('Could not load your videos'); return r.json(); })
      .then((d) => { if (d) setVideos(d.videos); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (videoId: string, action: string, payload?: { url?: string; note?: string }) => {
    setBusyId(videoId); setErr(null);
    try {
      const res = await fetch('/api/me/videos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, action, ...payload }),
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

  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '84px 24px 100px' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 8 }}>VTC · Production</div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 'clamp(2rem,4vw,2.8rem)', margin: '0 0 6px' }}>Your videos</h1>
        <p style={{ color: T.inkDim, margin: '0 0 32px', lineHeight: 1.6 }}>Every video moves through the same steps. Handle your steps as they light up — your team handles the rest.</p>

        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}
        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}

        {!loading && videos.length === 0 && (
          <>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '26px 24px', marginBottom: 18, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <p style={{ fontSize: 16, marginBottom: 6 }}>No videos in production yet.</p>
              <p style={{ color: T.inkDim, lineHeight: 1.6, margin: 0 }}>As soon as your team kicks off your first video, it&apos;ll appear here with your script, steps, and progress.</p>
            </div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '26px 24px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 16 }}>How your videos flow</div>
              {[
                ['We craft your ideas & write the script', 'Your strategist + scriptwriter handle this.'],
                ['You approve the script', "We'll notify you — read it and give the go-ahead."],
                ['You record & submit your footage', 'Paste a Drive/Dropbox link right here.'],
                ['We edit it (V1 → V2 → V3)', 'Our editors + QA do the heavy lifting.'],
                ['You review & approve', 'Watch it, approve, or request changes.'],
                ['We deliver & publish', "Your finished YouTube video lands in 'Your delivered videos'."],
              ].map(([t, s], i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < 5 ? `1px solid ${T.border}` : 'none' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: 'rgba(234,205,194,0.12)', border: `1px solid ${T.border}`, color: T.accentSoft }}>{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{t}</div>
                    <div style={{ fontSize: 12.5, color: T.inkDim, marginTop: 2 }}>{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && videos.length > 0 && (() => {
          const panel: React.CSSProperties = { background: T.card, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: `1px solid ${T.border}`, borderRadius: 16, padding: '18px 22px', marginBottom: 16 };
          const label: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 12 };
          const pending = videos.map((v) => ({ v, s: v.stages[currentIdx(v)] })).filter((x) => x.s && x.s.actor === 'client');
          const scripts = videos.filter((v) => v.script_url);
          const delivered = videos.filter((v) => v.final_url);
          return (
            <>
              <div style={{ ...panel, border: `1px solid ${pending.length ? T.accent : T.ok}` }}>
                <div style={label}>{pending.length ? `Needs you now · ${pending.length}` : "You're all caught up ✓"}</div>
                {pending.length === 0
                  ? <p style={{ color: T.inkDim, margin: 0 }}>Nothing needs you right now — your team is on it.</p>
                  : pending.map(({ v, s }) => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 14 }}>{v.title}</span>
                      <span style={{ color: T.accentSoft, fontWeight: 600, fontSize: 13 }}>{s.label} →</span>
                    </div>
                  ))}
              </div>
              {scripts.length > 0 && (
                <div style={panel}>
                  <div style={label}>Your scripts</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {scripts.map((v) => <a key={v.id} href={v.script_url!} target="_blank" rel="noopener noreferrer" style={{ ...pill, marginTop: 0 }}>📄 {v.title}</a>)}
                  </div>
                </div>
              )}
              {delivered.length > 0 && (
                <div style={panel}>
                  <div style={label}>Your delivered videos</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {delivered.map((v) => <a key={v.id} href={v.final_url!} target="_blank" rel="noopener noreferrer" style={{ ...pill, marginTop: 0, borderColor: T.ok, color: T.ok }}>▶ {v.title}</a>)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {videos.map((v) => {
            const total = v.stages.length;
            const done = doneCount(v);
            const cur = currentIdx(v);
            const delivered = done >= total;
            const curLabel = delivered ? 'Delivered' : (v.stages[cur]?.label ?? 'In progress');
            return (
              <div key={v.id} style={{ background: T.card, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                border: `1px solid ${delivered ? T.ok : T.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: '1.5rem', margin: 0 }}>{v.title}</h2>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: delivered ? T.ok : T.accentSoft }}>{curLabel}</span>
                </div>
                {v.status_note && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: T.accentSoft }}>{v.status_note}</p>}
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 4px' }}>
                  <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((done / total) * 100)}%`, background: delivered ? T.ok : T.accent, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: delivered ? T.ok : T.accentSoft }}>{done}/{total}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  {v.stages.map((s, i) => (
                    <StageRow key={s.key} stage={s} video={v} idx={i} cur={cur} busy={busyId === v.id} onAction={(a, p) => act(v.id, a, p)} />
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
