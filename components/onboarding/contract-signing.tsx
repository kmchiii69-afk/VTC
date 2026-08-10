'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, FileText, Eraser, ShieldCheck } from 'lucide-react';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

const CONSENT_TEXT =
  'I agree to sign this contract electronically. I understand my electronic signature is the legal equivalent of a handwritten signature and that I intend to be bound by this agreement (ESIGN Act / UETA).';

interface Tier { tier: string; label: string; version: number; viewUrl: string | null; }
interface Signed { tier: string; signerName: string; signedAt: string; viewUrl: string | null; }

const rowBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  width: '100%', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.25)', color: cream,
};

// Hand-drawn signature canvas (mouse + touch via pointer events).
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    // Scale for crisp lines on HiDPI.
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10243a';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true; const ctx = ref.current!.getContext('2d')!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const moveDraw = (e: React.PointerEvent) => {
    if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true;
  };
  const end = () => {
    if (!drawing.current) return; drawing.current = false;
    if (dirty.current) onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!; const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        onPointerDown={start} onPointerMove={moveDraw} onPointerUp={end} onPointerLeave={end}
        style={{ width: '100%', height: 130, background: '#fff', borderRadius: 10, border: '1px solid rgba(201,164,85,0.3)', touchAction: 'none', cursor: 'crosshair' }}
      />
      <button type="button" onClick={clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: faint, fontSize: 12, cursor: 'pointer', marginTop: 6, padding: 0 }}>
        <Eraser size={13} /> Clear
      </button>
    </div>
  );
}

export function ContractSigning({ onSigned, refreshKey }: { onSigned?: (tier: string) => void; refreshKey?: string | number }) {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [signed, setSigned] = useState<Signed | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [sigData, setSigData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // Re-fetch whenever refreshKey changes — an admin applying a contract tag
  // mid-onboarding narrows (or swaps) the contract this client is shown to sign.
  useEffect(() => {
    let alive = true;
    fetch('/api/me/contract', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const t: Tier[] = Array.isArray(d?.tiers) ? d.tiers : [];
        setTiers(t);
        setSigned(d?.signed ?? null);
        // Tagged clients (or a single uploaded contract) skip the tier picker.
        // If a tag change removed the tier they'd picked, snap to what's offered.
        setSelected((cur) => {
          if (d?.signed) return cur;
          if (t.length === 1) return t[0].tier;
          if (cur && !t.some((x) => x.tier === cur)) return null;
          return cur;
        });
      })
      .catch(() => { if (alive) setTiers([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (tiers === null) return <div style={{ color: faint, fontSize: 13 }}>Loading your contract…</div>;

  // Already signed.
  if (signed) {
    return (
      <div style={{ borderRadius: 14, padding: '18px 20px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#4ade80', fontWeight: 700, fontSize: 15 }}>
          <ShieldCheck size={20} /> Contract signed
        </div>
        <p style={{ color: sub, fontSize: 13.5, margin: '8px 0 0' }}>
          Signed by {signed.signerName} on {new Date(signed.signedAt).toLocaleDateString()}.
        </p>
        {signed.viewUrl && (
          <a href={signed.viewUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: G, fontSize: 13, marginTop: 10, textDecoration: 'none' }}>
            <FileText size={14} /> View your signed contract
          </a>
        )}
        <p style={{ color: faint, fontSize: 12, margin: '12px 0 0' }}>You can continue to the next step.</p>
      </div>
    );
  }

  if (!tiers.length) {
    return <div style={{ color: faint, fontSize: 13.5, padding: '14px 16px', borderRadius: 12, border: '1px dashed rgba(201,164,85,0.3)' }}>Your contract isn&apos;t available to sign yet — your Client Success Manager will enable it shortly.</div>;
  }

  // Tier picker.
  if (!selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tiers.map((t) => (
          <button key={t.tier} onClick={() => setSelected(t.tier)} style={rowBtn}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t.label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: G }}>Read &amp; sign <ChevronRight size={15} /></span>
          </button>
        ))}
      </div>
    );
  }

  const tier = tiers.find((t) => t.tier === selected)!;
  const canSign = reviewed && consent && name.trim().length >= 2 && !!sigData && !submitting;

  const sign = async () => {
    setSubmitting(true); setErr('');
    try {
      const res = await fetch('/api/me/contract/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selected, signerName: name.trim(), signaturePng: sigData, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSigned({ tier: data.tier, signerName: name.trim(), signedAt: data.signedAt, viewUrl: data.viewUrl ?? null });
        onSigned?.(data.tier);
      } else setErr(data.error || 'Signing failed — please try again.');
    } catch { setErr('Signing failed — please try again.'); }
    setSubmitting(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button onClick={() => setSelected(null)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: faint, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>← Choose a different contract</button>

      <div style={{ color: cream, fontWeight: 600, fontSize: 14.5 }}>{tier.label}</div>

      {/* The contract itself. */}
      {tier.viewUrl ? (
        <iframe src={tier.viewUrl} title={tier.label} style={{ width: '100%', height: 420, border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10, background: '#fff' }} />
      ) : (
        <div style={{ color: faint, fontSize: 13 }}>Couldn&apos;t load the contract preview — refresh and try again.</div>
      )}

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: sub, fontSize: 13.5 }}>
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} style={{ marginTop: 2, accentColor: G }} />
        I have read and reviewed the contract above in full.
      </label>

      <div>
        <label style={{ display: 'block', color: faint, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Full legal name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full legal name" style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 9, padding: '10px 12px', color: cream, fontSize: 14, boxSizing: 'border-box' }} />
      </div>

      <div>
        <label style={{ display: 'block', color: faint, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Draw your signature</label>
        <SignaturePad onChange={setSigData} />
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: sub, fontSize: 12.5, lineHeight: 1.5 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: G }} />
        {CONSENT_TEXT}
      </label>

      {err && <div style={{ color: '#ef4444', fontSize: 12.5 }}>{err}</div>}

      <button
        onClick={sign}
        disabled={!canSign}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: canSign ? G : 'rgba(201,164,85,0.25)', color: canSign ? '#1a1407' : faint, fontWeight: 700, border: 'none', fontSize: 14.5, padding: '13px 18px', borderRadius: 11, cursor: canSign ? 'pointer' : 'not-allowed' }}
      >
        <Check size={17} /> {submitting ? 'Signing…' : 'Sign contract'}
      </button>
    </div>
  );
}
