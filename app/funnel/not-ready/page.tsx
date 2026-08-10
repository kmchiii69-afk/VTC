'use client';

/* Where sub-$20k/mo applicants land instead of the booking calendar.
 *
 * Every funnel's application submits BEFORE routing here, so the lead is already
 * captured and can be sent resources — this page only has to tell them where
 * they stand and show what the program has done for clients. Testimonials only,
 * by design: no calendar, no form, no second ask. */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom } from '@/lib/pixel-tracker';
import { CASE_STUDIES, caseStudyEmbedUrl } from '@/lib/case-studies';

const Y = '#F5E6A3';
const BG = '#0a0a0a';
const F = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

export default function NotReadyPage() {
  const searchParams = useSearchParams();
  // Which funnel sent them, so the drop-off is attributable per funnel.
  const from = searchParams.get('from') || 'unknown';

  useEffect(() => {
    window.scrollTo(0, 0);
    trackEvent(from, 'not_ready_view', { from });
    fireCustom('not_ready_view', { from });
    if (!document.querySelector('link[data-gf]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.setAttribute('data-gf', '1');
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.prepend(l);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#fff', fontFamily: F, overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        iframe { display: block; }
        /* 2 videos per row on desktop, matching the /confirm page's grid. */
        .nr-vgrid { display: grid; grid-template-columns: 1fr; gap: 28px; }
        @media (min-width: 760px) { .nr-vgrid { grid-template-columns: 1fr 1fr; gap: 40px; } }
      `}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(245,230,163,0.05) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <section style={{ textAlign: 'center', padding: '56px 24px 0', maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <img src="/onboarding/goh-logo.png" alt="Goh Consulting" style={{ width: 92, height: 92, objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 800, color: '#fff', lineHeight: 1.22, letterSpacing: '-0.01em' }}>
            You&apos;re not ready to work with us yet, but we&apos;ll send you{' '}
            <span style={{ color: Y }}>resources to help out</span>
          </h1>
        </section>

        {/* Generous gap so the headline lands on its own before any video. */}
        <section style={{ padding: 'clamp(72px,10vw,128px) clamp(16px,4vw,32px) 80px', maxWidth: 1280, margin: '0 auto' }}>
          <div className="nr-vgrid">
            {CASE_STUDIES.map((cs) => (
              <div key={cs.id}>
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
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
