'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { THEME as T } from '@/lib/theme';

// Lightweight top nav for the admin/team surfaces.
const LINKS = [
  { href: '/admin/production', label: 'Production' },
  { href: '/admin/clients', label: 'Client Health' },
  { href: '/admin/weekly', label: 'Weekly' },
  { href: '/admin/team', label: 'Seats' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', justifyContent: 'center', gap: 8, padding: '16px' }}>
      {LINKS.map((l) => {
        const active = path === l.href;
        return (
          <Link key={l.href} href={l.href} style={{
            padding: '8px 16px', borderRadius: 999, textDecoration: 'none',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em',
            color: active ? T.accentInk : T.accentSoft,
            background: active ? T.accent : 'rgba(26,20,35,0.55)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${active ? T.accent : T.border}`,
          }}>{l.label}</Link>
        );
      })}
    </div>
  );
}
