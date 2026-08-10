'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { captureTracking } from '@/lib/tracking';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom, fireLead, fireOnce } from '@/lib/pixel-tracker';
import { isValidEmail, isValidPhone, normalizePhone, EMAIL_HINT, PHONE_HINT } from '@/lib/contact-format';
import PhoneField from '@/components/PhoneField';
import { isBelowRevenueFloor, NOT_READY_PATH } from '@/lib/revenue-gate';

/* ── Brand ── */
const BG = '#050403';
const GOLD = '#F5E6A3';
const GOLD_FAINT = 'rgba(245,230,163,0.12)';
const CREAM = 'rgba(240,232,212,0.92)';
const CREAM_DIM = 'rgba(240,232,212,0.6)';
const CREAM_FAINT = 'rgba(240,232,212,0.32)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = () => window as any;

function track(event: string, props?: Record<string, unknown>) {
  try {
    if (w().posthog?.capture) w().posthog.capture(event, { funnel: 'ig', ...props });
  } catch {}
  trackEvent('ig', event, props);
  fireCustom(event, props);
}

interface F { name: string; email: string; phone: string; revenue: string; bottleneck: string }
const EMPTY: F = { name: '', email: '', phone: '', revenue: '', bottleneck: '' };

function Opt({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '14px 18px', textAlign: 'left', width: '100%',
      background: selected ? GOLD_FAINT : 'rgba(255,255,255,0.02)',
      border: `1.5px solid ${selected ? GOLD : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, color: selected ? CREAM : CREAM_DIM,
      fontFamily: "'DM Sans', sans-serif", fontSize: 15, cursor: 'pointer',
      transition: 'all 140ms',
    }}>
      <span style={{ color: GOLD, marginRight: 10, fontSize: 12 }}>{selected ? '●' : '○'}</span>{label}
    </button>
  );
}

function Field({ placeholder, value, onChange, type = 'text' }: {
  placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      autoComplete="on"
      style={{
        width: '100%', background: 'rgba(255,255,255,0.03)',
        border: '1.5px solid rgba(255,255,255,0.07)', borderRadius: 12,
        color: CREAM, padding: '16px 18px',
        fontFamily: "'DM Sans', sans-serif", fontSize: 16, outline: 'none',
        boxSizing: 'border-box', WebkitAppearance: 'none',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(245,230,163,0.5)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
    />
  );
}

function BigBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '18px', width: '100%',
      background: disabled ? 'rgba(245,230,163,0.07)' : GOLD,
      border: 'none', borderRadius: 14, cursor: disabled ? 'default' : 'pointer',
      color: disabled ? CREAM_FAINT : BG,
      fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700,
      letterSpacing: '0.04em', transition: 'all 150ms',
    }}>
      {children}
    </button>
  );
}

export default function IGFunnel() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [f, setF] = useState<F>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [calLink, setCalLink] = useState('');
  const [error, setError] = useState('');

  const set = (k: keyof F) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    track('ig_view');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  /* Step 4 is its own trackable "page" (the booking calendar) — a distinct
   * event from the generic ig_view that also fires on every step change. */
  useEffect(() => {
    if (step !== 4) return;
    track('ig_calendar_viewed');
  }, [step]);

  /* Calendly's inline widget posts a message to the window when a booking is
   * actually confirmed — that's our cue to move to the (separate-route)
   * thank-you page, which does its own view tracking on load. */
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.event === 'calendly.event_scheduled') {
        const params = new URLSearchParams();
        if (f.name) params.set('name', f.name.split(' ')[0]);
        router.push(`/funnel/ig/thank-you?${params.toString()}`);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.name]);

  async function submit() {
    setLoading(true); setError('');
    track('ig_form_submitted', { revenue: f.revenue, bottleneck: f.bottleneck });
    const tracking = captureTracking();
    try {
      const res = await fetch('/api/funnel/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, phone: normalizePhone(f.phone), source: 'ig', ...tracking }),
      });
      const data = await res.json();
      if (data.calLink) setCalLink(data.calLink);
      if (fireOnce(`ig-lead:${f.email}`)) fireLead({ email: f.email, contentName: 'ig_funnel' });

      /* Sub-$20k/mo applicants skip the calendar. The lead POST above already
       * went through, so they're captured and can be sent resources. */
      if (isBelowRevenueFloor(f.revenue)) {
        track('ig_below_revenue_floor', { revenue: f.revenue });
        router.push(`${NOT_READY_PATH}?from=ig`);
        return;
      }
      setStep(4);
    } catch {
      setError('Something went wrong — try again.');
      setLoading(false);
    }
  }

  const CAL = calLink || process.env.NEXT_PUBLIC_CAL_LINK || 'https://calendly.com/goh-consulting/1-1-strategy-call';

  useEffect(() => {
    if (step !== 4) return;
    function init() {
      const cal = (window as any).Calendly;
      if (cal?.initInlineWidget) cal.initInlineWidget({ url: CAL, parentElement: document.getElementById('calendly-embed-ig') });
    }
    if ((window as any).Calendly) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [step, CAL]);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: "'DM Sans', sans-serif", overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { -webkit-font-smoothing: antialiased; }
        ::placeholder { color: rgba(240,232,212,0.18); }
        input, button { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* Top glow */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 100% 50% at 50% 0%, rgba(245,230,163,0.07) 0%, transparent 60%)' }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* ── STEP 1 — Hook ── */}
        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
            {/* Logo */}
            <div style={{ paddingTop: 28, paddingBottom: 32, textAlign: 'center' }}>
              <img src="/logo.png" alt="VTC" style={{ height: 52, width: 'auto' }} />
            </div>

            {/* Hook headline */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, marginBottom: 16, textAlign: 'center' }}>
                You saw the post →
              </div>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 9vw, 44px)', fontWeight: 300, color: CREAM, lineHeight: 1.1, letterSpacing: '-0.01em', textAlign: 'center', marginBottom: 16 }}>
                How Established Founders Are Adding <span style={{ whiteSpace: 'nowrap' }}>$100-300k/Mo</span> Profit With This Organic Content System
              </h1>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: CREAM_DIM, lineHeight: 1.75, textAlign: 'center', marginBottom: 36 }}>
                Book a free 30-min strategy session. We&apos;ll map out your positioning, content system, and what&apos;s keeping you invisible — no fluff, no pitch, just a real plan.
              </p>

              {/* Social proof strip */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 0, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(245,230,163,0.12)', borderRadius: 12, marginBottom: 32, overflow: 'hidden' }}>
                {[['200+', 'Clients'], ['$50M+', 'Generated'], ['4.9★', 'Rating']].map(([num, label], i, a) => (
                  <div key={label} style={{ flex: 1, padding: '16px 8px', textAlign: 'center', borderRight: i < a.length - 1 ? '1px solid rgba(245,230,163,0.08)' : 'none' }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: GOLD, lineHeight: 1 }}>{num}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: CREAM_FAINT, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>

              <BigBtn onClick={() => { track('ig_cta_click'); setStep(2); }}>
                Get My Free Strategy Session →
              </BigBtn>
              <div style={{ textAlign: 'center', marginTop: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: CREAM_FAINT, letterSpacing: '0.06em' }}>
                30 minutes · Free · Limited spots
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 — Contact + Revenue ── */}
        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 20px 40px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
            {/* Progress */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: CREAM_FAINT }}>Step 1 of 2</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: GOLD }}>50%</span>
              </div>
              <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '50%', background: GOLD, borderRadius: 2 }} />
              </div>
            </div>

            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: CREAM, marginBottom: 6 }}>Quick intro</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CREAM_DIM, marginBottom: 24, lineHeight: 1.6 }}>We read every application personally before confirming the call.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <Field placeholder="Your full name" value={f.name} onChange={set('name')} />
              <Field placeholder="Email address" value={f.email} onChange={set('email')} type="email" />
              <PhoneField value={f.phone} onChange={set('phone')} fontFamily="'DM Sans', sans-serif" />
            </div>

            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CREAM_FAINT, marginBottom: 12 }}>Current monthly revenue?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 28 }}>
              {/* Cut at $20K so no bucket straddles the booking floor in lib/revenue-gate. */}
              {['Pre-revenue / Under $3K', '$3K – $10K/mo', '$10K – $20K/mo', '$20K – $50K/mo', '$50K+/mo'].map((v) => (
                <Opt key={v} label={v} selected={f.revenue === v} onClick={() => set('revenue')(v)} />
              ))}
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{error}</div>}

            <BigBtn
              onClick={() => {
                if (!f.name || !f.email || !f.revenue) return;
                if (!isValidEmail(f.email)) { setError(EMAIL_HINT); return; }
                if (f.phone && !isValidPhone(f.phone)) { setError(PHONE_HINT); return; }
                setError('');
                track('ig_form_step1');
                setStep(3);
              }}
              disabled={!f.name || !f.email || !f.revenue}
            >
              Next →
            </BigBtn>
          </div>
        )}

        {/* ── STEP 3 — Bottleneck ── */}
        {step === 3 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 20px 40px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
            {/* Progress */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: CREAM_FAINT }}>Step 2 of 2</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: GOLD }}>100%</span>
              </div>
              <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', background: GOLD, borderRadius: 2, transition: 'width 0.4s' }} />
              </div>
            </div>

            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: CREAM, marginBottom: 6 }}>One last thing</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CREAM_DIM, marginBottom: 24, lineHeight: 1.6 }}>This helps us make the 30 minutes actually useful for you.</p>

            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CREAM_FAINT, marginBottom: 12 }}>What&apos;s your biggest bottleneck right now?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 28 }}>
              {[
                'Getting attention / content',
                'Converting followers to clients',
                'Positioning & pricing',
                'Consistency & systems',
                'Standing out in my niche',
              ].map((v) => (
                <Opt key={v} label={v} selected={f.bottleneck === v} onClick={() => set('bottleneck')(v)} />
              ))}
            </div>

            {error && <div style={{ color: '#ef4444', fontSize: 13, fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{error}</div>}

            <BigBtn
              onClick={() => { if (!f.bottleneck) return; submit(); }}
              disabled={loading || !f.bottleneck}
            >
              {loading ? 'Reviewing your profile…' : 'Book My Free Session →'}
            </BigBtn>
            <div style={{ textAlign: 'center', marginTop: 12, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: CREAM_FAINT }}>
              No spam. We&apos;ll only reach out about your session.
            </div>
          </div>
        )}

        {/* ── STEP 4 — Booked ── */}
        {step === 4 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', maxWidth: 480, margin: '0 auto', width: '100%', textAlign: 'center' }}>
            <div style={{ width: 44, height: 2, background: GOLD, margin: '0 auto 24px', borderRadius: 2 }} />
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: CREAM, marginBottom: 12, lineHeight: 1.15 }}>
              You&apos;re in.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: CREAM_DIM, lineHeight: 1.75, marginBottom: 10 }}>
              We&apos;ve reviewed your profile. Pick a time that works — your spot is held for the next 15 minutes.
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CREAM_FAINT, marginBottom: 32 }}>
              Check your email after booking — we&apos;ll send prep materials so the session is as useful as possible.
            </p>
            <div id="calendly-embed-ig" style={{ minWidth: '320px', height: '700px', width: '100%' }} />
          </div>
        )}

        {/* Footer */}
        {step !== 4 && (
          <div style={{ padding: '20px 24px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: CREAM_FAINT, lineHeight: 1.7 }}>
              © 2026 VTC · Results vary · Not financial advice
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
