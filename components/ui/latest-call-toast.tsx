'use client';

// Bottom-right popup notification for the most recent group-call recording.
// Slides in shortly after the home loads and can be dismissed (dismissal sticks
// for the browser session). "Watch" deep-links into /hub with that recording
// preselected. Best-effort: any fetch failure just means no toast.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RECORDING_CATEGORY_IDS, recordingCategory, formatCallDate, type Recording } from '@/lib/recordings';

const G = '#c9a455';
const DISMISS_KEY = 'ba_call_toast_dismissed';

function latestGroupCall(recordings: Recording[]): Recording | null {
  const group = recordings.filter((r) => RECORDING_CATEGORY_IDS.includes(r.category));
  if (!group.length) return null;
  return group.slice().sort((a, b) => {
    const da = a.call_date ?? '', db = b.call_date ?? '';
    if (da !== db) return db.localeCompare(da);
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  })[0];
}

export function LatestCallToast() {
  const router = useRouter();
  const [rec, setRec] = useState<Recording | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* ignore */ }
    if (dismissed) return;

    fetch('/api/recordings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const latest = latestGroupCall(Array.isArray(d) ? d : []);
        if (latest) { setRec(latest); setTimeout(() => setOpen(true), 900); }
      })
      .catch(() => {});
  }, []);

  if (!rec) return null;

  const cat = recordingCategory(rec.category);
  const dismiss = () => {
    setOpen(false);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };
  const watch = () => { dismiss(); router.push(`/hub?rec=${encodeURIComponent(rec.id)}`); };

  return (
    <div
      style={{
        position: 'fixed', bottom: 92, right: 24, zIndex: 120, width: 320, maxWidth: 'calc(100vw - 32px)',
        background: 'rgba(20,16,9,0.55)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 18,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: '16px 18px',
        fontFamily: "'DM Sans', sans-serif",
        transform: open ? 'translateY(0)' : 'translateY(24px)',
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease',
      }}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(240,232,212,0.35)', fontSize: 15, lineHeight: 1, padding: 2 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(240,232,212,0.7)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(240,232,212,0.35)')}
      >✕</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.7)' }}>
          New group call
        </span>
      </div>

      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.15rem', fontWeight: 300,
        color: '#f0e8d4', lineHeight: 1.3, marginBottom: 4, paddingRight: 14 }}>
        {rec.title || cat?.name || 'Group Call'}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.5)', marginBottom: 14 }}>
        {cat ? `${cat.day} · ${cat.coach} · ` : ''}{formatCallDate(rec.call_date)}
      </div>

      <button
        onClick={watch}
        style={{ width: '100%', padding: '9px 0', borderRadius: 10, cursor: 'pointer',
          background: 'rgba(201,164,85,0.16)', border: '1px solid rgba(201,164,85,0.4)', color: G,
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', transition: 'background 0.15s ease' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201,164,85,0.26)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(201,164,85,0.16)')}
      >
        Watch the replay →
      </button>
    </div>
  );
}
