'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';
import { TEAM_ROLES, teamRoleLabel } from '@/lib/vtc-roles';

// "My work" — each internal seat sees the videos waiting on them now + coming
// up, and completes their stage. Admins can focus any seat via the filter.

interface Stage { key: string; label: string; owner: string; actor: string; hint: string; }
interface Video {
  id: string; client_email: string; title: string; script_type: string; dfy: boolean;
  script_url: string | null; recording_url: string | null;
  versions: Record<string, string>; assignees: Record<string, string>;
  status_note: string | null; currentKey: string | null; stages: Stage[];
}

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' };
const btn = (primary = true): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.accent : 'transparent', color: primary ? T.accentInk : T.accentSoft, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' });
const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, background: 'rgba(234,205,194,0.1)', border: `1px solid ${T.border}`, color: T.accentSoft, textDecoration: 'none', fontSize: 12, fontWeight: 600 };

export default function TeamPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [focus, setFocus] = useState<string>('');
  const [needs, setNeeds] = useState<Video[]>([]);
  const [soon, setSoon] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me/role').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) { router.replace('/'); return; }
      setIsAdmin(d.role === 'admin');
    });
  }, [router]);

  const load = useCallback(() => {
    setLoading(true);
    const url = focus ? `/api/team/queue?role=${focus}` : '/api/team/queue';
    fetch(url, { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('This area is for VTC team members.'); if (r.status === 401) { router.replace('/'); return null; } return r.json(); })
      .then((d) => { if (d) { setRole(d.role); setNeeds(d.needsAction ?? []); setSoon(d.upcoming ?? []); } })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [focus, router]);
  useEffect(load, [load]);

  const act = async (videoId: string, action: string, note?: string) => {
    setBusy(videoId); setErr(null);
    try {
      const res = await fetch('/api/team/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, action, note }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  const VideoCard = ({ v, actionable }: { v: Video; actionable: boolean }) => {
    const cur = v.stages.find((s) => s.key === v.currentKey);
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{v.title}</div>
            <div style={{ fontSize: 12, color: T.inkDim }}>{v.client_email} · {v.dfy ? 'DFY' : 'DWY'}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.accentSoft }}>{cur?.label ?? '—'}</span>
        </div>
        {v.status_note && <p style={{ margin: '8px 0 0', fontSize: 12, color: T.accentSoft }}>{v.status_note}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {v.script_url && <a href={v.script_url} target="_blank" rel="noopener noreferrer" style={pill}>📄 Script</a>}
          {v.recording_url && <a href={v.recording_url} target="_blank" rel="noopener noreferrer" style={pill}>🎬 Footage</a>}
          {Object.entries(v.versions).map(([k, url]) => (
            <a key={k} href={url} target="_blank" rel="noopener noreferrer" style={pill}>{k}</a>
          ))}
        </div>
        {actionable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button disabled={busy === v.id} onClick={() => act(v.id, 'complete')} style={btn()}>Mark {cur?.label} done</button>
            <button disabled={busy === v.id} onClick={() => act(v.id, 'claim')} style={btn(false)}>Claim</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '84px 24px 100px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 8 }}>VTC · {teamRoleLabel(role)}</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 'clamp(2rem,4vw,2.6rem)', margin: 0 }}>My work</h1>
          </div>
          {isAdmin && (
            <select value={focus} onChange={(e) => setFocus(e.target.value)} style={{ height: 38, padding: '0 12px', borderRadius: 8, fontSize: 13, background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink }}>
              <option value="">All seats</option>
              {TEAM_ROLES.map((r) => <option key={r} value={r}>{teamRoleLabel(r)}</option>)}
            </select>
          )}
        </div>

        {err && <p style={{ color: T.accent, marginTop: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim, marginTop: 16 }}>Loading…</p>}

        {!loading && (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.inkDim, margin: '28px 0 12px' }}>Needs you now · {needs.length}</h2>
            {needs.length === 0 ? <p style={{ color: T.inkFaint }}>Nothing waiting on you. 🎉</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{needs.map((v) => <VideoCard key={v.id} v={v} actionable />)}</div>
            )}

            {soon.length > 0 && (
              <>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.inkDim, margin: '32px 0 12px' }}>Coming up · {soon.length}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{soon.map((v) => <VideoCard key={v.id} v={v} actionable={false} />)}</div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
