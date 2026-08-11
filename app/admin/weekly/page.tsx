'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { THEME as T } from '@/lib/theme';
import { AdminNav } from '@/components/ui/admin-nav';

// Weekly CSM tracker — the Google sheet, digitized. Clients grouped by AM with
// plan · backlog buffer · videos-needed · Mon–Fri status cells · Posted?/reason.

interface Row {
  email: string; name: string; plan: string | null; accountManager: string | null;
  videosPerWeek: number; backlog: number; needed: number; days: Record<string, string>; posted: string;
}

const DAYS: [string, string][] = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri']];
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const cellInput: React.CSSProperties = { width: '100%', minWidth: 120, height: 34, padding: '0 8px', borderRadius: 8, fontSize: 12, background: 'rgba(0,0,0,0.22)', border: `1px solid ${T.border}`, color: T.ink };

function Cell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v); }} placeholder="—" style={cellInput} />;
}

export default function WeeklyPage() {
  const [week, setWeek] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((w?: string) => {
    setLoading(true);
    fetch(`/api/admin/weekly${w ? `?week=${w}` : ''}`, { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Account managers & admins only.'); return r.json(); })
      .then((d) => { setWeek(d.weekStart); setRows(d.rows ?? []); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (clientEmail: string, patch: { day?: string; value?: string; posted?: string }) => {
    if (!week) return;
    await fetch('/api/admin/weekly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientEmail, weekStart: week, ...patch }) }).catch(() => {});
  };

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = r.accountManager ?? '—unassigned—'; (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return [...m.entries()];
  }, [rows]);

  const navBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 999, border: `1px solid ${T.border}`, background: 'transparent', color: T.accentSoft, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 };
  const th: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkDim, padding: '0 8px 8px', textAlign: 'left' };
  const gridCols = '200px 60px 60px repeat(5, 130px) 150px';

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(28px,5vw,48px) clamp(16px,4vw,28px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 8 }}>VTC · Weekly</div>
            <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, margin: 0 }}>Weekly tracker</h1>
          </div>
          {week && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button style={navBtn} onClick={() => load(addDays(week, -7))}>← Prev</button>
              <span style={{ fontSize: 13, color: T.ink, minWidth: 130, textAlign: 'center' }}>{fmt(week)} – {fmt(addDays(week, 6))}</span>
              <button style={navBtn} onClick={() => load(addDays(week, 7))}>Next →</button>
            </div>
          )}
        </div>

        {err && <p style={{ color: T.accent }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ color: T.inkDim }}>No active clients.</p>}

        {groups.map(([am, list]) => (
          <div key={am} style={{ marginBottom: 30, overflowX: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.inkDim, marginBottom: 12 }}>
              {am === '—unassigned—' ? 'Unassigned' : am} · {list.length}
            </div>
            <div style={{ minWidth: 1000 }}>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'end' }}>
                <div style={th}>Client</div>
                <div style={th}>Buffer</div>
                <div style={th}>Need</div>
                {DAYS.map(([, l]) => <div key={l} style={th}>{l}</div>)}
                <div style={th}>Posted?</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((r) => (
                  <div key={r.email} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 6, alignItems: 'center', padding: '8px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <div style={{ minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: T.inkFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.plan ?? '—'}</div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: r.backlog >= 2 ? T.ok : r.backlog === 0 ? T.accent : T.accentSoft }}>{r.backlog}</div>
                    <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: r.needed > 0 ? T.accentSoft : T.ok }}>{r.needed}</div>
                    {DAYS.map(([k]) => <Cell key={k} value={r.days[k] ?? ''} onSave={(v) => save(r.email, { day: k, value: v })} />)}
                    <Cell value={r.posted ?? ''} onSave={(v) => save(r.email, { posted: v })} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
