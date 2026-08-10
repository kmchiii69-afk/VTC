'use client';

/* Shared VSL-style funnel body reused across the 3 ads-gate segments
 * (/funnel/ads/under-100k, /over-100k-ads, /over-100k-no-ads). Same video
 * embed, same 13-step qualification form, same embedded BookingCalendar as
 * /funnel/vsl — only the hero copy, tracking funnel name, and API target
 * differ per segment so each can be tracked and iterated independently. */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { captureTracking, getTracking, type TrackingData } from '@/lib/tracking';
import BookingCalendar from '@/components/BookingCalendar';
import PhoneField from '@/components/PhoneField';
import { computeIcpTier } from '@/components/funnel/ThankYou';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom, fireLead, fireQualified, fireBooked, fireStandard, fireOnce } from '@/lib/pixel-tracker';
import { attachVideoTracker } from '@/lib/video-tracker';
import { isValidEmail, isValidPhone, normalizePhone, EMAIL_HINT, PHONE_HINT } from '@/lib/contact-format';
import { CASE_STUDIES, caseStudyEmbedUrl } from '@/lib/case-studies';
import { isBelowRevenueFloor, NOT_READY_PATH } from '@/lib/revenue-gate';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

const VIDEO_ELEMENT_ID = 'vidalytics_embed__opKp90miYcFxQbC';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = () => window as any;

/* ── client roster ── */
const CLIENTS: { name: string; handle: string; img?: string }[] = [
  { name: 'Juan Carrizo',        handle: '@juanxcarrizo',      img: '/funnel/clients/juan.jpg' },
  { name: 'Alan Caro',           handle: '@alancaro_',         img: '/funnel/clients/alan-caro.jpg' },
  { name: 'Jesse Rogers',        handle: '@casper_smc',        img: '/funnel/clients/jesse-rogers.jpg' },
  { name: 'Stemar Greene',       handle: '@Abuv_thepar',       img: '/funnel/clients/stemar-greene.jpg' },
  { name: 'Maya & Joey',         handle: '@mayaaengel',        img: '/funnel/clients/maya-joey.jpg' },
  { name: 'Alessio & Bryan',     handle: '@createcontent.club', img: '/funnel/clients/create-content-club.jpg' },
  { name: 'Wyatt Webber',        handle: '@wyattwestonwebber', img: '/funnel/clients/wyatt-webber.jpg' },
  { name: 'Hans',                handle: '@hanskadss',         img: '/funnel/clients/hans.jpg' },
  { name: 'Darío Porta Sánchez', handle: '@_darioporta',       img: '/funnel/clients/dario-porta-sanchez.jpg' },
  { name: 'Jake Trinder',        handle: '@jake.trinder',      img: '/funnel/clients/jake-trinder.jpg' },
  { name: 'Thien Vu',            handle: '@itsthienvuvo',      img: '/funnel/clients/thienvu.jpg' },
  { name: 'Oliver Sung',         handle: '@oliversungg',       img: '/funnel/clients/oliver-sung.jpg' },
  { name: 'Jomar Beterina',      handle: '@baterinajomar',     img: '/funnel/clients/jomar-beterina.jpg' },
  { name: 'Yusuf Adam',          handle: '@_ceoyusuf',         img: '/funnel/clients/yusuf-adam.jpg' },
  { name: 'Gabe Chia',           handle: '@gabechiaa',         img: '/funnel/clients/gabe-chia.jpg' },
  { name: 'Joshua Chang',        handle: '@thejoshchang',      img: '/funnel/clients/joshua-chang.jpg' },
  { name: 'Andres Wolf',         handle: '@dpdrfounder',       img: '/funnel/clients/andres-wolf.jpg' },
  { name: 'Jake Seals',          handle: '@jakeseals',         img: '/funnel/clients/jake-seals.jpg' },
  { name: 'Hoku Arnold',         handle: '@hokuarnold',        img: '/funnel/clients/hoku-arnold.jpg' },
  { name: 'Andrew Shin',         handle: '@andrewcshin',       img: '/funnel/clients/andrew-shin.jpg' },
  { name: 'Danny Latman',        handle: '@dannylatmanfi',     img: '/funnel/clients/danny-latman.jpg' },
  { name: 'Lucía Troyano',       handle: '@luciatroyano_',     img: '/funnel/clients/lucia-troyano.jpg' },
  { name: 'Josh Bower',          handle: '@the_joshbowers',    img: '/funnel/clients/josh-bower.jpg' },
  { name: 'Kennedy Davis',       handle: '@kennedyy.davis',    img: '/funnel/clients/kennedy-davis.jpg' },
  { name: 'Moussari M.',         handle: '@bymoussari',        img: '/funnel/clients/moussari-m.jpg' },
  { name: 'Sergio Chavez',       handle: '@sergjchavez',       img: '/funnel/clients/sergio-chavez.jpg' },
  { name: 'Emma Lavri',          handle: '@alexlavriyt',       img: '/funnel/clients/emma-lavri.jpg' },
  { name: 'Nigel Daley',         handle: '@nigel.daley',       img: '/funnel/clients/nigel-daley.jpg' },
];

/* Shared with /funnel/not-ready so one list drives both. */

const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

function Pill({ c }: { c: typeof CLIENTS[0] }) {
  // Fall back to initials if the image is missing or fails to load.
  const [imgError, setImgError] = useState(false);
  const showImg = c.img && !imgError;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: '#0d0d0d', border: '1.5px solid rgba(255,215,0,0.45)',
      borderRadius: 60, padding: '10px 22px 10px 10px', minWidth: 0,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
        background: '#1a1a1a', border: '1.5px solid rgba(255,215,0,0.3)',
        overflow: 'hidden', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 13, fontWeight: 700, color: Y,
      }}>
        {showImg
          ? <img src={c.img} alt={c.name} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials(c.name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>{c.handle}</div>
      </div>
    </div>
  );
}

/* ── input styles ── */
const inp: React.CSSProperties = {
  width: '100%', background: '#0d0d0d', border: '1.5px solid rgba(255,255,255,0.1)',
  borderRadius: 12, padding: '13px 18px', color: '#fff', fontSize: 16,
  fontFamily: F, outline: 'none', transition: 'border-color 0.2s',
};

/* ── Qualification logic ──
 * Only under-100k's investment question can trigger a DQ (it's an
 * affordability check) — the over-100k segments already confirmed $100k+/mo
 * revenue at the gate, so their investment question is outcome-framed
 * instead and never produces this exact string, meaning they always pass
 * through as qualified. No segment-aware branching needed here. */
function qualify(invest: string): 'qualified' | 'dq' {
  if (invest.includes('$0 – $5,000')) return 'dq';
  return 'qualified';
}

/* ── STEP definitions — vary per segment (2026-07-16 Kim/Gustavo call):
 * the $100k+ segments already confirmed their revenue tier at the gate, so
 * asking them low-anchored revenue/investment options re-litigates something
 * they already told us and reads as not having listened. Their investment
 * question is reframed outcome-first ("what would solving this be worth")
 * instead of affordability-first ("can you afford this") since affordability
 * isn't in question at that revenue level. over-100k-no-ads also gets one
 * extra emotional question — that audience needs more trust built before the
 * ask, per the call. */
type FieldKey = 'firstName'|'lastName'|'email'|'phone'|'guests'|'instagram'|
  'business'|'currentRevenue'|'targetRevenue'|'blocker'|'emotionalCost'|'adsRunningDuration'|'canDeliverResults'|'commitment'|
  'investment'|'decisionMaker';

interface Step {
  key: FieldKey;
  question: string;
  sub?: string;
  type: 'text'|'email'|'tel'|'textarea'|'radio';
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

function buildSteps(segment: SegmentConfig['segment']): Step[] {
  // 'vsl' mirrors the under-100k step set exactly.
  const isOver100k = segment !== 'under-100k' && segment !== 'vsl';

  const steps: Step[] = [
    { key: 'firstName',      question: "What's your first name?",                                             type: 'text',     placeholder: 'SooWei',            required: true  },
    { key: 'lastName',       question: "And your last name?",                                                  type: 'text',     placeholder: 'Goh',               required: true  },
    { key: 'email',          question: "What's your email address?",                                           type: 'email',    placeholder: 'you@example.com',   required: true  },
    { key: 'phone',          question: "What's your phone number?",                                            type: 'tel',      placeholder: '+1 555 000 0000',   required: true  },
    { key: 'instagram',      question: "What's your Instagram handle?",                                        type: 'text',     placeholder: '@yourhandle',       required: true  },
    { key: 'business',       question: "If you had to describe your business in two lines, what would they be?",
                                                                                                                 type: 'textarea', placeholder: 'I help...',         required: true  },
    { key: 'currentRevenue', question: "What is your current monthly revenue?",                                type: 'radio',    required: true,
      options: isOver100k
        ? ['$100,000 – $250,000','$250,000 – $500,000','$500,000 – $1,000,000','$1,000,000+']
        : ['$5,000 – $20,000','$20,000 – $50,000','$50,000 – $100,000'] },
    { key: 'targetRevenue',  question: "What is your target monthly revenue?",                                 type: 'radio',    required: true,
      options: isOver100k
        ? ['$250,000 – $500,000','$500,000 – $1,000,000','$1,000,000 – $5,000,000','$5,000,000+']
        : ['$30,000 – $50,000','$50,000 – $100,000','$100,000 – $200,000','$200,000+'] },
    { key: 'blocker',        question: "What's stopping you from reaching that goal?",
      sub: 'Insufficient leads, low closing rate, lack of growth, etc.',                                       type: 'textarea', placeholder: 'My biggest challenge is...', required: true },
  ];

  if (segment === 'over-100k-no-ads') {
    steps.push({
      key: 'emotionalCost',
      question: 'If this stayed exactly the same for another 12 months, what would that actually cost you?',
      sub: 'Be honest — this is just for us, not anyone else.',
      type: 'textarea', placeholder: 'It would mean...', required: true,
    });
  }

  /* Feeds the post-booking "here's what running ads without a brand has
   * likely cost you" calculation (estimateAdsLostRevenue below) — per the
   * call, this belongs on the thank-you page, not here. */
  if (segment === 'over-100k-ads') {
    steps.push({
      key: 'adsRunningDuration',
      question: 'How long have you been running paid ads?',
      type: 'radio', required: true,
      options: ['Less than 6 months', '6 months – 1 year', '1 – 2 years', '2+ years'],
    });
  }

  steps.push(
    { key: 'commitment', question: "Since you're here, you're clearly serious about fixing this — on a scale of 1–10, how ready are you to make a decision on this call?",
      type: 'radio', required: true, options: ['1','2','3','4','5','6','7','8','9','10'] },
    ...(segment === 'under-100k' || segment === 'vsl' ? [{
      key: 'canDeliverResults' as const,
      question: 'If you were able to get qualified leads, would you be able to get them results?',
      sub: 'Be honest — this helps us make sure we’re the right fit before the call.',
      type: 'radio' as const, required: true,
      options: ['Yes — I can deliver results once I have the leads', 'No — I’d need to fix my delivery/process first'],
    }] : []),
    isOver100k
      ? { key: 'investment', question: 'If we solved this bottleneck for you, how much additional revenue would that release monthly?',
          sub: 'This helps us understand the scale of what we’re solving.',
          type: 'radio', required: true, options: ['$10,000 – $30,000/mo','$30,000 – $100,000/mo','$100,000 – $1,000,000/mo','$1,000,000+/mo'] }
      : { key: 'investment', question: 'How much could you invest into your business right now?',
          sub: 'We only ask because we offer high-ticket services.',
          type: 'radio', required: true, options: ['I have/am willing to invest $0 – $5,000','I have/am willing to invest $5,000 – $15,000','I have/am willing to invest $15,000 – $30,000','I have/am willing to invest $30,000 – $50,000','I have/am willing to invest $50,000+'] },
    { key: 'decisionMaker', question: "Since you're serious about solving this, are you the one who'll make the final call?",
      type: 'radio', required: true, options: ["Yes — I'm the sole decision maker and ready to decide today", "I'll need to loop in a partner or co-founder first"] },
    { key: 'guests',        question: 'Any partner emails to add to the call? (optional)',                     type: 'email',    placeholder: 'partner@example.com' },
  );

  return steps;
}

interface SegmentConfig {
  /** Slug used as the funnel name for tracking + as the `segment`/`source` sent to the API. */
  segment: 'under-100k' | 'over-100k-ads' | 'over-100k-no-ads' | 'vsl';
  /** API route that receives the application submission. */
  apiEndpoint: string;
  /** Base content name for pixel events (Meta/GA4/TikTok/CAPI). */
  pixelContentName: string;
  /** Per-funnel Calendly booking event override (exact name + slug). Defaults to
   *  the shared "1 on 1 Strategy Call" when unset. */
  calendlyEventName?: string;
  calendlyEventSlug?: string;
  eyebrow: string;
  headlinePre: string;
  headlineHi: string;
  headlinePost?: string;
  subheadline: string;
  /** Optional small stat/proof callout rendered under the subheadline. */
  proofLine?: string;
  /** Adds a 4th "what you get" item about recovering non-closed ad leads — only relevant to segments sourced from paid ads. */
  adsFunnelBonus?: boolean;
  /** Rapid-fire proof strip rendered right after the hero, before the video —
   *  a compact run of short facts back to back (same "6 facts before the ask"
   *  pattern political speeches use) to build trust fast. Only worth it for
   *  audiences that need more convincing before they'll hand over $20k+,
   *  e.g. an already-successful organic-only audience being asked to trust a
   *  paid program for the first time. */
  trustFacts?: string[];
}

/* ── Step-by-step form ── */
function IntakeForm({ cfg, onDone }: { cfg: SegmentConfig; onDone: (data: Record<string, string>, result: 'qualified' | 'dq') => void }) {
  const tracking = getTracking();
  const STEPS = buildSteps(cfg.segment);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<FieldKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const current = STEPS[step];
  const val = answers[current.key] ?? '';
  const progress = ((step + 1) / STEPS.length) * 100;

  useEffect(() => {
    // preventScroll: true — a plain .focus() yanks the page down to the
    // input on mount (below the hero + autoplaying video), so by the time
    // someone scrolls back up the video's already well past the intro.
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80);
  }, [step]);

  function set(v: string) { setAnswers(a => ({ ...a, [current.key]: v })); }

  /* Format-enforcing validation — email/phone must be well-formed before the
   * step can advance, so leads can't submit garbage into the CRM/Calendly. */
  function validateCurrent(): string {
    const v = (answers[current.key] ?? '').trim();
    if (current.required && !v) return 'Please fill this in before continuing.';
    if (!v) return '';
    if (current.type === 'email' && !isValidEmail(v)) return EMAIL_HINT;
    if (current.type === 'tel' && !isValidPhone(v)) return PHONE_HINT;
    return '';
  }

  function track(event: string, props?: Record<string, unknown>) {
    try { w().posthog?.capture(event, { funnel: cfg.segment, ...props }); } catch {}
    trackEvent(cfg.segment, event, props);
    fireCustom(event, props);
  }

  // Build the application POST body from the answers gathered so far. Used for
  // both the per-step partial save (completed=false) and the final submit.
  function buildAppBody(a: typeof answers, completed: boolean, lastStep: number) {
    const blockerWithEmotionalCost = [
      a.blocker,
      a.emotionalCost && `— 12-month cost of staying the same: ${a.emotionalCost}`,
      a.canDeliverResults && `— Can deliver results once they have leads: ${a.canDeliverResults}`,
    ].filter(Boolean).join(' ') || undefined;
    return {
      segment: cfg.segment,
      first_name: a.firstName,
      last_name: a.lastName,
      email: a.email,
      phone: normalizePhone(a.phone ?? ''),
      guests: a.guests,
      instagram: a.instagram,
      business_description: a.business,
      current_revenue: a.currentRevenue,
      target_revenue: a.targetRevenue,
      blocker: blockerWithEmotionalCost,
      commitment: a.commitment,
      investment_range: a.investment,
      decision_maker: a.decisionMaker,
      qualified: qualify(a.investment ?? '') === 'qualified',
      source: `ads-${cfg.segment}`,
      completed,
      last_step: lastStep,
      /* attribution */
      utm_source:     tracking.utm_source,
      utm_medium:     tracking.utm_medium,
      utm_campaign:   tracking.utm_campaign,
      utm_content:    tracking.utm_content,
      utm_term:       tracking.utm_term,
      fbclid:         tracking.fbclid,
      gclid:          tracking.gclid,
      ttclid:         tracking.ttclid,
      traffic_source: tracking.traffic_source,
      referrer:       tracking.referrer,
      landing_page:   tracking.landing_page,
    };
  }

  // Fire-and-forget partial save (captures drop-offs). No-op until we have an email.
  function savePartial(a: typeof answers, lastStep: number) {
    if (!a.email) return;
    try {
      fetch(cfg.apiEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAppBody(a, false, lastStep)),
      }).catch(() => {});
    } catch {}
  }

  async function advance() {
    const invalid = validateCurrent();
    if (invalid) { setErr(invalid); return; }
    setErr('');

    if (step < STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      track(`${cfg.segment}_form_step`, { step: next, field: current.key });
      savePartial({ ...answers }, next);
      return;
    }

    setLoading(true);
    const a = { ...answers };
    const normalizedPhone = normalizePhone(a.phone ?? '');
    const result = qualify(a.investment ?? '');
    try {
      await fetch(cfg.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAppBody(a, true, STEPS.length)),
      });

      track(`${cfg.segment}_form_submitted`, { result, investment: a.investment, commitment: a.commitment, revenue: a.currentRevenue, ...tracking });
      track(result === 'qualified' ? `${cfg.segment}_qualified` : `${cfg.segment}_disqualified`, { investment: a.investment, commitment: a.commitment, ...tracking });
      if (fireOnce(`${cfg.segment}-lead:${a.email}`)) fireLead({ email: a.email, contentName: cfg.pixelContentName });
      if (result === 'qualified' && fireOnce(`${cfg.segment}-booked:${a.email}`)) fireBooked({ email: a.email, contentName: cfg.pixelContentName });
      fireCustom(`${cfg.segment}_application`, { result, investment: a.investment });

      onDone({ firstName: a.firstName ?? '', lastName: a.lastName ?? '', email: a.email ?? '', phone: normalizedPhone, ig: a.instagram ?? '', investment: a.investment ?? '', commitment: a.commitment ?? '', revenue: a.currentRevenue ?? '', adsRunningDuration: a.adsRunningDuration ?? '', business: a.business ?? '', targetRevenue: a.targetRevenue ?? '', blocker: a.blocker ?? '', decisionMaker: a.decisionMaker ?? '', canDeliverResults: a.canDeliverResults ?? '' }, result);
    } catch {
      setErr('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && current.type !== 'textarea') { e.preventDefault(); advance(); }
  }

  function pick(v: string) {
    setAnswers(a => ({ ...a, [current.key]: v }));
    setErr('');
    setTimeout(() => {
      if (step < STEPS.length - 1) {
        const next = step + 1;
        setStep(next);
        track(`${cfg.segment}_form_step`, { step: next, field: current.key, value: v });
        savePartial({ ...answers, [current.key]: v }, next);
      }
    }, 280);
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div style={{ maxWidth: 580, margin: '0 auto', padding: '0 24px 80px' }}>
      {step === 0 && (
        <p style={{ fontFamily: F, fontSize: 13, color: '#888', lineHeight: 1.6, marginBottom: 24, textAlign: 'center' }}>
          A few quick questions to see if this is a fit. If so, we&apos;ll map out exactly what&apos;s possible on the call.
        </p>
      )}
      <div style={{ height: 2, background: '#1e1e1e', borderRadius: 2, marginBottom: 40, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: Y, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <span style={{
          fontFamily: F, fontSize: 11, fontWeight: 700, color: Y,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          background: 'rgba(245,230,163,0.08)', border: '1px solid rgba(245,230,163,0.2)',
          borderRadius: 20, padding: '4px 10px',
        }}>Step {step + 1}</span>
        <span style={{ fontFamily: F, fontSize: 11, color: '#444', letterSpacing: '0.08em' }}>of {STEPS.length}</span>
      </div>

      <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,3vw,30px)', fontWeight: 800, color: '#fff', marginBottom: current.sub ? 8 : 28, lineHeight: 1.25 }}>
        {current.question}
      </h2>
      {current.sub && (
        <p style={{ fontFamily: F, fontSize: 14, color: '#555', marginBottom: 24, lineHeight: 1.6 }}>{current.sub}</p>
      )}

      {current.key === 'commitment' ? (
        <div>
          <div style={{ display: 'flex', gap: 6 }}>
            {current.options!.map(o => {
              const sel = val === o;
              return (
                <button key={o} type="button" onClick={() => pick(o)} style={{
                  flex: 1, minWidth: 0, aspectRatio: '1', borderRadius: 8, cursor: 'pointer',
                  background: sel ? Y : '#0d0d0d',
                  border: `1.5px solid ${sel ? Y : 'rgba(255,255,255,0.07)'}`,
                  color: sel ? '#111' : '#666', fontFamily: F, fontSize: 13, fontWeight: 800,
                  transition: 'all 0.15s',
                }}>{o}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            <span style={{ fontFamily: F, fontSize: 11, color: '#444' }}>Not committed</span>
            <span style={{ fontFamily: F, fontSize: 11, color: '#444' }}>All in</span>
          </div>
        </div>
      ) : current.type === 'radio' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {current.options!.map(o => (
            <button key={o} type="button" onClick={() => pick(o)} style={{
              textAlign: 'left', padding: '13px 18px', borderRadius: 10, cursor: 'pointer',
              background: val === o ? 'rgba(245,230,163,0.08)' : '#0d0d0d',
              border: `1.5px solid ${val === o ? Y : 'rgba(255,255,255,0.07)'}`,
              color: val === o ? Y : '#bbb', fontFamily: F, fontSize: 14, fontWeight: val === o ? 700 : 400,
              transition: 'all 0.15s',
            }}>{o}</button>
          ))}
        </div>
      ) : current.type === 'textarea' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={val} onChange={e => set(e.target.value)} onKeyDown={handleKey}
          rows={4} placeholder={current.placeholder}
          style={{ ...inp, resize: 'vertical', display: 'block' }}
        />
      ) : current.key === 'phone' ? (
        <PhoneField value={val} onChange={set} fontFamily={F} autoFocus onEnter={advance} invalid={!!err} />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={current.type} value={val} onChange={e => set(e.target.value)} onKeyDown={handleKey}
          inputMode={current.type === 'email' ? 'email' : undefined}
          autoComplete={current.type === 'email' ? 'email' : current.key === 'firstName' ? 'name' : 'off'}
          placeholder={current.placeholder}
          style={inp}
        />
      )}

      {err && <p style={{ fontFamily: F, fontSize: 12, color: '#e05555', marginTop: 8 }}>{err}</p>}

      {current.type !== 'radio' && (
        <div style={{ display: 'flex', gap: 10, marginTop: 24, alignItems: 'center' }}>
          {step > 0 && (
            <button type="button" onClick={() => { setStep(s => s - 1); setErr(''); }} style={{
              padding: '12px 18px', background: 'transparent', border: '1px solid #252525',
              borderRadius: 50, color: '#555', fontFamily: F, fontSize: 13, cursor: 'pointer',
              letterSpacing: '0.02em',
            }}>← Back</button>
          )}
          <button type="button" onClick={advance} disabled={loading} style={{
            flex: 1, padding: '14px 28px', background: loading ? '#1e1e1e' : Y, border: 'none',
            borderRadius: 50, color: loading ? '#555' : '#111', fontFamily: F, fontSize: 15, fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.04em',
          }}>
            {loading ? 'Submitting...' : isLast ? 'Submit Application →' : 'Next →'}
          </button>
        </div>
      )}
      {current.type === 'radio' && step > 0 && (
        <button type="button" onClick={() => { setStep(s => s - 1); setErr(''); }} style={{
          marginTop: 14, padding: '9px 16px', background: 'transparent',
          border: '1px solid #252525', borderRadius: 50, color: '#555',
          fontFamily: F, fontSize: 12, cursor: 'pointer',
        }}>← Back</button>
      )}
    </div>
  );
}

function GohLogo() {
  // Same transparent-PNG mark used on the onboarding Join-Discord step (no glow here).
  return <img src="/onboarding/goh-logo.png" alt="Goh Consulting" style={{ width: 104, height: 104, objectFit: 'contain' }} />;
}

const ADS_REVENUE_FLOOR: Record<string, number> = {
  '$100,000 – $250,000': 100_000,
  '$250,000 – $500,000': 250_000,
  '$500,000 – $1,000,000': 500_000,
  '$1,000,000+': 1_000_000,
};

const ADS_DURATION_MONTHS: Record<string, number> = {
  'Less than 6 months': 3,
  '6 months – 1 year': 9,
  '1 – 2 years': 18,
  '2+ years': 30,
};

/** Ballpark "cost of running ads without a brand" for over-100k-ads only —
 *  the 20-point close-rate/margin gap from the proofLine copy, applied
 *  against their revenue floor and compounded over how long they've been
 *  running ads. Feeds the urgency block on their thank-you page (per the
 *  call: "compound the amount of money they've lost... take 20% of that"). */
function estimateAdsLostRevenue(revenue?: string, duration?: string): number | null {
  const base = revenue ? ADS_REVENUE_FLOOR[revenue] : undefined;
  const months = duration ? ADS_DURATION_MONTHS[duration] : undefined;
  if (!base || !months) return null;
  return Math.round(base * 0.2 * months);
}

export default function SegmentFunnel({ cfg }: { cfg: SegmentConfig }) {
  const router = useRouter();
  const [formResult, setFormResult] = useState<'idle' | 'qualified' | 'dq'>('idle');
  const [leadData, setLeadData] = useState<Record<string, string>>({});
  const [, setTracking] = useState<TrackingData>({});
  const [navigatingToThankYou, setNavigatingToThankYou] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);

  function handleBooked() {
    if (navigatingToThankYou) return;
    setNavigatingToThankYou(true);
    const tier = computeIcpTier(leadData.investment, leadData.commitment);

    /* Post-booking conversion fires here — the redirect now lands on the
     * /confirm page instead of /thank-you, so we can't rely on the thank-you
     * page view to record the completed booking. */
    trackEvent(cfg.segment, `${cfg.segment}_booking_completed`, { firstName: leadData.firstName, tier });
    fireCustom(`${cfg.segment}_booking_completed`, { firstName: leadData.firstName, tier });

    const params = new URLSearchParams();
    if (leadData.firstName) params.set('name', leadData.firstName);
    params.set('tier', tier);
    if (cfg.segment === 'over-100k-ads') {
      const lost = estimateAdsLostRevenue(leadData.revenue, leadData.adsRunningDuration);
      if (lost) params.set('lost', String(lost));
    }
    /* Each funnel has its OWN post-booking (confirm) page so funnel analytics
     * tracks visits per funnel. VSL lives under /funnel/vsl; the ad segments
     * under /funnel/ads/<segment>. */
    const confirmPath = cfg.segment === 'vsl' ? '/funnel/vsl/confirm' : `/funnel/ads/${cfg.segment}/confirm`;
    router.push(`${confirmPath}?${params.toString()}`);
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    const t = captureTracking();
    setTracking(t);

    try {
      w().posthog?.register({
        funnel: cfg.segment,
        traffic_source: t.traffic_source,
        utm_source:     t.utm_source,
        utm_medium:     t.utm_medium,
        utm_campaign:   t.utm_campaign,
        utm_content:    t.utm_content,
        utm_term:       t.utm_term,
        has_fbclid:     !!t.fbclid,
        has_gclid:      !!t.gclid,
      });
    } catch {}

    trackEvent(cfg.segment, `${cfg.segment}_view`, { ...t });
    fireCustom(`${cfg.segment}_view`, { ...t });
    fireStandard('ViewContent', { content_name: cfg.pixelContentName, content_type: 'funnel' });

    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }

    /* Re-inject on every mount (not just the first document load) so the video
     * also renders when this page is reached via client-side navigation — a
     * one-time global guard left the embed blank until a hard refresh. Dropping
     * any stale tag first keeps it to one; re-running the loader IIFE is safe
     * because the loader dedupes its own script loading and simply re-runs the
     * embed against the freshly mounted container. */
    document.querySelectorAll('script[data-vidal="seg-main"]').forEach(el => el.remove());
    {
      const s = document.createElement('script');
      s.type = 'text/javascript'; s.setAttribute('data-vidal', 'seg-main');
      s.innerHTML = `(function (v, i, d, a, l, y, t, c, s) {
        y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}
        var vl='Loader',vli=v[y][vl],vsl=v[c][vl+'Script'],vlf=v[c][vl+'Loaded'],ve='Embed';
        if(!vsl){vsl=function(u,cb){if(t){cb();return;}s=i.createElement('script');s.type='text/javascript';s.async=1;s.src=u;
          if(s.readyState){s.onreadystatechange=function(){if(s.readyState==='loaded'||s.readyState=='complete'){s.onreadystatechange=null;vlf=1;cb();}};}
          else{s.onload=function(){vlf=1;cb();};}i.getElementsByTagName('head')[0].appendChild(s);};v[c][vl+'Script']=vsl;}
        vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}
          vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
      })(window,document,'Vidalytics','vidalytics_embed__opKp90miYcFxQbC','https://fast.vidalytics.com/embeds/Dyp2a1Oi/_opKp90miYcFxQbC/');`;
      document.body.appendChild(s);
    }

    const detachVideoTracker = attachVideoTracker(VIDEO_ELEMENT_ID, {
      funnel: cfg.segment,
      videoTitle: cfg.pixelContentName,
    });
    return detachVideoTracker;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formResult !== 'qualified') return;
    trackEvent(cfg.segment, `${cfg.segment}_calendar_viewed`);
    if (fireOnce(`${cfg.segment}-qualified:${leadData.email}`)) {
      fireQualified({ email: leadData.email, contentName: `${cfg.pixelContentName} — Qualified` });
    }
    setTimeout(() => calRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formResult, leadData.email]);

  const rows: typeof CLIENTS[] = [];
  for (let i = 0; i < CLIENTS.length; i += 5) rows.push(CLIENTS.slice(i, i + 5));

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        iframe{display:block;}
        input::placeholder,textarea::placeholder{color:#444;}
        input:focus,textarea:focus{border-color:rgba(255,225,0,0.5)!important;outline:none;}
        /* Video case studies: 1 per row on phones, 2 per row (larger) from tablet up. */
        .sf-vgrid{display:grid;grid-template-columns:1fr;gap:28px;}
        @media (min-width:760px){.sf-vgrid{grid-template-columns:1fr 1fr;gap:40px;}}
      `}</style>

      {/* ── Hero ── */}
      <section style={{ textAlign: 'center', padding: '2px 24px 52px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}><GohLogo /></div>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: Y, marginBottom: 20 }}>
          {cfg.eyebrow}
        </div>
        <h1 style={{ fontFamily: F, fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 800, color: '#fff', lineHeight: 1.18, marginBottom: 32, letterSpacing: '-0.01em' }}>
          {cfg.headlinePre}{' '}
          {/* nowrap so a hyphenated figure ("$100-300k/Mo") can't break mid-number */}
          <span style={{ color: Y, whiteSpace: 'nowrap' }}>{cfg.headlineHi}</span>{cfg.headlinePost ?? ''}
        </h1>
      </section>

      {/* ── Rapid trust facts — 6-back-to-back-facts pattern, before the video ── */}
      {cfg.trustFacts && cfg.trustFacts.length > 0 && (
        <section style={{ maxWidth: 900, margin: '0 auto 44px', padding: '0 24px' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'center', gap: '10px 28px',
            background: 'rgba(245,230,163,0.04)', border: `1px solid ${Y}22`, borderRadius: 16,
            padding: '20px 28px',
          }}>
            {cfg.trustFacts.map((fact, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: F, fontSize: 13, color: '#ccc' }}>
                <span style={{ color: Y, fontSize: 14 }}>✓</span>
                {fact}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── VSL ── */}
      <div id="video" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', scrollMarginTop: 20 }}>
        <div id={VIDEO_ELEMENT_ID}
          style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }} />
      </div>

      {/* ── Supporting context — moved out of the hero so the top of the page
           is just the headline + CTA, not stacked with a subheadline + proof
           box before anyone's even seen the video ── */}
      <section style={{ textAlign: 'center', padding: '40px 24px 8px', maxWidth: 720, margin: '0 auto' }}>
        <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,20px)', fontWeight: 500, color: 'rgba(255,255,255,0.62)', margin: `0 0 ${cfg.proofLine ? 20 : 0}px`, lineHeight: 1.55 }}>
          {cfg.subheadline}
        </p>
        {cfg.proofLine && (
          <div style={{
            display: 'inline-block', maxWidth: 680,
            background: 'rgba(245,230,163,0.06)', border: `1px solid ${Y}33`,
            borderRadius: 14, padding: '16px 24px',
          }}>
            <p style={{ fontFamily: F, fontSize: 'clamp(15px,1.8vw,17px)', color: '#ddd', lineHeight: 1.65 }}>{cfg.proofLine}</p>
          </div>
        )}
      </section>

      {/* ── Form / Result ── */}
      <div id="cal" ref={calRef} style={{ paddingTop: 60 }}>
        {formResult === 'idle' && (
          <IntakeForm
            cfg={cfg}
            onDone={(data, result) => {
              /* Sub-$20k/mo applicants never see the calendar. The application
               * has already been submitted at this point, so the lead is captured
               * and can be sent resources — we just route them away from booking. */
              if (isBelowRevenueFloor(data.revenue)) {
                trackEvent(cfg.segment, `${cfg.segment}_below_revenue_floor`, { revenue: data.revenue });
                fireCustom(`${cfg.segment}_below_revenue_floor`, { revenue: data.revenue });
                router.push(`${NOT_READY_PATH}?from=${encodeURIComponent(cfg.segment)}`);
                return;
              }
              setLeadData(data);
              setFormResult(result);
            }}
          />
        )}

        {formResult === 'qualified' && (
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
            <div style={{
              background: '#0a0a0a', border: `1.5px solid ${Y}44`,
              borderRadius: 20, padding: 'clamp(28px,4vw,48px)', marginBottom: 40,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: `${Y}14`, border: `1px solid ${Y}44`,
                  borderRadius: 40, padding: '6px 20px', marginBottom: 20,
                }}>
                  <span style={{ fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: Y }}>
                    Application Approved
                  </span>
                </div>
                <h2 style={{ fontFamily: F, fontSize: 'clamp(22px,2.8vw,34px)', fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 12 }}>
                  {leadData.firstName ? (
                    <>Based on your application, {leadData.firstName[0].toUpperCase() + leadData.firstName.slice(1)} —{' '}
                      <span style={{ color: Y }}>we can help you.</span></>
                  ) : (
                    <>Based on your application, <span style={{ color: Y }}>we can help you.</span></>
                  )}
                </h2>
                <div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#888' }}>
                  Your Application Summary
                </div>
              </div>

              <div style={{ marginBottom: 28 }}>
                {[
                  leadData.investment && (cfg.segment === 'under-100k'
                    ? `Ready to invest ${leadData.investment.replace(/^I have\/am willing to invest\s*/i, '')}`
                    : `Solving this is worth ${leadData.investment} to your business`),
                  leadData.commitment && `Readiness to decide: ${leadData.commitment}/10`,
                  leadData.revenue && `Currently doing ${leadData.revenue}/mo`,
                ].filter(Boolean).map((line) => (
                  <div key={line} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                    <span style={{ color: Y, fontSize: 16, marginTop: 1, flexShrink: 0 }}>→</span>
                    <span style={{ fontFamily: F, fontSize: 16, color: '#ddd', lineHeight: 1.5 }}>{line}</span>
                  </div>
                ))}
              </div>

              {cfg.adsFunnelBonus && (
                <div style={{
                  marginBottom: 24, background: '#111', borderRadius: 12, padding: '20px 24px',
                  border: `1px solid ${Y}22`,
                }}>
                  <div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: Y, marginBottom: 10 }}>
                    Also Included — Ad Funnel Applicants
                  </div>
                  <div style={{ fontFamily: F, fontSize: 15, color: '#ccc', lineHeight: 1.6 }}>
                    We&apos;ll show you the exact redirect system we use to bring leads who didn&apos;t close the first time back into your funnel and close them on the second pass — so you get more revenue out of the same ad spend, not just more leads.
                  </div>
                </div>
              )}

              <div style={{
                background: '#111', borderRadius: 12, padding: '20px 24px',
                border: `1px solid ${Y}22`,
              }}>
                <div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: Y, marginBottom: 14 }}>
                  What Happens On The Call
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  {[
                    'We’ll break down your personal brand and hand you the exact bottlenecks stopping you from scaling',
                    'You’ll get the internal organic content system that’s scaled us to $408k/mo',
                    'You’ll leave with a roadmap built around your specific situation',
                    'Worst case — you leave with clear bottlenecks and a roadmap to fix them',
                    ...(cfg.adsFunnelBonus ? ['How we redirect leads who don’t close back into your funnel to close them on the next pass — more revenue from the same ad spend'] : []),
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ color: Y, fontSize: 15, marginTop: 1, flexShrink: 0 }}>→</span>
                      <span style={{ fontFamily: F, fontSize: 15, color: '#bbb', lineHeight: 1.55 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── What You're Gonna Get ── shown once qualified, right before booking */}
            <div style={{ marginBottom: 40 }}>
              <h2 style={{
                fontFamily: F, fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800,
                color: '#fff', textAlign: 'center', marginBottom: 36, lineHeight: 1.2,
              }}>
                What You&apos;re Gonna Get On This{' '}
                <span style={{ color: Y }}>Strategy Call</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 }}>
                {[
                  { src: '/box1-breakdown.png', alt: 'Brand Breakdown Session', gold: 'Personalized Breakdown', rest: ' Of Your Personal Brand To Identify Bottlenecks' },
                  { src: '/box2-walkthrough.png', alt: 'AI Strategy Generator', gold: '$408k/Mo', rest: 'Systems That Scaled Us To ', restAfter: ' Completely Organic With No Ads', goldFirst: false },
                  { src: '/box3-roadmap.png', alt: 'Brand Architect Portal', gold: 'Personalized Roadmap', rest: ' Showing Exactly How You Can Build Your Brand In Less Than 10 Hours A Week' },
                ].map(({ src, alt, gold, rest, restAfter, goldFirst }) => (
                  <div key={alt} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                      <img src={src} alt={alt} style={{ width: '100%', display: 'block' }} />
                    </div>
                    <div style={{ fontFamily: F, fontSize: 'clamp(15px,1.4vw,19px)', fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.35 }}>
                      {goldFirst === false ? (
                        <>{rest}<span style={{ color: Y }}>{gold}</span>{restAfter}</>
                      ) : (
                        <><span style={{ color: Y }}>{gold}</span>{rest}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {cfg.adsFunnelBonus && (
                <div style={{
                  marginTop: 24, background: '#111', borderRadius: 12, padding: '18px 22px',
                  border: `1px solid ${Y}22`,
                }}>
                  <div style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: Y, marginBottom: 8 }}>
                    Also included — ad funnel applicants
                  </div>
                  <div style={{ fontFamily: F, fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
                    We&apos;ll show you the exact redirect system we use to bring leads who didn&apos;t close the first time back into your funnel and close them on the second pass — so you get more revenue out of the same ad spend, not just more leads.
                  </div>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                Your slot is waiting — lock it in below.
              </p>
              <p style={{ fontFamily: F, fontSize: 13, color: '#555' }}>Spots fill up fast. Book before this closes.</p>
            </div>
            <BookingCalendar
              name={`${leadData.firstName ?? ''} ${leadData.lastName ?? ''}`.trim()}
              email={leadData.email ?? ''}
              phone={leadData.phone ?? ''}
              answers={{
                firstName: leadData.firstName ?? '',
                lastName: leadData.lastName ?? '',
                phone: leadData.phone ?? '',
                instagram: leadData.ig ?? '',
                business: leadData.business ?? '',
                currentRevenue: leadData.revenue ?? '',
                targetRevenue: leadData.targetRevenue ?? '',
                blocker: leadData.blocker ?? '',
                commitment: leadData.commitment ?? '',
                investment: leadData.investment ?? '',
                decisionMaker: leadData.decisionMaker ?? '',
                canDeliverResults: leadData.canDeliverResults ?? '',
              }}
              eventName={cfg.calendlyEventName}
              eventSlug={cfg.calendlyEventSlug}
              onBooked={handleBooked}
            />
          </div>
        )}

        {formResult === 'dq' && (
          <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, color: '#fff', marginBottom: 16 }}>
              We&apos;ve Received Your Application
            </h2>
            <p style={{ fontFamily: F, fontSize: 16, color: '#888', lineHeight: 1.8, marginBottom: 32 }}>
              Our team will review your answers and reach out directly if you&apos;re a strong fit for the Brand Architect program.
              In the meantime, explore our client results below.
            </p>
            <a
              href="https://www.youtube.com/@gohconsulting"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', padding: '16px 44px',
                background: '#111', border: `1.5px solid rgba(255,225,0,0.3)`,
                borderRadius: 50, color: Y, fontFamily: F, fontSize: 15,
                fontWeight: 700, textDecoration: 'none', letterSpacing: '0.04em',
              }}
            >Watch Client Case Studies →</a>
          </div>
        )}
      </div>

      {/* ── 100+ Case Studies ── */}
      <section style={{ padding: '20px 32px 60px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 800, color: Y, textAlign: 'center', marginBottom: 44 }}>
          Over 100 Successful Case Studies
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {row.map((c) => <Pill key={c.handle} c={c} />)}
            </div>
          ))}
        </div>
        <p style={{ fontFamily: F, fontSize: 18, fontWeight: 600, color: Y, textAlign: 'center', marginTop: 32 }}>
          And so many more...
        </p>
      </section>

      {/* ── Video Case Studies ── */}
      <section style={{ padding: '0 clamp(16px,4vw,32px) 60px', maxWidth: 1280, margin: '0 auto' }}>
        {/* 2-up grid (single column on phones) with a wider container so each
            video reads larger; the title reserve keeps rows aligned. */}
        <div className="sf-vgrid">
          {CASE_STUDIES.map((cs, i) => (
            <div key={i}>
              {/* 2-line reserve so every video starts at the same height and aligns. */}
              <p style={{ fontFamily: F, fontSize: 'clamp(16px,1.8vw,19px)', fontWeight: 500, color: '#fff', marginBottom: 12, lineHeight: 1.45, minHeight: '2.9em', textAlign: 'center' }}>
                {cs.pre}<strong style={{ color: Y }}>{cs.hi}</strong>
              </p>
              <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
                <iframe
                  src={caseStudyEmbedUrl(cs)}
                  title={cs.pre + cs.hi}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen loading="lazy"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '28px 32px', textAlign: 'center' }}>
        <p style={{ fontFamily: F, fontSize: 12, color: '#444', lineHeight: 1.8, maxWidth: 700, margin: '0 auto' }}>
          This website is not part of the YouTube, Google, or Facebook website; Google Inc or Facebook Inc. Also, this website is{' '}
          <strong style={{ color: '#555' }}>NOT</strong> endorsed by YouTube, Google or Facebook in any way. FACEBOOK is a trademark of FACEBOOK Inc. YOUTUBE is a trademark of GOOGLE Inc.
        </p>
      </footer>
    </div>
  );
}

export type { SegmentConfig };
