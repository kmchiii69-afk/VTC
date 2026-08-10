'use client';

// Global end-of-month accountability gate. Mounted once in the root layout so it
// covers every route. For a member (role 'user') who owes the current month's
// report, it renders a full-screen, non-dismissible modal that blocks all
// interaction with the rest of the app until the form is submitted. Admins,
// signed-out visitors, and mid-onboarding users are never gated (the status
// endpoint returns required:false for them).

import { useEffect, useState } from 'react';

const G = '#c9a455';
const cream = '#f0e8d4';

interface Status { required: boolean; period: string; monthLabel: string; }

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.2)',
  borderRadius: 10, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', color: 'rgba(240,232,212,0.7)', marginBottom: 7,
};

export function MonthlyFormGate() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cash, setCash] = useState('');
  const [reels, setReels] = useState('');
  const [yt, setYt] = useState('');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    // Dev-only preview: any page with ?preview=monthly forces the gate open so it
    // can be seen without waiting for month-end. Skips the real status check and
    // never writes on submit. Not available in production.
    if (process.env.NODE_ENV !== 'production') {
      try {
        if (new URLSearchParams(window.location.search).get('preview') === 'monthly') {
          const now = new Date();
          const monthLabel = now.toLocaleString('en-US', { month: 'long' });
          const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          setPreview(true);
          setStatus({ required: true, period, monthLabel });
          return;
        }
      } catch { /* ignore */ }
    }
    fetch('/api/me/monthly-form', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.required) setStatus(d as Status); })
      .catch(() => {});
  }, []);

  // Lock page scroll while the gate is up.
  useEffect(() => {
    if (!status?.required) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [status?.required]);

  if (!status?.required) return null;

  const nums = { cash: Number(cash), reels: Number(reels), yt: Number(yt) };
  const valid =
    Number.isFinite(nums.cash) && nums.cash >= 0 &&
    Number.isInteger(nums.reels) && nums.reels >= 0 &&
    Number.isInteger(nums.yt) && nums.yt >= 0 &&
    problem.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    if (preview) { setStatus(null); return; } // preview mode — close without writing
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/me/monthly-form', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashCollected: nums.cash, igReelsPosted: nums.reels,
          ytVideosPosted: nums.yt, aPlusProblem: problem.trim(),
        }),
      });
      if (res.ok) { setStatus(null); return; }
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not submit — try again.');
    } catch {
      setError('Connection error — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(6,5,4,0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto',
        // Mirrors the /modules editor box.
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: '30px 28px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(201,164,85,0.65)', fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
          Monthly Form · Required
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.7rem', fontWeight: 300,
          color: cream, lineHeight: 1.25, marginBottom: 8 }}>
          Report your <em style={{ color: G, fontStyle: 'italic' }}>{status.monthLabel}</em> numbers
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.6,
          color: 'rgba(240,232,212,0.55)', marginBottom: 24 }}>
          Please complete this before continuing — it&apos;s how we track your momentum each month.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Cash Collected ($)</label>
            <input style={field} inputMode="decimal" value={cash} placeholder="0"
              onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} disabled={saving} />
          </div>
          <div>
            <label style={labelStyle}>Total IG Reels Posted</label>
            <input style={field} inputMode="numeric" value={reels} placeholder="0"
              onChange={(e) => setReels(e.target.value.replace(/[^\d]/g, ''))} disabled={saving} />
          </div>
          <div>
            <label style={labelStyle}>Total YT Videos Posted</label>
            <input style={field} inputMode="numeric" value={yt} placeholder="0"
              onChange={(e) => setYt(e.target.value.replace(/[^\d]/g, ''))} disabled={saving} />
          </div>
          <div>
            <label style={labelStyle}>What is your A+ Problem right now?</label>
            <textarea style={{ ...field, resize: 'vertical', minHeight: 84, lineHeight: 1.55 }}
              value={problem} placeholder="Describe the single biggest thing holding you back…"
              onChange={(e) => setProblem(e.target.value)} disabled={saving} />
          </div>
        </div>

        {error && <div style={{ marginTop: 14, fontSize: 12.5, color: '#f87171', fontFamily: "'DM Sans', sans-serif" }}>{error}</div>}

        <button
          onClick={submit}
          disabled={!valid || saving}
          style={{
            marginTop: 24, width: '100%', padding: '12px 0', borderRadius: 12,
            background: valid && !saving ? G : 'rgba(201,164,85,0.18)',
            border: 'none', color: valid && !saving ? '#0a0806' : 'rgba(240,232,212,0.4)',
            fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 700, letterSpacing: '0.03em',
            cursor: valid && !saving ? 'pointer' : 'default', transition: 'background 0.15s ease',
          }}
        >
          {saving ? 'Submitting…' : 'Submit & continue'}
        </button>

        {preview && (
          <button
            onClick={() => setStatus(null)}
            style={{ marginTop: 12, width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, letterSpacing: '0.04em' }}
          >
            Close preview
          </button>
        )}
      </div>
    </div>
  );
}
