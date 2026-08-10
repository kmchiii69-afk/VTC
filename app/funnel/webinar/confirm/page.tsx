'use client';

/* Webinar confirmation / indoctrination page (/funnel/webinar/confirm).
 * Set this as the WebinarJam session's post-registration Thank-You redirect.
 * Structure mirrors the reference confirmation flow, B2B:
 *   registered banner → watch-ahead video → "we emailed your join link" →
 *   pre-masterclass prep (DM on IG) → what to expect → testimonial →
 *   live-only bonuses → closing. */

import { useEffect } from 'react';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom } from '@/lib/pixel-tracker';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const PANEL = '#101010';
const LINE = '#1c1c1c';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

const IG_URL = 'https://www.instagram.com/sooweigoh/';
const VIDEO_ELEMENT_ID = 'vidalytics_embed__opKp90miYcFxQbC';

const EXPECT = [
  'How to turn content into booked high-ticket sales calls — not just views',
  'The content team structure that takes you out of the bottleneck',
  'The feedback system that kills 15 rounds of revisions',
  'LIVE audit — we’ll pull up a few attendees’ brands live. Show up and you’re eligible.',
];

const LIVE_BONUSES: { n: string; title: string; value: string; body: string }[] = [
  { n: '1', title: 'The Full Training Slide Deck', value: '$197 value', body: 'The complete reference deck — Structure, System, Signal — so you can revisit the framework and the team org chart anytime, not just remember bits of it.' },
  { n: '2', title: 'The $408K/Mo System Teardown', value: '$297 value', body: 'The slide-by-slide breakdown of the content system running our own $408K a month business — org chart, feedback structure, and positioning shift included.' },
];

export default function WebinarConfirmPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
    trackEvent('webinar', 'webinar_confirm_view');
    fireCustom('webinar_confirm_view');

    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }

    document.querySelectorAll('script[data-vidal="webinar-confirm"]').forEach(el => el.remove());
    const vs = document.createElement('script');
    vs.type = 'text/javascript'; vs.setAttribute('data-vidal', 'webinar-confirm');
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

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: F, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{-webkit-font-smoothing:antialiased;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        .wc-bonus{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:680px){.wc-bonus{grid-template-columns:1fr 1fr;}}
      `}</style>

      {/* Registered banner */}
      <div style={{ background: `linear-gradient(90deg, ${Y}, #e9d27e)`, padding: '12px 16px', textAlign: 'center' }}>
        <span style={{ fontFamily: F, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#111' }}>
          ✓ YOU&apos;RE REGISTERED — CHECK YOUR INBOX FOR YOUR JOIN LINK
        </span>
      </div>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(36px,6vw,64px) clamp(20px,5vw,40px) 100px' }}>
        {/* Registered + status */}
        <section style={{ textAlign: 'center', marginBottom: 'clamp(32px,5vw,48px)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: Y, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 28, color: '#111', boxShadow: `0 0 0 8px rgba(245,230,163,0.08), 0 0 40px -6px ${Y}` }}>✓</div>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(28px,4.4vw,46px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 22 }}>
            You&apos;re Registered.
          </h1>
          {/* Status block — mirrors the live application funnel's confirmation */}
          <div style={{ maxWidth: 460, margin: '0 auto', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '20px 22px', textAlign: 'left' }}>
            <div style={{ fontFamily: F, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#666', marginBottom: 10 }}>Status</div>
            <div style={{ fontFamily: F, fontSize: 15.5, fontWeight: 700, color: '#fff', marginBottom: 14 }}>
              Your seat is confirmed for <span style={{ color: Y }}>Thu, Aug 28 · 4:00 PM ET</span>
            </div>
            <div style={{ height: 6, background: '#1e1e1e', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: '100%', background: `linear-gradient(90deg, ${Y}, #e9d27e)`, borderRadius: 6 }} />
            </div>
            <div style={{ fontFamily: F, fontSize: 12.5, color: '#888' }}>Registration confirmed · join link on its way to your inbox</div>
          </div>
        </section>

        {/* Watch while you wait */}
        <section style={{ textAlign: 'center', marginBottom: 'clamp(40px,6vw,64px)' }}>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(24px,3.4vw,34px)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Watch While You Wait
          </h2>
          <p style={{ fontFamily: F, fontSize: 15, color: '#9a9a9a', lineHeight: 1.6, maxWidth: 580, margin: '0 auto 26px' }}>
            This short video gives you a sneak peek into how we build a brand and content system that brings in $400K a month organically — so you know exactly what we&apos;ll be building together on the training.
          </p>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${LINE}` }}>
            <div id={VIDEO_ELEMENT_ID} style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }} />
          </div>
        </section>

        {/* Join link emailed */}
        <section style={{ background: PANEL, border: `1px solid ${Y}33`, borderRadius: 16, padding: 'clamp(24px,4vw,34px)', textAlign: 'center', marginBottom: 'clamp(36px,5vw,56px)' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(245,230,163,0.1)', border: `1px solid ${Y}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: Y, fontSize: 20 }}>✉</div>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,2.6vw,26px)', fontWeight: 800, marginBottom: 10 }}>We Emailed You Your Join Link</h2>
          <p style={{ fontFamily: F, fontSize: 15, color: '#9a9a9a', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 16px' }}>
            Your unique Zoom join link is on its way to your inbox right now. That&apos;s how you&apos;ll get into the masterclass on Monday.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: F, fontSize: 15, fontWeight: 700, color: Y }}>
            <span>🗓</span> Thu, Aug 28 · 4:00 PM ET
          </div>
          <p style={{ fontFamily: F, fontSize: 13, color: '#666', marginTop: 14 }}>Can&apos;t find it? Check your spam or promotions folder.</p>
        </section>

        {/* Pre-masterclass prep */}
        <section style={{ marginBottom: 'clamp(40px,6vw,64px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: Y, color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>2</span>
            <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,2.6vw,26px)', fontWeight: 800 }}>Now Grab Your Pre-Masterclass Training</h2>
          </div>
          <p style={{ fontFamily: F, fontSize: 15, color: '#9a9a9a', lineHeight: 1.65, marginBottom: 20 }}>
            You&apos;re on the list — now get ahead. We recorded a training on using content to book high-ticket calls right now. DM us the word{' '}
            <strong style={{ color: '#fff' }}>BOOKED</strong> on Instagram and we&apos;ll send it over free, so you hit the ground running on Monday.
          </p>
          <a href={IG_URL} target="_blank" rel="noopener noreferrer"
            onClick={() => { trackEvent('webinar', 'webinar_dm_click'); fireCustom('webinar_dm_click'); }}
            style={{ display: 'block', textAlign: 'center', padding: '16px 24px', background: 'transparent', border: `1.5px solid ${Y}66`, borderRadius: 12, color: Y, fontFamily: F, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            Send Me &apos;BOOKED&apos; On Instagram →
          </a>
        </section>

        {/* What to expect */}
        <section style={{ marginBottom: 'clamp(40px,6vw,64px)' }}>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,2.6vw,26px)', fontWeight: 800, marginBottom: 20 }}>What To Expect At The Masterclass</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {EXPECT.map((t) => (
              <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: Y, color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, marginTop: 1 }}>✓</span>
                <span style={{ fontFamily: F, fontSize: 15.5, color: '#ddd', lineHeight: 1.55 }}>{t}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonial */}
        <section style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(24px,4vw,34px)', marginBottom: 'clamp(40px,6vw,64px)' }}>
          <blockquote style={{ borderLeft: `3px solid ${Y}`, paddingLeft: 20, margin: 0 }}>
            <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,19px)', color: '#e8e8e8', lineHeight: 1.6, fontStyle: 'italic', marginBottom: 14 }}>
              &ldquo;We fixed one thing in Hans&apos; content system and he added <strong style={{ color: '#fff', fontStyle: 'normal' }}>$95K/month</strong>. Same frameworks I&apos;m walking through, live, in this free masterclass.&rdquo;
            </p>
            <cite style={{ fontFamily: F, fontSize: 14, color: '#888', fontStyle: 'normal' }}>— SooWei Goh, VTC</cite>
          </blockquote>
        </section>

        {/* Live-only bonuses */}
        <section style={{ marginBottom: 'clamp(36px,5vw,52px)' }}>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(20px,2.6vw,26px)', fontWeight: 800, marginBottom: 4 }}>Just For Showing Up Live, You&apos;ll Also Get:</h2>
          <p style={{ fontFamily: F, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#777', marginBottom: 22 }}>
            $500+ in bonuses — live attendees only
          </p>
          <div className="wc-bonus">
            {LIVE_BONUSES.map((b) => (
              <div key={b.n} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(245,230,163,0.1)', border: `1px solid ${Y}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F, fontSize: 12, fontWeight: 800, color: Y }}>{b.n}</span>
                  <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: Y }}>Bonus {b.n}</span>
                  <span style={{ fontFamily: F, fontSize: 12, color: '#666' }}>· {b.value}</span>
                </div>
                <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{b.title}</h3>
                <p style={{ fontFamily: F, fontSize: 14, color: '#9a9a9a', lineHeight: 1.6 }}>{b.body}</p>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: F, fontSize: 13, color: '#666', fontStyle: 'italic', textAlign: 'center', marginTop: 18 }}>
            These are only available to live attendees. Miss it, lose it.
          </p>
        </section>

        {/* Closing */}
        <section style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: F, fontSize: 'clamp(17px,2.2vw,22px)', fontWeight: 700, color: '#fff', lineHeight: 1.4, marginBottom: 22 }}>
            The masterclass is <span style={{ color: Y }}>free</span>. The frameworks are <span style={{ color: Y }}>proven</span>. But none of it works if you don&apos;t show up.
          </p>
          <a href={IG_URL} target="_blank" rel="noopener noreferrer"
            onClick={() => { trackEvent('webinar', 'webinar_dm_click', { placement: 'closing' }); fireCustom('webinar_dm_click', { placement: 'closing' }); }}
            style={{ display: 'inline-block', padding: '15px 34px', background: 'transparent', border: `1.5px solid ${Y}66`, borderRadius: 50, color: Y, fontFamily: F, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            Or DM &apos;BOOKED&apos; on Instagram for your prep training →
          </a>
        </section>
      </main>
    </div>
  );
}
