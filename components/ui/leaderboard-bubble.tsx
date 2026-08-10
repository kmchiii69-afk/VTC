'use client';

// Floating leaderboard bubble. A Trophy FAB (bottom-right) that navigates to the
// full /leaderboard page. Sits directly above the to-do FAB for members; drops to
// the bottom for admins (who have no to-do FAB). Mounted globally in the root
// layout, but only shown on the /select screen.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';

const G = '#c9a455';

export function LeaderboardBubble() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  // Mounted once in the root layout, so a mount-only fetch runs on whatever page
  // loaded first — if that was /login it 401s and the FAB never appears until a
  // hard refresh. Re-fetch each time we land on /select.
  const onSelect = pathname === '/select';
  useEffect(() => {
    if (!onSelect) return;
    let alive = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (alive) setRole(u?.role ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [onSelect]);

  // Everyone signed in (members + admins) can see the leaderboard, but the FAB
  // only shows on the /select screen.
  if (role !== 'user' && role !== 'admin') return null;
  if (!onSelect) return null;

  // The to-do FAB only renders for members (role 'user'). When it's absent
  // (admins), drop the leaderboard FAB to the bottom so there's no empty gap.
  const fabBottom = role === 'user' ? 96 : 24;

  return (
    <button
      onClick={() => router.push('/leaderboard')}
      aria-label="Leaderboard"
      data-corner-fab="leaderboard"
      style={{
        position: 'fixed', bottom: fabBottom, right: 24, zIndex: 131, width: 56, height: 56, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        background: 'rgba(20,16,9,0.9)', border: '1px solid rgba(201,164,85,0.4)', color: G,
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        transition: 'all 0.18s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = G; e.currentTarget.style.color = '#0a0806'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(20,16,9,0.9)'; e.currentTarget.style.color = G; }}
    >
      <Trophy size={22} />
    </button>
  );
}
