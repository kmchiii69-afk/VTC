'use client';

// Weekly organic cash-collected report. Members land here from the Monday Discord
// prompt (/weekly-cash?week=YYYY-MM-DD). They enter last week's cash collected
// from organic content + attributed proof; it feeds the leaderboard bubble.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Upload, CheckCircle2 } from 'lucide-react';

const G = '#c9a455';
const cream = '#f0e8d4';

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.2)',
  borderRadius: 10, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', color: 'rgba(240,232,212,0.7)', marginBottom: 7,
};

interface Status {
  weekStart: string;
  weekLabel: string;
  submitted: boolean;
  existing: { cash: number; note: string; proofUrl: string | null; proofName: string | null } | null;
}

function WeeklyCashForm() {
  const params = useSearchParams();
  const weekParam = params.get('week') || '';

  const [status, setStatus] = useState<Status | null>(null);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const qs = weekParam ? `?week=${encodeURIComponent(weekParam)}` : '';
    fetch(`/api/me/weekly-cash${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => {
        if (!d) return;
        setStatus(d);
        if (d.existing) { setCash(String(d.existing.cash)); setNote(d.existing.note || ''); }
      })
      .catch(() => {});
  }, [weekParam]);

  const cashNum = Number(cash);
  const hasProof = !!file || !!status?.existing?.proofUrl;
  const valid = Number.isFinite(cashNum) && cashNum >= 0 && hasProof && !!status;

  const submit = async () => {
    if (!valid || saving || !status) return;
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.set('cash', String(cashNum));
      fd.set('weekStart', status.weekStart);
      fd.set('note', note.trim());
      if (file) fd.set('proof', file);
      const res = await fetch('/api/me/weekly-cash', { method: 'POST', body: fd });
      if (res.ok) { setDone(true); return; }
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not submit — try again.');
    } catch {
      setError('Connection error — try again.');
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 460,
    // Mirrors the /modules editor box.
    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20,
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: '30px 28px',
  };

  if (done) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '10px 0' }}>
          <CheckCircle2 size={44} color={G} />
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.7rem', fontWeight: 300, color: cream }}>
            You&apos;re on the <em style={{ color: G, fontStyle: 'italic' }}>board</em>
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, lineHeight: 1.6, color: 'rgba(240,232,212,0.55)' }}>
            Your organic cash for {status?.weekLabel} is logged. Keep stacking — see where you rank from the leaderboard bubble in the portal.
          </div>
          <Link href="/select" style={{ marginTop: 6, textDecoration: 'none', color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600 }}>
            Back to the portal →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'rgba(201,164,85,0.65)', fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
        <Trophy size={13} /> Weekly Leaderboard
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.7rem', fontWeight: 300, color: cream, lineHeight: 1.25, marginBottom: 8 }}>
        Report your <em style={{ color: G, fontStyle: 'italic' }}>{status ? status.weekLabel : 'weekly'}</em> organic cash
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.6, color: 'rgba(240,232,212,0.55)', marginBottom: 24 }}>
        Only C.C from organic content is counted towards the leaderboard so show attributed proof.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Cash Collected — Organic ($)</label>
          <input style={field} inputMode="decimal" value={cash} placeholder="0"
            onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} disabled={saving || !status} />
        </div>

        <div>
          <label style={labelStyle}>Attributed Proof (screenshot)</label>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={saving || !status}
            style={{ ...field, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
              color: file ? cream : 'rgba(240,232,212,0.45)' }}>
            <Upload size={16} color={G} />
            {file ? file.name : (status?.existing?.proofName ? `Current: ${status.existing.proofName} — tap to replace` : 'Upload proof image (PNG, JPG, WEBP)')}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {status?.existing?.proofUrl && !file && (
            <a href={status.existing.proofUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, color: G, fontFamily: "'DM Sans', sans-serif" }}>
              View current proof ↗
            </a>
          )}
        </div>

        <div>
          <label style={labelStyle}>What drove it? (optional)</label>
          <textarea style={{ ...field, resize: 'vertical', minHeight: 70, lineHeight: 1.55 }}
            value={note} placeholder="e.g. a reel that converted, DMs from a YouTube video…"
            onChange={(e) => setNote(e.target.value)} disabled={saving || !status} />
        </div>
      </div>

      {error && <div style={{ marginTop: 14, fontSize: 12.5, color: '#f87171', fontFamily: "'DM Sans', sans-serif" }}>{error}</div>}

      <button onClick={submit} disabled={!valid || saving}
        style={{ marginTop: 24, width: '100%', padding: '12px 0', borderRadius: 12,
          background: valid && !saving ? G : 'rgba(201,164,85,0.18)', border: 'none',
          color: valid && !saving ? '#0a0806' : 'rgba(240,232,212,0.4)',
          fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 700, letterSpacing: '0.03em',
          cursor: valid && !saving ? 'pointer' : 'default', transition: 'background 0.15s ease' }}>
        {saving ? 'Submitting…' : status?.submitted ? 'Update my entry' : 'Submit to the leaderboard'}
      </button>
    </div>
  );
}

export default function WeeklyCashPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Suspense fallback={null}>
        <WeeklyCashForm />
      </Suspense>
    </div>
  );
}
