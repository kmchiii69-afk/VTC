'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';
import { AdminNav } from '@/components/ui/admin-nav';
import { Select } from '@/components/ui/select';
import { SlaBadge } from '@/components/ui/sla-badge';
import { teamRoleLabel } from '@/lib/vtc-roles';

// Full client drill-down (like the old app): overview stats, deliverables, and
// every field Airtable holds — including the onboarding form answers.

interface Stage { key: string; label: string; owner: string; actor: string; }
interface Video {
  id: string; title: string; script_type: string; dfy: boolean; currentKey: string | null;
  script_url: string | null; reference_url: string | null; recording_url: string | null;
  final_url: string | null; versions: Record<string, string>; stages: Stage[]; status_note: string | null;
  progress: Record<string, { done: true }>;
  sla?: { status: string; hoursLeft: number | null };
}
interface Note { id: string; body: string; kind: 'note' | 'todo'; done: boolean; author: string; created_at: string; }
interface Detail {
  email: string; name: string; plan: string | null; health: string; status: string;
  accountManager: string | null; fields: Record<string, string>; videos: Video[];
}

const HEALTH = ['healthy', 'at_risk', 'defcon'];
const HLABEL: Record<string, string> = { healthy: 'Healthy', at_risk: 'At risk', defcon: 'Defcon' };
const HCOLOR: Record<string, string> = { healthy: T.ok, at_risk: T.accentSoft, defcon: T.accent };
const TABS = ['Overview', 'Onboarding', 'Deliverables', 'Notes', 'Summary'] as const;

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 18px' };
const link: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999, border: `1px solid ${T.border}`, color: T.accentSoft, textDecoration: 'none', fontSize: 12 };

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const email = decodeURIComponent(String(params.email ?? ''));
  const [d, setD] = useState<Detail | null>(null);
  const [ams, setAms] = useState<{ email: string; name: string }[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    fetch(`/api/admin/clients/${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Not allowed.'); return r.json(); })
      .then(setD).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    fetch('/api/admin/team', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (x?.users) setAms(x.users.filter((u: { role: string; team_role: string | null }) => u.team_role === 'am' || u.role === 'admin').map((u: { email: string; name: string }) => ({ email: u.email, name: u.name || u.email }))); })
      .catch(() => {});
  }, [email]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/admin/clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...body }) });
      const x = await res.json();
      if (!res.ok) throw new Error(x.error || 'Failed');
      setD((p) => (p ? { ...p, health: x.client.health, status: x.client.status, accountManager: x.client.account_manager_email } : p));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const notesUrl = `/api/admin/clients/${encodeURIComponent(email)}/notes`;
  const loadNotes = () => fetch(notesUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((x) => { if (x?.notes) setNotes(x.notes); }).catch(() => {});
  useEffect(() => { loadNotes(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps
  const addNote = async (kind: 'note' | 'todo') => {
    if (!noteText.trim()) return;
    await fetch(notesUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: noteText.trim(), kind }) });
    setNoteText(''); loadNotes();
  };
  const toggleNote = async (id: string, done: boolean) => { await fetch(notesUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, done }) }); loadNotes(); };
  const delNote = async (id: string) => { await fetch(notesUrl, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); loadNotes(); };

  const stats = useMemo(() => {
    const v = d?.videos ?? [];
    const active = v.filter((x) => x.currentKey).length;
    return { total: v.length, active, delivered: v.length - active };
  }, [d]);

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav />
      <div style={{ maxWidth: 940, margin: '0 auto', padding: 'clamp(20px,4vw,36px) clamp(20px,5vw,32px) 80px' }}>
        <button onClick={() => router.push('/admin/clients')} style={{ background: 'none', border: 'none', color: T.accentSoft, cursor: 'pointer', fontSize: 12.5, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 18 }}>← All clients</button>

        {err && <p style={{ color: T.accent }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}

        {d && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: HCOLOR[d.health] }} />
                  <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400, fontSize: 'clamp(1.8rem,4vw,2.5rem)', margin: 0 }}>{d.name}</h1>
                </div>
                <div style={{ color: T.inkDim, fontSize: 13, marginTop: 4 }}>{d.email}{d.plan ? ` · ${d.plan}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select value={d.accountManager ?? ''} disabled={busy} minWidth={150}
                  onChange={(v) => patch({ accountManagerEmail: v || null })}
                  options={[{ value: '', label: 'Assign AM…' }, ...ams.map((a) => ({ value: a.email, label: a.name }))]} />
                <Select value={d.status} disabled={busy} minWidth={120}
                  onChange={(v) => patch({ status: v })}
                  options={['active', 'paused', 'churned', 'on_books'].map((s) => ({ value: s, label: s }))} />
                <Select value={d.health} disabled={busy} minWidth={120} accentValue={HCOLOR[d.health]}
                  onChange={(v) => patch({ health: v })}
                  options={HEALTH.map((h) => ({ value: h, label: HLABEL[h] }))} />
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, margin: '24px 0 20px', flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  border: `1px solid ${tab === t ? T.accent : T.border}`, background: tab === t ? T.accent : 'transparent', color: tab === t ? T.accentInk : T.accentSoft }}>{t}</button>
              ))}
            </div>

            {tab === 'Overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
                {[['Videos', stats.total], ['In production', stats.active], ['Delivered', stats.delivered], ['Health', HLABEL[d.health]], ['Account manager', d.accountManager ? teamRoleLabel('am') : '—']].map(([k, v]) => (
                  <div key={String(k)} style={card}>
                    <div style={{ fontSize: 11, color: T.inkDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{k}</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'Deliverables' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {d.videos.length === 0 && <p style={{ color: T.inkDim }}>No videos yet.</p>}
                {d.videos.map((v) => {
                  const cur = v.stages.find((s) => s.key === v.currentKey);
                  return (
                    <div key={v.id} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15.5, fontWeight: 700 }}>{v.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <SlaBadge sla={v.sla} />
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cur ? T.accentSoft : T.ok }}>{cur ? cur.label : 'Delivered'}</span>
                        </div>
                      </div>
                      {v.status_note && <div style={{ fontSize: 12.5, color: T.accentSoft, marginTop: 6 }}>{v.status_note}</div>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {v.reference_url && <a href={v.reference_url} target="_blank" rel="noopener noreferrer" style={link}>▶ Reference</a>}
                        {v.script_url && <a href={v.script_url} target="_blank" rel="noopener noreferrer" style={link}>📄 Script</a>}
                        {v.recording_url && <a href={v.recording_url} target="_blank" rel="noopener noreferrer" style={link}>🎬 Footage</a>}
                        {Object.entries(v.versions).map(([k, url]) => <a key={k} href={url} target="_blank" rel="noopener noreferrer" style={link}>{k}</a>)}
                        {v.final_url && <a href={v.final_url} target="_blank" rel="noopener noreferrer" style={{ ...link, borderColor: T.ok, color: T.ok }}>▶ Final</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'Notes' && (
              <div style={card}>
                <div style={{ fontSize: 11, color: T.inkDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Notes & to-dos</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note or to-do…" style={{ flex: 1, minWidth: 220, height: 38, padding: '0 14px', borderRadius: 999, background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink }} />
                  <button onClick={() => addNote('note')} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'transparent', color: T.accentSoft, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Add note</button>
                  <button onClick={() => addNote('todo')} style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: T.accent, color: T.accentInk, fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>Add to-do</button>
                </div>
                {notes.length === 0 && <p style={{ color: T.inkFaint }}>No notes yet.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map((n) => (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: `1px solid ${T.border}` }}>
                      {n.kind === 'todo' && <button onClick={() => toggleNote(n.id, !n.done)} style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer', border: `1px solid ${n.done ? T.ok : T.border}`, background: n.done ? 'rgba(143,209,158,0.15)' : 'transparent', color: T.ok, fontSize: 12 }}>{n.done ? '✓' : ''}</button>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: n.done ? T.inkDim : T.ink, textDecoration: n.done ? 'line-through' : 'none' }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: T.inkFaint, marginTop: 2 }}>{n.kind === 'todo' ? 'To-do' : 'Note'} · {n.author?.split('@')[0] ?? ''} · {new Date(n.created_at).toLocaleDateString()}</div>
                      </div>
                      <button onClick={() => delNote(n.id)} style={{ background: 'none', border: 'none', color: T.inkFaint, cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'Summary' && (
              <div style={card}>
                <div style={{ fontSize: 11, color: T.inkDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Summary</div>
                <p style={{ fontSize: 15, lineHeight: 1.7, color: T.ink, margin: 0 }}>
                  <strong>{d.name}</strong> is on <strong>{d.plan ?? 'a plan TBC'}</strong>, owned by{' '}
                  <strong>{d.accountManager ?? 'no account manager yet'}</strong>, currently flagged{' '}
                  <span style={{ color: HCOLOR[d.health], fontWeight: 700 }}>{HLABEL[d.health]}</span> ({d.status}).{' '}
                  {stats.total === 0
                    ? 'No videos in production yet.'
                    : `${stats.active} video${stats.active === 1 ? '' : 's'} in production and ${stats.delivered} delivered.`}
                </p>
              </div>
            )}

            {tab === 'Onboarding' && (
              <div style={card}>
                <div style={{ fontSize: 11, color: T.inkDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Onboarding & client record · {Object.keys(d.fields).length} fields (incl. onboarding form)</div>
                {Object.keys(d.fields).length === 0 && <p style={{ color: T.inkDim }}>No Airtable record found for this email.</p>}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {Object.entries(d.fields).map(([k, v]) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 12.5, color: T.inkDim }}>{k}</div>
                      <div style={{ fontSize: 13, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{/^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: T.accentSoft }}>{v}</a> : v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
