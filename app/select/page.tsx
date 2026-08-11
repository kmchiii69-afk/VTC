'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeRouteFor } from '@/lib/vtc-roles';
import { THEME as T } from '@/lib/theme';

// The old coaching hub is gone. /select now just routes each user to their
// home (admin → board, team seat → queue, client → production roadmap).
export default function SelectRedirect() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/me/role')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => router.replace(d ? homeRouteFor(d.role, d.teamRole) : '/'))
      .catch(() => router.replace('/'));
  }, [router]);
  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkDim, fontFamily: "'DM Sans', sans-serif" }}>
      <p>Taking you in…</p>
    </main>
  );
}
