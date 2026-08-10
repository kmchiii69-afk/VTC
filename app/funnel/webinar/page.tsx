'use client';

/* Webinar preview page — step 1 of the funnel (/funnel/webinar).
 * Centered VSL-preview layout: logo → headline → subhead → preview video →
 * "Join the Next Live Class" CTA that routes to the registration page
 * (/funnel/webinar/register). Kept on-brand (black + gold). */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { captureTracking } from '@/lib/tracking';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom, fireStandard } from '@/lib/pixel-tracker';
const Y = '#F5E6A3';
const BG = '#0a0a0a';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
const VIDEO_ELEMENT_ID = 'vidalytics_embed__opKp90miYcFxQbC';

// Client results — headline + what we did (how) + video. `points` can carry an
// optional image path per bullet later; for now they're text-only.
type Testimonial = { name: string; headline: string; youtube: string; points: { text: string; image?: string }[] };
// Ordered by how much monthly revenue we added, highest first.
const TESTIMONIALS: Testimonial[] = [
  { name: 'Maya & Joey', youtube: 'ZX3lzkRsAsI',
    headline: 'How we added $204k/month to Maya & Joey’s business by optimising their ICP',
    points: [
      { text: 'Optimised their content positioning to attract a more sophisticated ICP' },
      { text: 'Client delivery systems that don’t break at scale' },
      { text: 'Rebuilt their sales framework so they could charge high ticket' },
    ] },
  { name: 'Alessio & Bryan', youtube: 'sm-3eXqZwW4',
    headline: 'How we added $117k/month to Alessio & Bryan’s business by restructuring their offer and pricing',
    points: [
      { text: 'Killed the low-ticket $4k offer and repositioned premium — AOV went from $3k to $11k with no change to marketing or call volume' },
      { text: 'Fixed the appointment-setting gap: a flood of leads but almost no calls booked (they credit this for 70–80% of the growth)' },
      { text: 'Split founder responsibilities by strength — one owns sales, one owns ops/fulfillment' },
    ] },
  { name: 'Wyatt', youtube: 'STbx_jgCwnU',
    headline: 'How we added $305k in 90 days to Wyatt’s business with our organic content systems',
    points: [
      { text: 'Top-of-funnel content that broke him out of a niche audience' },
      { text: 'Back-end infrastructure that let him raise his price from £5k to £25k', image: '/webinar/t-wyatt-payments.png' },
      { text: 'A repeatable visual identity and predictable content-format system', image: '/webinar/t-wyatt-visuals.png' },
    ] },
  { name: 'Yusuf', youtube: '8mM-FkpelUA',
    headline: 'How we added $100k/month to Yusuf’s business by improving his lead quality with organic content',
    points: [
      { text: 'Our DM-setting process that filters out low-quality leads', image: '/webinar/t-yusuf-dm.png' },
      { text: 'Story-sequence frameworks that convert eyeballs into prospects' },
      { text: 'An organic content engine that fills the pipeline without ads', image: '/webinar/t-yusuf-tof.png' },
    ] },
  { name: 'Emma', youtube: 'SX-IySaK4SE',
    headline: 'How we added $95k/month to Emma’s business by optimising her offer',
    points: [
      { text: 'A restructured offer sheet she can pitch straight from the DMs', image: '/webinar/t-emma-offer.png' },
      { text: 'A client ascension path that turns existing buyers into 5-figure deals' },
      { text: 'An organic content system that pre-handles objections so she can charge high ticket' },
    ] },
  { name: 'Hans', youtube: 'qPl01-EUDdg',
    headline: 'How we added $95k/month to Hans’s business by installing our client fulfillment system',
    points: [
      { text: 'Built an A-player team structure that runs without him', image: '/webinar/learn-team.png' },
      { text: 'Client delivery systems that don’t break at scale' },
      { text: 'Organic that attracts a sophisticated ICP who are easier to serve', image: '/webinar/t-hans-identity.png' },
    ] },
  { name: 'Gabe', youtube: 'bP-VRaJslfg',
    headline: 'How we added $94k/month to Gabe’s business by installing our client fulfillment system',
    points: [
      { text: 'Engineered his full client journey into a step-by-step delivery system' },
      { text: 'Frameworks and AI tools that remove him from fulfillment' },
      { text: 'Built an A-player team structure that runs without him', image: '/webinar/learn-team.png' },
    ] },
  { name: 'Andrew', youtube: 'xodGOrFW-kI',
    headline: 'How we added $76k/month to Andrew’s business by installing a setter manager',
    points: [
      { text: 'Hired a setter manager — the single lever he credits for the jump' },
      { text: 'Replaced an underperforming setter (on double-industry-standard commission) with an A-player' },
      { text: 'Reset his revenue benchmark through peer exposure — from a $40k goal to $63k collected in the final 8 days' },
    ] },
  { name: 'Andres', youtube: '95LFQWGhOGE',
    headline: 'How we added $70k/month to Andres’s business by rebuilding his standards and lead flow',
    points: [
      { text: 'Replaced a C-player setter he’d kept out of convenience with a competent A-player' },
      { text: 'Doubled down on organic — bottom-of-funnel pain-point content plus higher story volume, bringing in 10 leads a day' },
      { text: 'Ran a team-wide standards reset: goals, identity worksheets, and a shared target every hire was held to' },
    ] },
  { name: 'Dario', youtube: 'LfjdBDlr8Ik',
    headline: 'How we added $64k/month to Dario’s business by rebuilding his fulfillment',
    points: [
      { text: 'Rebuilt the full delivery structure — support cadence, 1:1 channels, a fast first-two-weeks win — driving a 60% ascension rate' },
      { text: 'Monetised the existing client base first: $40k in upsells and $26k in referrals' },
      { text: 'Ran free consulting calls off a single story: 4 closed at $9k PIF, $32k from one group-call idea' },
    ] },
];

function ytEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}

export default function WebinarPreviewPage() {
  const router = useRouter();

  useEffect(() => {
    window.scrollTo(0, 0);
    const t = captureTracking();
    trackEvent('webinar', 'webinar_view', { ...t });
    fireCustom('webinar_view', { ...t });
    fireStandard('ViewContent', { content_name: 'Media Team Webinar — Preview', content_type: 'webinar' });

    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }

    // Preview video (Vidalytics — same loader used on the VSL page).
    document.querySelectorAll('script[data-vidal="webinar-preview"]').forEach(el => el.remove());
    const vs = document.createElement('script');
    vs.type = 'text/javascript'; vs.setAttribute('data-vidal', 'webinar-preview');
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

  function joinLiveClass() {
    trackEvent('webinar', 'webinar_preview_cta_click');
    fireCustom('webinar_preview_cta_click');
    router.push('/funnel/webinar/register');
  }

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        iframe{display:block;}
        @keyframes wbpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
        @media(prefers-reduced-motion:reduce){.wb-cta{animation:none!important}}
        .wb-vgrid{display:grid;grid-template-columns:1fr;gap:24px;}
        @media(min-width:820px){.wb-vgrid{grid-template-columns:1fr 1fr;}}
      `}</style>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(32px,6vw,60px) clamp(20px,5vw,32px) 80px', textAlign: 'center' }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'clamp(24px,4vw,36px)' }}>
          <img src="/onboarding/goh-logo.png" alt="Goh Consulting" style={{ width: 92, height: 92, objectFit: 'contain' }} />
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: F, fontSize: 'clamp(28px,4.8vw,50px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fff', marginBottom: 18 }}>
          Add <span style={{ color: Y }}>$100K</span> To Your Business Running The Same System That Pulls In <span style={{ color: Y }}>$408K A Month</span> For Us, Organically.
        </h1>

        {/* Subhead */}
        <div style={{ maxWidth: 620, margin: '0 auto clamp(28px,4vw,40px)' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: F, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: Y, background: 'rgba(245,230,163,0.08)', border: `1px solid ${Y}33`,
            borderRadius: 40, padding: '7px 16px', marginBottom: 16,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: Y }} />
            60-Minute Masterclass
          </span>
          <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,20px)', fontWeight: 500, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>
            Watch the preview below, then grab your spot at the next live class.
          </p>
          <p style={{ fontFamily: F, fontSize: 'clamp(13px,1.6vw,15px)', color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, maxWidth: 620, margin: '16px auto 0' }}>
            Wyatt added <strong style={{ color: Y }}>$305K in 90 days</strong>. Maya and Joey added <strong style={{ color: Y }}>$204K a month</strong>. Andrew added <strong style={{ color: Y }}>$139K a month</strong>. All organic, no extra ad spend.
          </p>
        </div>

        {/* Preview video */}
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #1c1c1c', marginBottom: 'clamp(28px,4vw,40px)', boxShadow: '0 30px 80px -40px rgba(245,230,163,0.25)' }}>
          <div id={VIDEO_ELEMENT_ID} style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }} />
        </div>

        {/* CTA → registration */}
        <button type="button" onClick={joinLiveClass} className="wb-cta" style={{
          display: 'block', width: '100%', maxWidth: 560, margin: '0 auto',
          padding: '20px 28px', border: 'none', borderRadius: 16, cursor: 'pointer',
          background: `linear-gradient(90deg, ${Y}, #e9d27e)`, color: '#111',
          animation: 'wbpulse 2.8s ease-in-out infinite',
        }}>
          <span style={{ fontFamily: F, fontSize: 'clamp(18px,2.4vw,23px)', fontWeight: 900, letterSpacing: '-0.01em', display: 'block' }}>
            Join the Next Live Class
          </span>
          <span style={{ fontFamily: F, fontSize: 13.5, fontWeight: 600, color: 'rgba(17,17,17,0.72)', display: 'block', marginTop: 4 }}>
            Free 60-Minute Masterclass — Reserve Your Spot
          </span>
        </button>
        <p style={{ fontFamily: F, fontSize: 12.5, color: '#666', marginTop: 16 }}>
          No credit card required. 100% free training.
        </p>

        {/* Client testimonials — breaks out wider than the 900px main so the
           rich cards aren't scrunched. */}
        <section style={{ marginTop: 'clamp(64px,9vw,110px)', width: 'min(1240px, 94vw)', marginLeft: '50%', transform: 'translateX(-50%)' }}>
          <div style={{ fontFamily: F, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: Y, marginBottom: 10 }}>
            Real Client Results
          </div>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(24px,3.4vw,38px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 'clamp(32px,5vw,52px)' }}>
            Founders who ran this exact system
          </h2>
          <div className="wb-vgrid">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,230,163,0.16)', borderRadius: 16, padding: 'clamp(18px,2.4vw,24px)', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontFamily: F, fontSize: 'clamp(16px,1.5vw,18px)', fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: 14 }}>
                  {t.headline}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {t.points.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'rgba(245,230,163,0.14)', border: `1px solid ${Y}66`, color: Y, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>✓</span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <span style={{ fontFamily: F, fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{p.text}</span>
                        {p.image && (
                          <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${Y}33`, background: 'rgba(0,0,0,0.25)' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.image} alt="" style={{ display: 'block', height: 130, width: 'auto', maxWidth: 'none' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', background: '#111', border: '1px solid #1c1c1c', marginTop: 'auto' }}>
                  <iframe
                    src={ytEmbed(t.youtube)}
                    title={t.headline}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
