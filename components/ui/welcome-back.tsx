'use client';

// "Welcome back" card — a compact top-left pop-up on the home (/select). Greets
// the member by name, links them straight back to their last piece of content
// ("pick up where you left off"), and shows their training progress bar at the
// bottom. Progress + name are passed in by the home page; the last-activity
// deep-link is fetched here. Best-effort: any fetch failure just drops the link.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const G = '#c9a455';
const cream = '#f0e8d4';

type ViewType = 'module_view' | 'recording_view' | 'guide_view' | 'sop_view';
interface Activity { type: ViewType; refId: string | null; title: string | null; occurredAt: string; }

const TYPE_LABEL: Record<ViewType, string> = {
  module_view: 'training video',
  recording_view: 'group call',
  guide_view: 'guide',
  sop_view: 'SOP',
};

function hrefFor(a: Activity): string {
  const id = a.refId ? encodeURIComponent(a.refId) : '';
  switch (a.type) {
    case 'module_view':    return id ? `/modules?id=${id}` : '/modules';
    case 'recording_view': return id ? `/hub?rec=${id}` : '/hub';
    case 'guide_view':     return id ? `/guides/${id}` : '/select';
    case 'sop_view':       return id ? `/sops?sop=${id}` : '/sops';
    default:               return '/select';
  }
}

export function WelcomeBack({ name, done = 0, total = 0 }: { name?: string; done?: number; total?: number }) {
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/me/last-activity', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.activity?.type) setActivity(d.activity as Activity); })
      .catch(() => {});
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);

  if (dismissed) return null;

  const firstName = (name || '').trim().split(/\s+/)[0] || '';
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const label = activity ? (TYPE_LABEL[activity.type] ?? 'session') : '';
  const title = activity?.title || (activity ? `your last ${label}` : '');

  return (
    <div
      style={{
        position: 'fixed', top: 24, left: 24, zIndex: 120, width: 300, maxWidth: 'calc(100vw - 32px)',
        // Mirrors the /modules editor box.
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
        padding: '18px 20px',
        opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(240,232,212,0.3)', padding: 2, lineHeight: 1, fontSize: 13 }}
      >
        ✕
      </button>

      {/* VTC logo (same asset as the onboarding Join-Discord step, no glow) */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/onboarding/goh-logo.png" alt="VTC"
          style={{ width: 76, height: 76, objectFit: 'contain' }} />
      </div>

      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.35rem', fontWeight: 300,
        color: cream, lineHeight: 1.2, marginBottom: 8, textAlign: 'center' }}>
        {firstName
          ? <>Welcome back, <em style={{ color: G, fontStyle: 'italic' }}>{firstName}</em></>
          : 'Welcome back'}
      </div>

      {activity ? (
        <button
          onClick={() => router.push(hrefFor(activity))}
          style={{ display: 'block', textAlign: 'center', width: '100%', background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
            fontSize: 12.5, lineHeight: 1.55, color: 'rgba(240,232,212,0.6)' }}
        >
          Pick up where you left off — <span style={{ color: G }}>{title} →</span>
        </button>
      ) : (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.55,
          color: 'rgba(240,232,212,0.55)', marginBottom: 16, textAlign: 'center' }}>
          Pick up where you left off.
        </div>
      )}

      {/* Progress bar — at the bottom of the card */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)' }}>
            Your Progress
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: 'rgba(240,232,212,0.5)' }}>
            {total > 0 ? `${done} of ${total} · ${pct}%` : '—'}
          </span>
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${G}, #e6c877)`,
            borderRadius: 4, transition: 'width 0.6s ease' }} />
        </div>
      </div>
    </div>
  );
}
