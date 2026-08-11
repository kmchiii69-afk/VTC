'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';
import { Select } from '@/components/ui/select';
import { TEAM_ROLES, teamRoleLabel } from '@/lib/vtc-roles';

// Per-seat kanban board — columns are this seat's slice of the pipeline, cards
// are the videos assigned to / claimable by them. Cleaner than the Airtable
// interfaces: client filter, per-card detail drawer, one-click advance.

const SCRIPT_TYPE_LABELS: Record<string, string> = {
  straight_outline: 'Straight → Outline',
  interview_outline: 'Interview → Outline',
  straight_script: 'Straight → Script',
  interview_script: 'Interview → Script',
};

interface Col { key: string; label: string; owner: string; actor: string; }
type Progress = Record<string, { done: true; at: string; by: string }>;
interface Video {
  id: string; client_email: string; title: string; script_type: string; dfy: boolean;
  script_url: string | null; script_note: string | null; reference_url: string | null;
  brief_url: string | null; due_date: string | null; recording_url: string | null;
  final_url: string | null; versions: Record<string, string>; assignees: Record<string, string>;
  status_note: string | null; currentKey: string | null; stages: Col[];
}

// Flat, theme-matched controls (the outlined-pill look).
const pill: React.CSSProperties = { padding: '7px 13px', borderRadius: 10, border: `1px solid ${T.border}`, background: 'transparent', color: T.accentSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const solid: React.CSSProperties = { ...pill, background: T.accent, color: T.accentInk, border: 'none' };
const field: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', borderRadius: 9, fontSize: 13, background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.border}`, color: T.ink };
const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 8, border: `1px solid ${T.border}`, color: T.accentSoft, textDecoration: 'none', fontSize: 11.5 };

export default function TeamBoard() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [focus, setFocus] = useState('');
  const [client, setClient] = useState('');
  const [cols, setCols] = useState<Col[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Video | null>(null);

  useEffect(() => {
    fetch('/api/me/role').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) { router.replace('/'); return; }
      setIsAdmin(d.role === 'admin');
    });
  }, [router]);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (focus) p.set('role', focus);
    if (client) p.set('client', client);
    fetch(`/api/team/queue?${p}`, { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('This board is for VTC team members.'); if (r.status === 401) { router.replace('/'); return null; } return r.json(); })
      .then((d) => { if (d) { setRole(d.role); setCols(d.columns ?? []); setVideos(d.videos ?? []); } })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [focus, client, router]);
  useEffect(load, [load]);

  const post = async (videoId: string, body: Record<string, unknown>) => {
    setBusy(videoId); setErr(null);
    try {
      const res = await fetch('/api/team/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId, ...body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      // Refresh the row (or drop it if it left this seat's columns).
      setVideos((prev) => prev.map((v) => (v.id === videoId ? d.video : v)));
      setOpen((o) => (o && o.id === videoId ? d.video : o));
      // A completed stage may move the card out of view — reload to re-bucket.
      if (body.action === 'complete') { setOpen(null); load(); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  const clients = useMemo(() => [...new Set(videos.map((v) => v.client_email))].sort(), [videos]);
  const byCol = (key: string) => videos.filter((v) => v.currentKey === key);

  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '72px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 6 }}>VTC · {teamRoleLabel(role)}</div>
            <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 'clamp(1.9rem,4vw,2.6rem)', margin: 0 }}>My board</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isAdmin && (
              <Select value={focus} onChange={setFocus} minWidth={150}
                options={[{ value: '', label: 'All seats' }, ...TEAM_ROLES.map((r) => ({ value: r, label: teamRoleLabel(r) }))]} />
            )}
            <Select value={client} onChange={setClient} minWidth={160}
              options={[{ value: '', label: 'All clients' }, ...clients.map((c) => ({ value: c, label: c }))]} />
          </div>
        </div>

        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}
        {!loading && videos.length === 0 && <p style={{ color: T.inkDim }}>Nothing on your board right now. 🎉</p>}

        {/* Kanban */}
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {cols.map((c) => {
            const items = byCol(c.key);
            return (
              <div key={c.key} style={{ flex: '0 0 300px', minWidth: 300 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em' }}>{c.label}</span>
                  <span style={{ fontSize: 11, color: T.inkFaint }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((v) => (
                    <button key={v.id} onClick={() => setOpen(v)} style={{ textAlign: 'left', cursor: 'pointer', background: 'rgba(26,20,35,0.5)', border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, lineHeight: 1.3 }}>{v.title}</div>
                      <div style={{ fontSize: 11.5, color: T.inkDim, marginTop: 4 }}>{v.client_email}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: `1px solid ${T.border}`, color: T.accentSoft }}>{SCRIPT_TYPE_LABELS[v.script_type] ?? v.script_type}</span>
                        {v.due_date && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: `1px solid ${T.border}`, color: T.inkDim }}>due {new Date(v.due_date).toLocaleDateString()}</span>}
                      </div>
                      {v.status_note && <div style={{ fontSize: 11.5, color: T.accentSoft, marginTop: 8 }}>{v.status_note}</div>}
                    </button>
                  ))}
                  {items.length === 0 && <div style={{ fontSize: 12, color: T.inkFaint, padding: '10px 4px' }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <Drawer v={open} busy={busy === open.id} onClose={() => setOpen(null)} onPost={(b) => post(open.id, b)} />}
    </main>
  );
}

function Drawer({ v, busy, onClose, onPost }: { v: Video; busy: boolean; onClose: () => void; onPost: (body: Record<string, unknown>) => void }) {
  const cur = v.stages.find((s) => s.key === v.currentKey);
  const [note, setNote] = useState(v.status_note ?? '');
  const [vLabel, setVLabel] = useState('V1');
  const [vUrl, setVUrl] = useState('');

  const FieldRow = ({ label, fieldKey, value, type }: { label: string; fieldKey: string; value: string | null; type?: string }) => {
    const [val, setVal] = useState(value ?? '');
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.inkDim, marginBottom: 5 }}>{label}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type={type ?? 'text'} value={val} onChange={(e) => setVal(e.target.value)} style={field} />
          <button disabled={busy} onClick={() => onPost({ action: 'set_field', field: fieldKey, value: val })} style={{ ...pill, flexShrink: 0 }}>Save</button>
        </div>
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', overflowY: 'auto', background: 'rgba(24,17,30,0.98)', borderLeft: `1px solid ${T.border}`, padding: '26px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.accentSoft, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{cur?.label}</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: '1.6rem', margin: '4px 0 2px' }}>{v.title}</h2>
            <div style={{ fontSize: 12.5, color: T.inkDim }}>{v.client_email} · {v.dfy ? 'DFY' : 'DWY'} · {SCRIPT_TYPE_LABELS[v.script_type] ?? v.script_type}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.inkDim, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0' }}>
          {v.reference_url && <a href={v.reference_url} target="_blank" rel="noopener noreferrer" style={link}>▶ Reference</a>}
          {v.brief_url && <a href={v.brief_url} target="_blank" rel="noopener noreferrer" style={link}>📋 Brief</a>}
          {v.script_url && <a href={v.script_url} target="_blank" rel="noopener noreferrer" style={link}>📄 Script</a>}
          {v.recording_url && <a href={v.recording_url} target="_blank" rel="noopener noreferrer" style={link}>🎬 Footage</a>}
          {Object.entries(v.versions).map(([k, url]) => <a key={k} href={url} target="_blank" rel="noopener noreferrer" style={link}>{k}</a>)}
        </div>

        {/* Assignments */}
        <div style={{ fontSize: 12, color: T.inkDim, marginBottom: 16, lineHeight: 1.7 }}>
          {['strategist', 'scriptwriter', 'editor', 'qa', 'thumbnail'].filter((r) => v.assignees[r]).map((r) => (
            <div key={r}>{teamRoleLabel(r)}: <span style={{ color: T.ink }}>{v.assignees[r]}</span></div>
          ))}
        </div>

        {/* Editable fields */}
        <FieldRow label="Reference (YouTube)" fieldKey="reference_url" value={v.reference_url} />
        <FieldRow label="Brief link" fieldKey="brief_url" value={v.brief_url} />
        <FieldRow label="Script link" fieldKey="script_url" value={v.script_url} />
        <FieldRow label="Script due" fieldKey="due_date" value={v.due_date} type="date" />

        {/* Add a version */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: T.inkDim, marginBottom: 5 }}>Add a version link</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={vLabel} onChange={(e) => setVLabel(e.target.value)} style={{ ...field, width: 70 }} />
            <input value={vUrl} onChange={(e) => setVUrl(e.target.value)} placeholder="URL" style={field} />
            <button disabled={busy || !vUrl.trim()} onClick={() => onPost({ action: 'add_version', label: vLabel.trim(), url: vUrl.trim() })} style={{ ...pill, flexShrink: 0 }}>Add</button>
          </div>
        </div>

        {/* Status note */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.inkDim, marginBottom: 5 }}>Status note</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Chase footage" style={field} />
            <button disabled={busy} onClick={() => onPost({ action: 'set_status', note })} style={{ ...pill, flexShrink: 0 }}>Save</button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {cur && !v.assignees[cur.owner] && <button disabled={busy} onClick={() => onPost({ action: 'claim' })} style={pill}>Claim</button>}
          <button disabled={busy} onClick={() => onPost({ action: 'complete' })} style={solid}>Mark {cur?.label} done →</button>
        </div>
      </div>
    </div>
  );
}
