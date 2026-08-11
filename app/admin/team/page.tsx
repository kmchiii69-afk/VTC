'use client';

import { useEffect, useState } from 'react';
import { THEME as T } from '@/lib/theme';
import { AdminNav } from '@/components/ui/admin-nav';
import { Select } from '@/components/ui/select';
import { TEAM_ROLES, teamRoleLabel } from '@/lib/vtc-roles';

// Admin: assign each member a VTC seat. Client = no seat (they see /production).
// Team seats route to /team and receive the stages they own.

interface Member { email: string; name: string; role: string; team_role: string | null; }

export default function AdminTeamPage() {
  const [users, setUsers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/team', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Admin access required.'); return r.json(); })
      .then((d) => setUsers(d.users ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setSeat = async (email: string, teamRole: string) => {
    setSaving(email); setErr(null);
    try {
      const res = await fetch('/api/admin/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, teamRole: teamRole || null }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setUsers((p) => p.map((u) => (u.email === email ? { ...u, team_role: d.team_role } : u)));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(null); }
  };

  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px,5vw,48px) clamp(20px,5vw,32px)' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 10 }}>VTC · Team</div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, marginBottom: 8 }}>Seats & roles</h1>
        <p style={{ color: T.inkDim, marginBottom: 24, lineHeight: 1.6 }}>Give each teammate a seat. Seats take effect on their next login. Leave blank for clients.</p>

        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map((u) => (
            <div key={u.email} style={row}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name || u.email}</div>
                <div style={{ fontSize: 12, color: T.inkDim }}>{u.email}{u.role === 'admin' ? ' · admin' : ''}</div>
              </div>
              <Select
                value={u.team_role ?? ''}
                disabled={saving === u.email}
                minWidth={200}
                onChange={(v) => setSeat(u.email, v)}
                options={[{ value: '', label: 'Client (no seat)' }, ...TEAM_ROLES.map((r) => ({ value: r, label: teamRoleLabel(r) }))]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
