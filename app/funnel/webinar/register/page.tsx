'use client';

/* Webinar registration page — step 2 of the funnel (/funnel/webinar/register).
 * Reached from the video-preview page (/funnel/webinar) via "Join the Next
 * Live Class". Structure mirrors a proven B2C webinar-reg layout, rebuilt B2B
 * for Goh's
 * coaches/consultants audience and kept on-brand (black + gold):
 *   countdown bar → two-column [ hero + video + sections | sticky reg form ]
 *   → what you'll learn → authority quote → free bonuses → do-not-register.
 * Registration is a real WebinarJam embed (hash 3g03oobn), styled via its
 * URL params and mounted inside .wj-embed-wrapper (a raw <script> in JSX
 * never executes, so the script is appended to the wrapper at mount).
 *
 * WebinarJam config note: set the webinar's post-registration Thank-You
 * redirect to /funnel/webinar/confirm so registrants land on our confirmation
 * page. Update WEBINAR below to match the live session date/time. */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { captureTracking } from '@/lib/tracking';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom, fireStandard, fireLead } from '@/lib/pixel-tracker';

/* Flip to the custom on-brand form once the WebinarJam API creds are wired
 * (NEXT_PUBLIC_WEBINAR_CUSTOM_FORM=1). Until then the embed stays live so
 * registration never breaks. */
const CUSTOM_FORM = process.env.NEXT_PUBLIC_WEBINAR_CUSTOM_FORM === '1';
const PRIVACY_URL = 'https://gohconsulting.app/privacy';
const TERMS_URL = 'https://gohconsulting.app/terms';
const SMS_SENDER = 'Goh Consulting';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const PANEL = '#101010';
const LINE = '#1c1c1c';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

/* ── Session config — keep in sync with the WebinarJam session ── */
const WEBINAR = {
  hash: '3g03oobn',
  atISO: '2026-08-28T16:00:00-04:00', // countdown target
  label: 'Thu, Aug 28 · Live on Zoom · 4:00 PM ET',
  dateLine: 'Thu, Aug 28 · 4:00 PM ET / 1:00 PM PT',
};
const WJ_SRC = `https://event.webinarjam.com/register/${WEBINAR.hash}/embed-form?formButtonText=Reserve%20My%20Spot&formAccentColor=%23141414&formAccentOpacity=0.95&formBgColor=%23F7F3E8&formBgOpacity=1`;

const VIDEO_ELEMENT_ID = 'vidalytics_embed__opKp90miYcFxQbC';

// Each item can carry a side image. Drop the file in /public/webinar/ and set
// `image` to its path — the card renders it in a horizontal-scroll box so wide
// diagrams can be scrolled left→right.
const LEARN: { title: string; body: string; image?: string }[] = [
  { title: "The real reason your content isn't converting", body: "It's not what you think — not your hooks, not your posting frequency. We'll show you the actual gap, live.", image: '/webinar/learn-brand.png' },
  { title: 'The exact team structure that removes you as the bottleneck', body: 'The three-role chain — creative director, senior editor, junior editor — so content ships at a high level on every post without you touching every edit.', image: '/webinar/learn-team.png' },
  { title: "How to package your content so you're the obvious choice", body: "Positioning that makes you the number one option in your market — not one of five that all look the same.", image: '/webinar/learn-packaging.png' },
];

const BONUSES: { n: string; title: string; body: string; image?: string }[] = [
  // Drop the images in /public/webinar/ and set `image` to the path
  // (e.g. '/webinar/bonus-1.png') — the card renders them automatically.
  { n: '1', title: 'The Full Training Slide Deck', body: 'The complete reference deck from the training — Structure, System, Signal — so you can revisit the framework and the team org chart anytime, not just remember bits of it after the call ends.', image: '/webinar/bonus-slide-deck.png' },
  { n: '2', title: 'The $408K/Mo System Teardown', body: 'The actual slide-by-slide breakdown of the content system running our own $408K a month business. Org chart, feedback structure, and positioning shift included — not a summary, the real thing.', image: '/webinar/problems-grid.png' },
];

/* ── Live countdown to the session ── */
function useCountdown(targetISO: string) {
  const [left, setLeft] = useState({ d: 0, h: 0, m: 0, s: 0, done: false });
  useEffect(() => {
    const target = new Date(targetISO).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setLeft({ d: 0, h: 0, m: 0, s: 0, done: true }); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft({ d, h, m, s, done: false });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetISO]);
  return left;
}

function CountdownBar() {
  const t = useCountdown(WEBINAR.atISO);
  const seg = (v: number, l: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <b style={{ fontFamily: F, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{String(v).padStart(2, '0')}</b>
      <span style={{ fontFamily: F, fontSize: 11, color: '#888', letterSpacing: '0.04em' }}>{l}</span>
    </span>
  );
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 60, background: '#000',
      borderBottom: `1px solid ${LINE}`, padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: Y }}>
        {t.done ? 'Registration closing' : 'Registration closes in'}
      </span>
      <span style={{ display: 'inline-flex', gap: 14, fontSize: 15 }}>
        {seg(t.d, 'd')}<span style={{ color: '#333' }}>:</span>
        {seg(t.h, 'h')}<span style={{ color: '#333' }}>:</span>
        {seg(t.m, 'm')}<span style={{ color: '#333' }}>:</span>
        {seg(t.s, 's')}
      </span>
    </div>
  );
}

/* Custom on-brand registration form — posts to /api/webinar/register, which
 * registers the person through the WebinarJam API server-side, then routes to
 * our confirmation page. Matches the dark, two-column reference layout. */
function CustomRegisterForm() {
  const router = useRouter();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const label: React.CSSProperties = { fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a9a9a', marginBottom: 8, display: 'block' };
  const input: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '14px 16px', color: '#fff', fontSize: 16, fontFamily: F, outline: 'none' };

  function set(k: keyof typeof f) { return (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!f.firstName.trim()) { setErr('Please enter your first name.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr('Please enter a valid email address.'); return; }
    setSubmitting(true);
    trackEvent('webinar', 'webinar_register_submit', { email: f.email.trim() });
    fireCustom('webinar_register_submit');
    try {
      const res = await fetch('/api/webinar/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setErr(data.error || 'Registration failed. Please try again.'); setSubmitting(false); return; }
      fireLead({ email: f.email.trim(), contentName: 'Media Team Webinar' });
      router.push(data.redirect || '/funnel/webinar/confirm');
    } catch {
      setErr('Registration failed. Please try again.'); setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label}>First name</label>
          <input style={input} value={f.firstName} onChange={set('firstName')} placeholder="Jane" autoComplete="given-name" />
        </div>
        <div>
          <label style={label}>Last name</label>
          <input style={input} value={f.lastName} onChange={set('lastName')} placeholder="Smith" autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label style={label}>Email</label>
        <input style={input} type="email" inputMode="email" value={f.email} onChange={set('email')} placeholder="jane@example.com" autoComplete="email" />
      </div>
      <div>
        <label style={label}>Phone number</label>
        <input style={input} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" autoComplete="tel" />
      </div>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: Y, flexShrink: 0, cursor: 'pointer' }} />
        <span style={{ fontFamily: F, fontSize: 12.5, color: '#9a9a9a', lineHeight: 1.55 }}>
          I consent to receive automated marketing and promotional messages (including SMS) from {SMS_SENDER} at the number provided. Consent isn&apos;t a condition of purchase; message frequency varies and message &amp; data rates may apply. Reply STOP to unsubscribe. View our{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#bbb', textDecoration: 'underline' }}>Privacy Policy</a> and{' '}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#bbb', textDecoration: 'underline' }}>Terms of Service</a>.
        </span>
      </label>

      {err && <p style={{ fontFamily: F, fontSize: 13, color: '#ff6b6b', margin: 0 }}>{err}</p>}

      <button type="submit" disabled={submitting} style={{
        width: '100%', padding: '17px 24px', border: 'none', borderRadius: 12,
        background: submitting ? '#3a3527' : `linear-gradient(90deg, ${Y}, #e9d27e)`,
        color: '#111', fontFamily: F, fontSize: 17, fontWeight: 900, letterSpacing: '0.01em',
        cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.8 : 1,
      }}>
        {submitting ? 'Reserving your spot…' : 'Register Now →'}
      </button>
    </form>
  );
}

export default function WebinarRegisterPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const t = captureTracking();
    trackEvent('webinar', 'webinar_register_view', { ...t });
    fireCustom('webinar_register_view', { ...t });
    fireStandard('ViewContent', { content_name: 'Media Team Webinar — Register', content_type: 'webinar' });

    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }

    // WebinarJam registration embed — appended inside the wrapper (only when
    // the custom form is off; otherwise our own form handles registration).
    if (!CUSTOM_FORM && wrapRef.current && !wrapRef.current.querySelector('script[data-wj]')) {
      const s = document.createElement('script');
      s.src = WJ_SRC; s.async = true; s.setAttribute('data-wj', '1');
      wrapRef.current.appendChild(s);
    }

    // Masterclass promo video (Vidalytics — same loader used on the VSL page).
    document.querySelectorAll('script[data-vidal="webinar"]').forEach(el => el.remove());
    const vs = document.createElement('script');
    vs.type = 'text/javascript'; vs.setAttribute('data-vidal', 'webinar');
    vs.innerHTML = `(function (v, i, d, a, l, y, t, c, s) {
      y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}
      var vl='Loader',vli=v[y][vl],vsl=v[c][vl+'Script'],vlf=v[c][vl+'Loaded'],ve='Embed';
      if(!vsl){vsl=function(u,cb){if(t){cb();return;}s=i.createElement('script');s.type='text/javascript';s.async=1;s.src=u;
        if(s.readyState){s.onreadystatechange=function(){if(s.readyState==='loaded'||s.readyState=='complete'){s.onreadystatechange=null;vlf=1;cb();}};}
        else{s.onload=function(){vlf=1;cb();};}i.getElementsByTagName('head')[0].appendChild(s);};v[c][vl+'Script']=vsl;}
      vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}
        vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
    })(window,document,'Vidalytics','${VIDEO_ELEMENT_ID}','https://fast.vidalytics.com/embeds/Dyp2a1Oi/_opKp90miYcFxQbC/');`;
    document.body.appendChild(vs);
  }, []);

  function scrollToForm() {
    trackEvent('webinar', 'webinar_register_click');
    fireCustom('webinar_register_click');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflowX: 'clip' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;}
        html{scroll-behavior:smooth;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        .wj-embed-wrapper{width:100%;}
        .wj-embed-wrapper iframe{width:100%!important;border:none;display:block;border-radius:10px;}
        /* Two-column layout: form sits beside the hero on desktop, then the
           content flows full-width beneath both so there's no tall empty
           column under the (short) sticky form. On mobile it all stacks. */
        .wb-grid{display:grid;grid-template-columns:1fr;grid-template-areas:"hero" "form" "content";gap:0 56px;max-width:1600px;margin:0 auto;padding:0 clamp(28px,6vw,88px);}
        @media(min-width:940px){.wb-grid{grid-template-columns:minmax(0,1fr) 440px;grid-template-areas:"hero form" "content form";}}
        .wb-hero{grid-area:hero;}
        .wb-form{grid-area:form;}
        .wb-content{grid-area:content;}
        .wb-form-inner{position:static;}
        @media(min-width:940px){.wb-form-inner{position:sticky;top:74px;}}
        .wb-learn{display:grid;grid-template-columns:1fr;gap:18px;}
        .wb-bonus{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:680px){.wb-bonus{grid-template-columns:1fr 1fr;}}
        /* Glass pill with a gold neon glow behind it. */
        .wb-glass{position:relative;background:rgba(255,255,255,0.045);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(245,230,163,0.22);border-radius:18px;box-shadow:0 0 34px -8px rgba(245,230,163,0.22), inset 0 1px 0 rgba(255,255,255,0.06);transition:border-color .25s ease, box-shadow .25s ease, transform .25s ease;}
        .wb-glass::after{content:"";position:absolute;left:50%;top:-14px;transform:translateX(-50%);width:70%;height:40px;background:radial-gradient(ellipse at center, rgba(245,230,163,0.28), transparent 70%);filter:blur(14px);pointer-events:none;z-index:0;opacity:.8;}
        .wb-glass > *{position:relative;z-index:1;}
        .wb-glass:hover{border-color:rgba(245,230,163,0.5);box-shadow:0 0 50px -8px rgba(245,230,163,0.42), inset 0 1px 0 rgba(255,255,255,0.09);transform:translateY(-2px);}
      `}</style>

      <CountdownBar />

      <div className="wb-grid">
        {/* ── Hero (left) ── */}
        <header className="wb-hero" style={{ paddingTop: 'clamp(28px,5vw,48px)' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 22,
            background: 'rgba(245,230,163,0.06)', border: `1px solid ${Y}33`, borderRadius: 40, padding: '7px 16px',
          }}>
            <span style={{ position: 'relative', width: 8, height: 8 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#ff4d4d' }} />
            </span>
            <span style={{ fontFamily: F, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#eee' }}>{WEBINAR.label}</span>
          </div>
          <div style={{ fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: Y, marginBottom: 14 }}>
            For Coaches &amp; Consultants
          </div>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(24px,3.1vw,38px)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>
            Add <span style={{ color: Y }}>$100K</span> To Your Business Running The Same System That Pulls In <span style={{ color: Y }}>$408K A Month</span> For Us, Organically.
          </h1>
          <p style={{ fontFamily: F, fontSize: 'clamp(14px,1.5vw,16.5px)', fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: 1.55, marginBottom: 18, maxWidth: 500 }}>
            Register for the free masterclass and we&apos;ll show you exactly what talent to train and place into your business, so your content finally feels frictionless and predictable.
          </p>

          {/* Promo video — fills the hero column width for a bigger VSL */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${LINE}`, marginBottom: 8 }}>
            <div id={VIDEO_ELEMENT_ID} style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }} />
          </div>
        </header>

        {/* ── Registration form (right, sticky) ── */}
        <aside className="wb-form">
          <div className="wb-form-inner" style={{ paddingTop: 'clamp(28px,5vw,48px)' }}>
            <div style={{ background: PANEL, border: `1.5px solid ${Y}44`, borderRadius: 18, padding: 'clamp(18px,2.4vw,26px)' }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: F, fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  Save Your <span style={{ color: Y }}>Free Spot</span>
                </div>
                <p style={{ fontFamily: F, fontSize: 13, color: '#888' }}>{WEBINAR.dateLine}</p>
              </div>
              {CUSTOM_FORM ? (
                <CustomRegisterForm />
              ) : (
                <>
                  <div ref={wrapRef} className="wj-embed-wrapper" data-webinar-hash={WEBINAR.hash} />
                  <noscript>
                    <p style={{ fontFamily: F, fontSize: 13, color: '#888', textAlign: 'center' }}>
                      Enable JavaScript to register, or{' '}
                      <a href={`https://event.webinarjam.com/register/${WEBINAR.hash}`} style={{ color: Y }}>register here</a>.
                    </p>
                  </noscript>
                </>
              )}
              <p style={{ fontFamily: F, fontSize: 12, color: '#666', textAlign: 'center', marginTop: 14 }}>
                No credit card required. 100% free training.
              </p>
            </div>
          </div>
        </aside>

        {/* ── Content (left, below hero) ── */}
        <main className="wb-content" style={{ paddingBottom: 80 }}>
          {/* What you'll learn */}
          <section style={{ paddingTop: 'clamp(40px,6vw,64px)' }}>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, color: '#fff', marginBottom: 28 }}>
              What You&apos;ll Learn
            </h2>
            <div className="wb-learn">
              {LEARN.map((item, i) => (
                <div key={i} className="wb-glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '22px 24px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16, flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'rgba(245,230,163,0.14)', border: `1px solid ${Y}66`, boxShadow: `0 0 16px -4px ${Y}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: 13, fontWeight: 800, color: Y }}>
                      {i + 1}
                    </div>
                    <div>
                      <h3 style={{ fontFamily: F, fontSize: 16.5, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 6 }}>{item.title}</h3>
                      <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{item.body}</p>
                    </div>
                  </div>
                  {item.image && (
                    /* Horizontal-scroll box: image sits at a fixed height so wide
                       diagrams overflow and scroll left→right instead of shrinking. */
                    <div style={{ flex: '1 1 360px', minWidth: 0, maxWidth: '100%', overflowX: 'auto', borderRadius: 12, border: `1px solid ${Y}33`, background: 'rgba(0,0,0,0.25)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image} alt={item.title} style={{ display: 'block', height: 220, width: 'auto', maxWidth: 'none', margin: '0 auto' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Authority quote — centered, compact, decorative */}
          <section style={{ paddingTop: 'clamp(36px,5vw,56px)' }}>
            <blockquote className="wb-glass" style={{ margin: '0 auto', maxWidth: 720, padding: 'clamp(28px,3.5vw,44px) clamp(24px,3vw,40px)', textAlign: 'center' }}>
              <div aria-hidden style={{ fontFamily: 'Georgia, serif', fontSize: 56, lineHeight: 0.6, color: Y, opacity: 0.5, marginBottom: 14 }}>&ldquo;</div>
              <p style={{ fontFamily: F, fontSize: 'clamp(15px,1.6vw,18px)', fontWeight: 500, color: '#f4f1e8', lineHeight: 1.6, fontStyle: 'italic', margin: '0 auto 18px', maxWidth: 600 }}>
                The content game for coaches and consultants just changed — again. The ones who build a real brand and a real content system now are the ones who&apos;ll own their market in the next 12–24 months. This masterclass shows you exactly how.
              </p>
              <cite style={{ fontFamily: F, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: Y, fontStyle: 'normal' }}>SooWei Goh · Goh Consulting</cite>
            </blockquote>
          </section>

          {/* Free bonuses */}
          <section style={{ paddingTop: 'clamp(40px,6vw,64px)' }}>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Attend the Training &amp; Get These <span style={{ color: Y }}>Free Bonuses</span>
            </h2>
            <p style={{ fontFamily: F, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#777', marginBottom: 26 }}>
              Included when you apply today
            </p>
            <div className="wb-bonus">
              {BONUSES.map((b) => (
                <div key={b.n} className="wb-glass" style={{ padding: '24px 24px', overflow: 'hidden' }}>
                  {b.image && (
                    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${Y}33`, background: 'rgba(0,0,0,0.25)', marginBottom: 16 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image} alt={b.title} style={{ display: 'block', height: 200, width: 'auto', maxWidth: 'none', margin: '0 auto' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(245,230,163,0.14)', border: `1px solid ${Y}66`, boxShadow: `0 0 14px -4px ${Y}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: 12, fontWeight: 800, color: Y }}>{b.n}</span>
                    <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: Y }}>Bonus {b.n}</span>
                  </div>
                  <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{b.title}</h3>
                  <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{b.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Who this training is built for */}
          <section style={{ paddingTop: 'clamp(40px,6vw,64px)' }}>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, color: '#fff', marginBottom: 20 }}>
              Who This Training Is <span style={{ color: Y }}>Built For</span>
            </h2>
            <div className="wb-glass" style={{ padding: 'clamp(24px,3vw,32px)' }}>
              <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,18px)', color: '#f4f1e8', lineHeight: 1.6, marginBottom: 22 }}>
                Built for coaches and consultants who are <strong style={{ color: Y, fontWeight: 700 }}>ready to scale past what they can build alone.</strong>
              </p>
              <div style={{ display: 'grid', gap: 12, marginBottom: 22 }}>
                {[
                  'You already have content going out consistently',
                  'You have an editor or some kind of system in place',
                  "You're ready to grow past being the bottleneck",
                ].map((line) => (
                  <div key={line} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(245,230,163,0.14)', border: `1px solid ${Y}66`, boxShadow: `0 0 12px -3px ${Y}88`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: Y, fontSize: 12, fontWeight: 800 }}>✓</span>
                    <span style={{ fontFamily: F, fontSize: 15.5, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>{line}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontFamily: F, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                Still doing everything yourself with no system or editor yet? Bookmark this — it&apos;ll be exactly as useful once you&apos;re there, just not the right session yet.
              </p>
            </div>
          </section>

          {/* Mobile-friendly closing CTA (scrolls to the form) */}
          <section style={{ paddingTop: 'clamp(40px,6vw,64px)', textAlign: 'center' }}>
            <p style={{ fontFamily: F, fontSize: 'clamp(18px,2.4vw,24px)', fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: 18 }}>
              You&apos;re smart enough to see it: a <span style={{ color: Y }}>proven</span> system is the <span style={{ color: Y }}>best ROI</span> you&apos;ll make all year. This is us providing real value up front — we have everything to prove, you have <span style={{ color: Y }}>nothing to lose</span>. See you on the call.
            </p>
            <button type="button" onClick={scrollToForm} style={{
              padding: '15px 38px', background: Y, border: 'none', borderRadius: 50,
              color: '#111', fontFamily: F, fontSize: 16, fontWeight: 800, letterSpacing: '0.02em', cursor: 'pointer',
            }}>
              Reserve My Free Spot →
            </button>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${LINE}`, padding: '28px 32px', textAlign: 'center', marginTop: 20 }}>
        <p style={{ fontFamily: F, fontSize: 12, color: '#444', lineHeight: 1.8, maxWidth: 700, margin: '0 auto' }}>
          This website is not part of the YouTube, Google, or Facebook website; Google Inc or Facebook Inc. Also, this website is{' '}
          <strong style={{ color: '#555' }}>NOT</strong> endorsed by YouTube, Google or Facebook in any way. FACEBOOK is a trademark of FACEBOOK Inc. YOUTUBE is a trademark of GOOGLE Inc.
        </p>
      </footer>
    </div>
  );
}
