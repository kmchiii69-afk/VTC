'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';
import { isTeamRole, teamRoleLabel } from '@/lib/vtc-roles';

// Global top-right profile menu. Role-aware quick-nav to the admin/backend
// surfaces + logout. Hidden when signed out. Mounted app-wide in the layout.

interface Me { email: string; name: string | null; role: string; teamRole: string | null; }
interface Item { label: string; href: string; }

export function VtcProfile() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/me/role').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)),
    ]).then(([role, auth]) => {
      if (!role) { setMe(null); return; }
      setMe({ email: auth?.email ?? '', name: auth?.name ?? null, role: role.role, teamRole: role.teamRole ?? null });
    }).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!me) return null;

  const isAdmin = me.role === 'admin';
  const isTeam = isTeamRole(me.teamRole);
  const roleLabel = isAdmin ? 'Admin' : isTeam ? teamRoleLabel(me.teamRole) : 'Client';

  const items: Item[] = [];
  if (isAdmin) {
    items.push({ label: 'Production board', href: '/admin/production' });
    items.push({ label: 'Client health', href: '/admin/clients' });
    items.push({ label: 'Seats & roles', href: '/admin/team' });
    items.push({ label: 'Team queue', href: '/team' });
    items.push({ label: 'Client view', href: '/production' });
  } else if (me.teamRole === 'am') {
    items.push({ label: 'My work', href: '/team' });
    items.push({ label: 'Client health', href: '/admin/clients' });
  } else if (isTeam) {
    items.push({ label: 'My work', href: '/team' });
  } else {
    items.push({ label: 'My videos', href: '/production' });
  }

  const initial = (me.name || me.email || '?').trim().charAt(0).toUpperCase();

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/';
  };

  return (
    <div ref={ref} style={{ position: 'fixed', top: 18, right: 18, zIndex: 60, fontFamily: "'DM Sans', sans-serif" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        style={{
          width: 42, height: 42, borderRadius: '50%', cursor: 'pointer',
          background: T.accent, color: T.accentInk, border: `1px solid ${T.borderStrong}`,
          fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}
      >{initial}</button>

      {open && (
        <div style={{
          position: 'absolute', top: 50, right: 0, minWidth: 220,
          background: 'rgba(26,20,35,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${T.border}`, borderRadius: 14, padding: 8,
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '8px 12px 10px', borderBottom: `1px solid ${T.border}`, marginBottom: 6 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name || me.email}</div>
            <div style={{ fontSize: 11, color: T.accentSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>{roleLabel}</div>
          </div>
          {items.map((it) => (
            <button key={it.href} onClick={() => { setOpen(false); router.push(it.href); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: T.ink, fontSize: 13.5, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234,205,194,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >{it.label}</button>
          ))}
          <button onClick={logout}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', marginTop: 6, borderTop: `1px solid ${T.border}`, border: 'none', borderRadius: 9, background: 'transparent', color: T.accentSoft, fontSize: 13.5, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(183,93,105,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >Log out</button>
        </div>
      )}
    </div>
  );
}
