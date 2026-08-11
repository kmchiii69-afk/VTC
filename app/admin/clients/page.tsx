'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';
import { AdminNav } from '@/components/ui/admin-nav';
import { Select } from '@/components/ui/select';
import { HEALTH_VALUES, HEALTH_LABEL, type ClientHealth } from '@/lib/vtc-clients';

// AM client-health board — Jake's #1 gap: one view of every client grouped by
// account manager, with a health flag + live delivery signal, so nobody
// silently drifts into an unhealthy state.

interface Signal { total: number; active: number; waitingOnClient: number; currentStages: string[]; }
interface Row {
  email: string; name: string; plan: string | null; deliveryStatus: string | null;
  slackChannelId: string | null; accountManager: string | null; health: ClientHealth;
  status: string; signal: Signal;
}
interface AmOption { email: string; name: string; }

const HEALTH_COLOR: Record<ClientHealth, string> = { healthy: T.ok, at_risk: T.accentSoft, defcon: T.accent };

export default function ClientHealthPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ams, setAms] = useState<AmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/clients', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('This board is for account managers & admins.'); return r.json(); })
      .then((d) => { setRows(d.rows ?? []); setIsAdmin(!!d.isAdmin); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    // AM candidates for the assign dropdown (admin only).
    fetch('/api/admin/team', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.users) setAms(d.users.filter((u: { role: string; team_role: string | null }) => u.team_role === 'am' || u.role === 'admin').map((u: { email: string; name: string }) => ({ email: u.email, name: u.name || u.email }))); })
      .catch(() => {});
  }, []);

  const patch = async (email: string, body: Record<string, unknown>) => {
    setBusy(email); setErr(null);
    try {
      const res = await fetch('/api/admin/clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setRows((p) => p.map((r) => (r.email === email ? { ...r, ...d.client, accountManager: d.client.account_manager_email } : r)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };

  const shown = onlyRisk ? rows.filter((r) => r.health !== 'healthy') : rows;
  const counts = useMemo(() => ({
    healthy: rows.filter((r) => r.health === 'healthy').length,
    at_risk: rows.filter((r) => r.health === 'at_risk').length,
    defcon: rows.filter((r) => r.health === 'defcon').length,
  }), [rows]);

  // Group by account manager.
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of shown) {
      const k = r.accountManager ?? '—unassigned—';
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    // At-risk/defcon float to the top within each pod.
    const rank: Record<string, number> = { defcon: 0, at_risk: 1, healthy: 2 };
    for (const list of m.values()) list.sort((a, b) => rank[a.health] - rank[b.health]);
    return [...m.entries()];
  }, [shown]);

  const amName = (email: string) => ams.find((a) => a.email === email)?.name ?? email;

  const chip = (text: string, color: string = T.inkDim): React.CSSProperties => ({ fontSize: 10.5, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`, color });

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(28px,5vw,48px) clamp(20px,5vw,32px)' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 10 }}>VTC · Account Management</div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, marginBottom: 6 }}>Client health</h1>
        <p style={{ color: T.inkDim, marginBottom: 20, lineHeight: 1.6 }}>Every {isAdmin ? 'client' : 'client in your pod'}, grouped by owner, with a health flag and live delivery signal.</p>

        {/* Summary + filter */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          {(['healthy', 'at_risk', 'defcon'] as ClientHealth[]).map((h) => (
            <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: T.card, border: `1px solid ${T.border}` }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: HEALTH_COLOR[h] }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{counts[h]}</span>
              <span style={{ fontSize: 12, color: T.inkDim }}>{HEALTH_LABEL[h]}</span>
            </span>
          ))}
          <button onClick={() => setOnlyRisk((v) => !v)} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 999, border: `1px solid ${onlyRisk ? T.accent : T.border}`, background: onlyRisk ? T.accent : 'transparent', color: onlyRisk ? T.accentInk : T.accentSoft, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {onlyRisk ? 'Showing at-risk only' : 'Show at-risk only'}
          </button>
        </div>

        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ color: T.inkDim }}>No active clients found.</p>}

        {groups.map(([am, list]) => (
          <div key={am} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.inkDim, marginBottom: 10 }}>
              {am === '—unassigned—' ? 'Unassigned' : amName(am)} · {list.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((r) => (
                <div key={r.email} onClick={() => router.push(`/admin/clients/${encodeURIComponent(r.email)}`)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', background: T.card, border: `1px solid ${r.health === 'defcon' ? T.accent : r.health === 'at_risk' ? T.borderStrong : T.border}`, borderRadius: 12, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: HEALTH_COLOR[r.health], flexShrink: 0 }} />
                      <span style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      {r.plan && <span style={chip(r.plan)}>{r.plan}</span>}
                      {r.status !== 'active' && <span style={chip(r.status, T.accentSoft)}>{r.status}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {r.signal.active === 0
                        ? <span style={chip('No video in production', T.accentSoft)}>No video in production</span>
                        : <>
                            <span style={chip(`${r.signal.active} in production`)}>{r.signal.active} in production</span>
                            {r.signal.waitingOnClient > 0 && <span style={chip(`${r.signal.waitingOnClient} waiting on client`, T.accentSoft)}>{r.signal.waitingOnClient} waiting on client</span>}
                            {r.signal.currentStages.slice(0, 3).map((s, i) => <span key={i} style={chip(s)}>{s}</span>)}
                          </>}
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isAdmin && (
                      <Select value={r.accountManager ?? ''} disabled={busy === r.email} minWidth={150}
                        onChange={(v) => patch(r.email, { accountManagerEmail: v || null })}
                        options={[{ value: '', label: 'Assign AM…' }, ...ams.map((a) => ({ value: a.email, label: a.name }))]} />
                    )}
                    <Select value={r.health} disabled={busy === r.email} minWidth={120} accentValue={HEALTH_COLOR[r.health]}
                      onChange={(v) => patch(r.email, { health: v })}
                      options={HEALTH_VALUES.map((h) => ({ value: h, label: HEALTH_LABEL[h] }))} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
