'use client';

/* Post-booking "confirm your call" page shared across the two ad categories
 * (under $100k/mo and $100k+/mo). Someone lands here right after booking — the
 * call isn't truly confirmed until they (1) watch the confirmation video and
 * (2) show up prepared, so this page reframes the booking as "not confirmed
 * yet" and walks them through the two steps. Visually it mirrors the existing
 * ads funnel body (/funnel/ads/<segment>): same Goh logo header, gold eyebrow,
 * Inter type, Vidalytics video, and the same YouTube case-study grid at the
 * bottom. Only the copy differs, so both categories render from one component
 * and just pass their category in. */

import { useEffect } from 'react';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom } from '@/lib/pixel-tracker';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

// One post-booking page per funnel, individually tracked in funnel analytics.
export type ConfirmFunnel = 'under-100k' | 'over-100k-ads' | 'over-100k-no-ads' | 'vsl';

const EYEBROW: Record<ConfirmFunnel, string> = {
  'under-100k':        'Coaches & Consultants Under $100K/Mo',
  'vsl':               'Coaches & Consultants Under $100K/Mo', // mirrors under-100k
  'over-100k-ads':     'Coaches & Consultants $100K/Mo Or More',
  'over-100k-no-ads':  'Coaches & Consultants $100K/Mo Or More',
};

/* Main confirmation video (given by client). */
const CONFIRM_VIDEO_ID = 'CcOcY8mTc91ZxaT2';

/* FAQ videos — Vidalytics embeds pulled from "Pbp Videos Goh - Embed codes.pdf"
 * (page 1 = title, page 2 = embed, repeating). */
const FAQ_VIDEOS: { q: string; id: string }[] = [
  { q: 'Why Should I Prioritize Organic Vs Ads?',            id: 'AKxWvES1a5Z9ZdvK' },
  { q: 'What Should Be My Mindset For The Call?',            id: 'eigIc4qg1fMfbMtz' },
  { q: 'What Does The Process Look Like After Joining?',     id: '7T9TTdz4xJxnPAL1' },
  { q: "What If I'm Not Satisfied With The Program?",        id: 'SRFb0jtdNV35Aphg' },
  { q: 'What Coaches Do I Get Access To?',                   id: 'XgjgdwsxmnI97dyF' },
  { q: "What If I Don't Have The Personality For Content?",  id: 'ATBQc25MVI0w8X5B' },
  { q: 'Is The Program Community Active?',                   id: 'va5iS48FImoVWkNz' },
  { q: 'How Long Does It Take To Get Results?',              id: 'oKtAXOyLRceNnTcx' },
];

/* Prep-for-the-call checklist (from the "Prepare For Your Call By:" block). */
const PREP = [
  { title: 'Watching The Video Above:', body: 'Understand Our Process And Funnel So We Save Time On The Call' },
  { title: 'Be In A Quiet Place:',      body: 'Take This Call Where You Can Turn On Your Camera And Have A Conversation' },
  { title: 'Check Our Client Stories:', body: "Watch A Videos On How We've Scaled Up Our Client's Businesses" },
];

/* Duplicated from the ads funnel body (SegmentFunnel CASE_STUDIES) — the same
 * YouTube case studies shown on /funnel/ads/under-100k. */
const CASE_STUDIES: { pre: string; hi: string; id: string; t: number; list?: string }[] = [
  { pre: 'Maya & Joey Scaled From ', hi: '$20k To $224k/Mo',           id: 'ZX3lzkRsAsI', t: 0   },
  { pre: 'Hans Scaled From ',        hi: '$70k To $165k/Mo',            id: 'qPl01-EUDdg', t: 236 },
  { pre: 'Alessio & Bryan Scaled From ', hi: '$40k To $154k/Mo',       id: 'sm-3eXqZwW4', t: 0   },
  { pre: 'Dario Scaled From ',       hi: '$45k To $109k/Mo In 30 Days', id: 'LfjdBDlr8Ik', t: 0   },
  { pre: 'Andres Scaled From ',      hi: '$30k To $102k',               id: '95LFQWGhOGE', t: 0   },
  { pre: 'Josh Scaled His Business From ', hi: '$500 To $102k/Mo',     id: 'wiRrc92alaA', t: 0   },
  { pre: 'Hoku Scaled His Business From ', hi: '$20k To $85k/Mo',      id: 'b1OP4mJUGLc', t: 99  },
  { pre: 'Andrew Scaled To ',        hi: '$151k/Mo',                    id: 'xodGOrFW-kI', t: 0, list: 'PLLp77Kdh49IGcL0DFPv1qxacP1TTEyYOs' },
];

function GohLogo() {
  return <img src="/onboarding/goh-logo.png" alt="VTC" style={{ width: 104, height: 104, objectFit: 'contain' }} />;
}

/* Renders a Vidalytics embed the same way the ads funnel does — drop the
 * target div, then inject the standard loader IIFE for this embed id. The
 * loader dedupes its own scripts on window, so multiple embeds on one page
 * each just run their own player against their own element id. */
function VidalyticsEmbed({ embedId, style }: { embedId: string; style?: React.CSSProperties }) {
  const elementId = `vidalytics_embed_${embedId}`;
  useEffect(() => {
    /* Re-run on every mount so the embed renders when this page is reached via
     * client-side navigation (the post-booking redirect), not only on a hard
     * refresh. Drop any stale tag for this embed first, then re-inject — the
     * loader dedupes its own scripts and just re-runs against the new container. */
    document.querySelectorAll(`script[data-vidal="${embedId}"]`).forEach(el => el.remove());
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.setAttribute('data-vidal', embedId);
    s.innerHTML = `(function (v, i, d, a, l, y, t, c, s) {
      y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}
      var vl='Loader',vli=v[y][vl],vsl=v[c][vl+'Script'],vlf=v[c][vl+'Loaded'],ve='Embed';
      if(!vsl){vsl=function(u,cb){if(t){cb();return;}s=i.createElement('script');s.type='text/javascript';s.async=1;s.src=u;
        if(s.readyState){s.onreadystatechange=function(){if(s.readyState==='loaded'||s.readyState=='complete'){s.onreadystatechange=null;vlf=1;cb();}};}
        else{s.onload=function(){vlf=1;cb();};}i.getElementsByTagName('head')[0].appendChild(s);};v[c][vl+'Script']=vsl;}
      vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}
        vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
    })(window,document,'Vidalytics','${elementId}','https://fast.vidalytics.com/embeds/Dyp2a1Oi/${embedId}/');`;
    document.body.appendChild(s);
  }, [embedId]);

  return <div id={elementId} style={{ width: '100%', position: 'relative', paddingTop: '56.25%', ...style }} />;
}

export default function ConfirmCall({ funnel }: { funnel: ConfirmFunnel }) {
  useEffect(() => {
    window.scrollTo(0, 0);

    // Per-funnel view event so funnel analytics tracks each post-booking page separately.
    trackEvent(funnel, `${funnel}_call_confirm_view`);
    fireCustom(`${funnel}_call_confirm_view`);

    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        iframe{display:block;}
        /* Subheading: single line once there's room for it, wraps on phones. */
        .cc-sub{white-space:normal;}
        @media (min-width:680px){.cc-sub{white-space:nowrap;}}
        /* Video grids: 1 per row on phones, 2 per row (larger) from tablet up. */
        .cc-vgrid{display:grid;grid-template-columns:1fr;gap:28px;}
        @media (min-width:760px){.cc-vgrid{grid-template-columns:1fr 1fr;gap:40px;}}
      `}</style>

      {/* ── Header ── */}
      <section style={{ textAlign: 'center', padding: '2px 24px 32px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}><GohLogo /></div>
        <div style={{ fontFamily: F, fontSize: 'clamp(13px,3.2vw,18px)', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: Y, marginBottom: 20 }}>
          {EYEBROW[funnel]}
        </div>
        <h1 style={{ fontFamily: F, fontSize: 'clamp(28px,6vw,48px)', fontWeight: 800, color: '#fff', lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.01em' }}>
          Your Call is <span style={{ color: Y }}>Not Confirmed</span>
        </h1>
        <p className="cc-sub" style={{ fontFamily: F, fontSize: 'clamp(15px,2vw,20px)', fontWeight: 500, color: 'rgba(255,255,255,0.62)', margin: '0 auto', lineHeight: 1.55 }}>
          Make sure to do these 2 steps so you can confirm your call with us
        </p>
      </section>

      {/* ── Confirmation video ── */}
      <div style={{ maxWidth: 900, margin: '0 auto 8px', padding: '0 24px' }}>
        <VidalyticsEmbed embedId={CONFIRM_VIDEO_ID} />
      </div>

      {/* ── Prepare For Your Call By: ── */}
      <section style={{ padding: '52px 24px 56px', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: F, fontSize: 'clamp(26px,3.5vw,38px)', fontWeight: 800, color: Y,
          textDecoration: 'underline', textUnderlineOffset: '6px', marginBottom: 36, lineHeight: 1.2,
        }}>
          Prepare For Your Call By:
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {PREP.map((p) => (
            <div key={p.title}>
              <div style={{ fontFamily: F, fontSize: 'clamp(17px,2vw,21px)', fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                {p.title}
              </div>
              <div style={{ fontFamily: F, fontSize: 'clamp(15px,1.8vw,18px)', fontWeight: 500, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, maxWidth: 640, margin: '0 auto' }}>
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ videos ── */}
      <section style={{ padding: '0 clamp(16px,4vw,32px) 64px', maxWidth: 1280, margin: '0 auto' }}>
        <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 44 }}>
          Frequently Asked Questions<span style={{ color: Y }}>...</span>
        </h2>
        <div className="cc-vgrid">
          {FAQ_VIDEOS.map((v) => (
            <div key={v.id}>
              <p style={{ fontFamily: F, fontSize: 'clamp(16px,1.8vw,19px)', fontWeight: 600, color: '#fff', marginBottom: 12, lineHeight: 1.45, minHeight: '2.9em', textAlign: 'center' }}>
                {v.q}
              </p>
              <VidalyticsEmbed embedId={v.id} style={{ borderRadius: 10, overflow: 'hidden', background: '#111' }} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Client case studies (duplicated from /funnel/ads/under-100k) ── */}
      <section style={{ padding: '0 clamp(16px,4vw,32px) 60px', maxWidth: 1280, margin: '0 auto' }}>
        <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 800, color: Y, textAlign: 'center', marginBottom: 44 }}>
          How We&apos;ve Scaled Our Clients
        </h2>
        <div className="cc-vgrid">
          {CASE_STUDIES.map((cs, i) => (
            <div key={i}>
              <p style={{ fontFamily: F, fontSize: 'clamp(16px,1.8vw,19px)', fontWeight: 500, color: '#fff', marginBottom: 12, lineHeight: 1.45, minHeight: '2.9em', textAlign: 'center' }}>
                {cs.pre}<strong style={{ color: Y }}>{cs.hi}</strong>
              </p>
              <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${cs.id}${cs.t ? `?start=${cs.t}&` : '?'}${cs.list ? `list=${cs.list}&` : ''}rel=0&modestbranding=1&playsinline=1`}
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
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '28px clamp(16px,4vw,32px)', textAlign: 'center' }}>
        <p style={{ fontFamily: F, fontSize: 12, color: '#444', lineHeight: 1.8, maxWidth: 700, margin: '0 auto' }}>
          This website is not part of the YouTube, Google, or Facebook website; Google Inc or Facebook Inc. Also, this website is{' '}
          <strong style={{ color: '#555' }}>NOT</strong> endorsed by YouTube, Google or Facebook in any way. FACEBOOK is a trademark of FACEBOOK Inc. YOUTUBE is a trademark of GOOGLE Inc.
        </p>
      </footer>
    </div>
  );
}
