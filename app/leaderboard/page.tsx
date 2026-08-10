'use client';

// Full-page organic cash-collected leaderboard. Reached from the Trophy bubble
// (bottom-right) on any portal page. Shows the current month's ranking (resets on
// the 2nd) — client name + organic cash — with the viewer's own row highlighted.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';

const G = '#c9a455';
const cream = '#f0e8d4';

interface Entry { name: string; cash: number; rank: number; isMe: boolean; }
interface Board { monthLabel: string; total: number; entries: Entry[]; }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    fetch('/api/me/leaderboard', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Board | null) => setBoard(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => clearTimeout(t);
  }, []);

  return (
    <main style={{ position: 'relative', width: '100%', minHeight: '100vh', background: '#060504' }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.15); border-radius: 2px; }
      `}</style>

      <MeshBg speed={0.45} />
      <ProfileButton />

      {/* Back to home */}
      <button
        onClick={() => router.push('/select')}
        style={{ position: 'fixed', top: 28, left: 32, zIndex: 10, background: 'none', border: 'none',
          cursor: 'pointer', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s', padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >
        ← Home
      </button>

      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto',
        padding: 'clamp(96px, 15vh, 180px) 20px 80px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.6s ease, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Header */}
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(2.4rem,6vw,3.4rem)',
          fontWeight: 300, lineHeight: 1.05, color: cream, textAlign: 'center', letterSpacing: '-0.01em',
          textShadow: '0 2px 40px rgba(0,0,0,0.9)' }}>
          <em style={{ color: G, fontStyle: 'italic' }}>Leaderboard</em>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
          color: 'rgba(240,232,212,0.55)' }}>
          {board ? board.monthLabel : '—'}
          {board && <span style={{ color: 'rgba(240,232,212,0.3)' }}> · </span>}
          {board && <>Team total <span style={{ color: G, fontWeight: 700 }}>{money(board.total)}</span></>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 6, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
          color: 'rgba(240,232,212,0.35)', lineHeight: 1.5 }}>
          Cash collected from organic content · resets on the 2nd
        </div>

        {/* List */}
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && !board && (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(240,232,212,0.4)',
              fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</div>
          )}

          {board && board.entries.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16,
              background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)',
              color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.7 }}>
              No entries yet this month.<br />Report your organic cash to take the top spot.
            </div>
          )}

          {board && board.entries.map((e) => {
            const top = e.rank <= 3;
            return (
              <div key={`${e.rank}-${e.name}`} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 16,
                background: e.isMe ? 'rgba(201,164,85,0.10)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${e.isMe ? 'rgba(201,164,85,0.4)' : 'rgba(201,164,85,0.14)'}`,
                boxShadow: top ? '0 8px 30px rgba(0,0,0,0.25)' : 'none',
              }}>
                <span style={{ minWidth: 84, fontSize: top ? 13 : 12, fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', color: top ? G : 'rgba(240,232,212,0.5)',
                  fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
                  {ordinal(e.rank)} place
                </span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: '1.4rem', fontWeight: 400, color: cream, whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis' }}>
                  {e.name}{e.isMe && <span style={{ color: G, fontSize: '0.85rem', fontFamily: "'DM Sans', sans-serif" }}> (you)</span>}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, color: G, flexShrink: 0 }}>
                  {money(e.cash)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
