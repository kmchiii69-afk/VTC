'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';

export interface TourStep {
  target?: string;   // data-tour="<target>"; omit for a centered intro card
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

// Lightweight guided tour: dims the screen, spotlights one element at a time
// (via [data-tour="…"]), and shows a coachmark explaining what it's for. No deps.
export function OnboardingTour({ steps, open, onClose }: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => { if (open) setI(0); }, [open]);

  const step = steps[i];

  // Measure the current target (and keep it in sync on resize/scroll).
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      if (!step.target) { setRect(null); return; }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, step, i]);

  if (!open || !step) return null;

  const last = i === steps.length - 1;
  const pad = 8;

  // Coachmark placement: below the target if there's room, else above; centered
  // on screen when there's no target.
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const cardW = Math.min(330, vw - 28);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 150 < vh;
    const top = below ? rect.top + rect.height + pad + 12 : Math.max(14, rect.top - pad - 12 - 168);
    let left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.max(14, Math.min(left, vw - cardW - 14));
    cardStyle = { position: 'fixed', top, left, width: cardW };
  } else {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', width: cardW, transform: 'translate(-50%, -50%)' };
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      {/* click-blocker / dim (used when there's no spotlight target) */}
      {!rect && <div style={{ position: 'absolute', inset: 0, background: 'rgba(5,4,3,0.8)', backdropFilter: 'blur(2px)' }} />}

      {/* spotlight cutout — the big box-shadow dims everything around the target */}
      {rect && (
        <div style={{
          position: 'fixed',
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 14, boxShadow: '0 0 0 9999px rgba(5,4,3,0.8)',
          border: '1.5px solid rgba(201,164,85,0.7)',
          pointerEvents: 'none', transition: 'all 0.32s cubic-bezier(0.22,1,0.36,1)',
        }} />
      )}

      {/* coachmark */}
      <div className="ob-tour-card" style={{
        ...cardStyle, zIndex: 401,
        background: 'rgba(14,11,8,0.92)', border: '1px solid rgba(201,164,85,0.3)',
        borderRadius: 16, padding: '16px 18px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)', fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 700 }}>
            Tour · {i + 1}/{steps.length}
          </span>
          <button onClick={onClose} aria-label="Skip tour" style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub, display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <h3 className="font-serif" style={{ fontSize: '1.15rem', fontWeight: 400, color: cream, margin: '0 0 6px', lineHeight: 1.2 }}>{step.title}</h3>
        <p style={{ fontSize: 13, color: sub, lineHeight: 1.6, margin: '0 0 14px' }}>{step.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.45)', fontSize: 12, fontFamily: "'DM Sans', sans-serif", padding: 0 }}>Skip</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && (
              <button onClick={() => setI((n) => n - 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: sub, fontSize: 12.5, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}><ArrowLeft size={13} /> Back</button>
            )}
            <button onClick={() => (last ? onClose() : setI((n) => n + 1))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: G, border: 'none', color: '#0a0806', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {last ? 'Got it' : <>Next <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>

      <style>{`.ob-tour-card { animation: obTourCard 0.26s ease; }
        @keyframes obTourCard { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
