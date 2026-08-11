'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { THEME as T } from '@/lib/theme';

// The old coaching admin dashboard is retired. /admin now sends admins to the
// production board (see /admin/production and /admin/team).
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/production'); }, [router]);
  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.inkDim, fontFamily: "'DM Sans', sans-serif" }}>
      <p>Opening the production board…</p>
    </main>
  );
}
