'use client';

// Floating to-do bubble for clients (role 'user'). Bottom-right FAB that opens a
// panel with the member's own to-do list (add / edit / remove / check off).
// Mounted globally in the root layout, but only shown on the /select screen.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ListChecks, X } from 'lucide-react';
import { TodoManager } from '@/components/ui/todo-manager';

const G = '#c9a455';

export function TodoBubble() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // This lives in the root layout, so it mounts once — on whatever page you land
  // on first. Landing on /login means the role fetch 401s and the FAB stays
  // hidden even after the client-side redirect to /select (only a hard refresh
  // fixed it). Re-fetch whenever we arrive on /select instead.
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

  // Clients only, and only on the /select screen.
  if (role !== 'user') return null;
  if (!onSelect) return null;

  return (
    <>
      {/* Panel */}
      {open && (
        <div style={{
          // Clear the whole FAB stack, not just this one: the leaderboard FAB sits
          // directly above (bottom 96 + 56 tall = top at 152) with a higher
          // z-index, so a lower panel got a trophy stamped over its bottom-right
          // rows. Start above both, and cap the height so it can't run off the top.
          position: 'fixed', bottom: 164, right: 24, zIndex: 132, width: 400, maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'min(72vh, calc(100vh - 184px))', display: 'flex', flexDirection: 'column',
          background: 'rgba(20,16,9,0.75)', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 20,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 18px 12px', borderBottom: '1px solid rgba(201,164,85,0.1)', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.25rem', fontWeight: 300, color: '#f0e8d4' }}>
              Your <em style={{ color: G, fontStyle: 'italic' }}>to-dos</em>
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none',
              cursor: 'pointer', color: 'rgba(240,232,212,0.4)', padding: 3, display: 'inline-flex' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
            <TodoManager apiBase="/api/me/todos" list="individual" />
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="To-dos"
        data-corner-fab="todo"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 131, width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          background: open ? G : 'rgba(20,16,9,0.9)', border: `1px solid ${open ? G : 'rgba(201,164,85,0.4)'}`,
          color: open ? '#0a0806' : G, boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', transition: 'all 0.18s ease',
        }}
      >
        {open ? <X size={22} /> : <ListChecks size={24} />}
      </button>
    </>
  );
}
