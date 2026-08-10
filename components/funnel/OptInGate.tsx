'use client';

/* Shared opt-in entry gate for the VSL funnel family (freebie / clipping /
 * buyer-mirror). Shows a blurred, non-interactive replica of the /funnel/vsl
 * hero behind a step-by-step opt-in modal (the first thing a visitor sees).
 * After the 7 questions are answered we POST to /api/funnel/optin (store +
 * optional Kit subscribe + optional Discord lead ping + conditional CRM), show a
 * "thank you" pop-up, then redirect to /funnel/vsl after 5 seconds.
 *
 * Every funnel uses the exact same layout — only the `funnel` key differs (it
 * drives tracking + the server-side routing of the lead). */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { captureTracking, getTracking, type TrackingData } from '@/lib/tracking';
import PhoneField from '@/components/PhoneField';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireStandard, fireLead, fireOnce } from '@/lib/pixel-tracker';
import { isValidEmail, isValidPhone, normalizePhone, EMAIL_HINT, PHONE_HINT } from '@/lib/contact-format';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = () => window as any;

/* ── Opt-in questions (from Opt-in questions.pdf), one per step ── */
type Key = 'first_name' | 'phone' | 'email' | 'instagram' | 'making_money' | 'coaching_business' | 'monthly_cash';
interface Q { key: Key; question: string; type: 'text' | 'tel' | 'email' | 'radio'; placeholder?: string; options?: string[]; }
const QUESTIONS: Q[] = [
  { key: 'first_name',        question: "What's your first name?",                             type: 'text',  placeholder: 'SooWei' },
  { key: 'phone',             question: "What's your phone number?",                            type: 'tel',   placeholder: '+1 555 000 0000' },
  { key: 'email',             question: "What's your email address?",                           type: 'email', placeholder: 'you@example.com' },
  { key: 'instagram',         question: "What's your IG handle?",                               type: 'text',  placeholder: '@yourhandle' },
  { key: 'making_money',      question: 'Are you making money from your content?',              type: 'radio', options: ['Yes I do', "No I don't, but looking to do it"] },
  { key: 'coaching_business', question: 'Are you running (or associated) with a coaching business?', type: 'radio', options: ['Yes', 'Yes, I operate one', "No I don't have one"] },
  { key: 'monthly_cash',      question: "What's your monthly cash collected?",                  type: 'radio', options: ['Under $10k', '$10k - $30k', '$30k+'] },
];

const inp: React.CSSProperties = {
  width: '100%', background: '#0d0d0d', border: '1.5px solid rgba(255,255,255,0.1)',
  borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 16,
  fontFamily: F, outline: 'none', transition: 'border-color 0.2s',
};

/* Static, blurred replica of the VSL hero (visual backdrop only). */
function VslBackdrop() {
  return (
    <div aria-hidden style={{ filter: 'blur(7px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.9 }}>
      <section style={{ textAlign: 'center', padding: '2px 24px 52px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <img src="/onboarding/goh-logo.png" alt="" style={{ width: 104, height: 104, objectFit: 'contain' }} />
        </div>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: Y, marginBottom: 20 }}>
          Coaches &amp; Consultants
        </div>
        <h1 style={{ fontFamily: F, fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 800, color: '#fff', lineHeight: 1.18, marginBottom: 32, letterSpacing: '-0.01em' }}>
          How Established Founders Are Adding{' '}
          <span style={{ color: Y, whiteSpace: 'nowrap' }}>$100-300k/Mo</span> Profit With This Organic Content System
        </h1>
        <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,20px)', fontWeight: 500, color: 'rgba(255,255,255,0.62)', maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.55 }}>
          So You Can Sign Clients Consistently With Organic Content
        </p>
      </section>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, background: '#111', border: '1px solid #1c1c1c' }} />
      </div>
    </div>
  );
}

export default function OptInGate({ funnel, redirectTo = '/funnel/vsl' }: { funnel: string; redirectTo?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'form' | 'thanks'>('form');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<Key, string>>>({});
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const tracking = useRef<TrackingData>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const current = QUESTIONS[step];
  const val = answers[current.key] ?? '';
  const progress = ((step + 1) / QUESTIONS.length) * 100;
  const isLast = step === QUESTIONS.length - 1;

  function track(event: string, props?: Record<string, unknown>) {
    try { w().posthog?.capture(event, { funnel, ...props }); } catch {}
    trackEvent(funnel, event, props);
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    tracking.current = captureTracking();
    track('optin_view', { ...tracking.current });
    fireStandard('ViewContent', { content_name: `Brand Architect ${funnel}`, content_type: 'funnel' });
    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'form' && current.type !== 'radio') {
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    }
  }, [step, phase, current.type]);

  useEffect(() => {
    if (phase !== 'thanks') return;
    const id = setTimeout(() => router.push(redirectTo), 5000);
    return () => clearTimeout(id);
  }, [phase, router, redirectTo]);

  function set(v: string) { setAnswers((a) => ({ ...a, [current.key]: v })); setErr(''); }

  function validateCurrent(): string {
    const v = (answers[current.key] ?? '').trim();
    if (!v) return 'Please fill this in before continuing.';
    if (current.type === 'email' && !isValidEmail(v)) return EMAIL_HINT;
    if (current.type === 'tel' && !isValidPhone(v)) return PHONE_HINT;
    return '';
  }

  async function advance() {
    const invalid = validateCurrent();
    if (invalid) { setErr(invalid); return; }
    setErr('');
    if (!isLast) { setStep((s) => s + 1); track('optin_step', { step: step + 1, field: current.key }); return; }
    await submit();
  }

  function pick(v: string) {
    setAnswers((a) => ({ ...a, [current.key]: v }));
    setErr('');
    setTimeout(() => { if (!isLast) { setStep((s) => s + 1); } else { submit({ ...answers, [current.key]: v }); } }, 260);
  }

  async function submit(final?: Partial<Record<Key, string>>) {
    const a = final ?? answers;
    setLoading(true);
    const phone = normalizePhone(a.phone ?? '');
    const t = getTracking();
    try {
      await fetch('/api/funnel/optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel,
          first_name: a.first_name, phone, email: a.email, instagram: a.instagram,
          making_money: a.making_money, coaching_business: a.coaching_business, monthly_cash: a.monthly_cash,
          utm_source: t.utm_source, utm_medium: t.utm_medium, utm_campaign: t.utm_campaign,
          utm_content: t.utm_content, utm_term: t.utm_term,
          fbclid: t.fbclid, gclid: t.gclid, ttclid: t.ttclid,
          traffic_source: t.traffic_source, referrer: t.referrer, landing_page: t.landing_page,
        }),
      });
      track('optin_submitted', { making_money: a.making_money, monthly_cash: a.monthly_cash });
      if (a.email && fireOnce(`${funnel}-lead:${a.email}`)) fireLead({ email: a.email, contentName: `Brand Architect ${funnel}` });
      setPhase('thanks');
    } catch {
      setErr('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); advance(); }
  }

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{-webkit-font-smoothing:antialiased;}
        input::placeholder{color:#444;} input:focus{border-color:rgba(255,225,0,0.5)!important;outline:none;}`}</style>

      <VslBackdrop />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.62)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', overflowY: 'auto', padding: '32px 16px',
      }}>
        <div style={{
          width: '100%', maxWidth: 460, background: '#0b0b0b', border: `1.5px solid ${Y}44`,
          borderRadius: 20, padding: 'clamp(26px,4vw,36px)', margin: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: phase === 'form' ? 18 : 20 }}>
            <img src="/onboarding/goh-logo.png" alt="Goh Consulting" style={{ width: 68, height: 68, objectFit: 'contain' }} />
          </div>

          {phase === 'form' ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <h2 style={{ fontFamily: F, fontSize: 'clamp(19px,2.6vw,23px)', fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: 6 }}>
                  Get The Free <span style={{ color: Y }}>$408k/Mo Content Playbook</span>
                </h2>
                <p style={{ fontFamily: F, fontSize: 13, color: '#888' }}>Answer a few quick questions — it&apos;s sent to your inbox.</p>
              </div>

              <div style={{ height: 2, background: '#1e1e1e', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: Y, borderRadius: 2, transition: 'width 0.35s ease' }} />
              </div>
              <div style={{ fontFamily: F, fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 20 }}>
                Step {step + 1} of {QUESTIONS.length}
              </div>

              <h3 style={{ fontFamily: F, fontSize: 'clamp(17px,2.4vw,20px)', fontWeight: 700, color: '#fff', marginBottom: 18, lineHeight: 1.3 }}>
                {current.question}
              </h3>

              {current.type === 'radio' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {current.options!.map((o) => (
                    <button key={o} type="button" onClick={() => pick(o)} style={{
                      textAlign: 'left', padding: '13px 16px', borderRadius: 10, cursor: 'pointer',
                      background: val === o ? 'rgba(245,230,163,0.08)' : '#0d0d0d',
                      border: `1.5px solid ${val === o ? Y : 'rgba(255,255,255,0.08)'}`,
                      color: val === o ? Y : '#bbb', fontFamily: F, fontSize: 14.5, fontWeight: val === o ? 700 : 400,
                      transition: 'all 0.15s',
                    }}>{o}</button>
                  ))}
                </div>
              ) : current.type === 'tel' ? (
                <PhoneField value={val} onChange={set} fontFamily={F} autoFocus onEnter={advance} invalid={!!err} />
              ) : (
                <input
                  ref={inputRef}
                  type={current.type} value={val} onChange={(e) => set(e.target.value)} onKeyDown={handleKey}
                  inputMode={current.type === 'email' ? 'email' : undefined}
                  autoComplete={current.type === 'email' ? 'email' : current.key === 'first_name' ? 'given-name' : 'off'}
                  placeholder={current.placeholder} style={inp}
                />
              )}

              {err && <p style={{ fontFamily: F, fontSize: 12.5, color: '#e05555', marginTop: 10 }}>{err}</p>}

              <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
                {step > 0 && (
                  <button type="button" onClick={() => { setStep((s) => s - 1); setErr(''); }} style={{
                    padding: '12px 18px', background: 'transparent', border: '1px solid #252525',
                    borderRadius: 50, color: '#666', fontFamily: F, fontSize: 13, cursor: 'pointer',
                  }}>← Back</button>
                )}
                {current.type !== 'radio' && (
                  <button type="button" onClick={advance} disabled={loading} style={{
                    flex: 1, padding: '14px 28px', background: loading ? '#1e1e1e' : Y, border: 'none',
                    borderRadius: 50, color: loading ? '#555' : '#111', fontFamily: F, fontSize: 15, fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
                  }}>{loading ? 'Sending…' : isLast ? 'Send Me The Freebie →' : 'Next →'}</button>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '4px 4px 10px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                background: `${Y}18`, border: `1.5px solid ${Y}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: Y, fontSize: 28,
              }}>✓</div>
              <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,3vw,26px)', fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: 12 }}>
                Thank you for opting in!
              </h2>
              <p style={{ fontFamily: F, fontSize: 15, color: '#aaa', lineHeight: 1.65, marginBottom: 8 }}>
                The freebie has been sent to your email.
              </p>
              <p style={{ fontFamily: F, fontSize: 12.5, color: '#555' }}>Taking you to the next step…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
