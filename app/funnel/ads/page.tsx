'use client';

/* Entry gate for the ads funnel. Asks revenue tier, then (if $100k+/mo)
 * whether they're running paid ads, and routes to the matching segment page
 * (/funnel/ads/under-100k | /over-100k-ads | /over-100k-no-ads) — each is
 * tracked, tagged, and stored separately so we can see conversion per segment. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom } from '@/lib/pixel-tracker';

const BG = '#050403';
const GOLD = '#F5E6A3';
const GOLD_FAINT = 'rgba(245,230,163,0.12)';
const CREAM = 'rgba(240,232,212,0.9)';
const CREAM_DIM = 'rgba(240,232,212,0.6)';
const CREAM_FAINT = 'rgba(240,232,212,0.35)';
const F = "'DM Sans', sans-serif";

function GateOpt({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '24px 32px', textAlign: 'left', width: '100%',
      background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.12)',
      borderRadius: 60, color: CREAM, fontFamily: F, fontSize: 19, fontWeight: 700,
      cursor: 'pointer', transition: 'all 150ms',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.background = GOLD_FAINT; e.currentTarget.style.color = GOLD; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = CREAM; }}
    >
      <div>{label} →</div>
      {sub && <div style={{ fontFamily: F, fontSize: 13, fontWeight: 400, color: CREAM_FAINT, marginTop: 6 }}>{sub}</div>}
    </button>
  );
}

export default function AdsGate() {
  const router = useRouter();
  const [step, setStep] = useState<'revenue' | 'ads'>('revenue');
  const [navigating, setNavigating] = useState(false);

  function go(segment: 'under-100k' | 'over-100k-ads' | 'over-100k-no-ads') {
    if (navigating) return;
    setNavigating(true);
    trackEvent('ads-gate', 'ads_gate_routed', { segment });
    fireCustom('ads_gate_routed', { segment });
    const search = typeof window !== 'undefined' ? window.location.search : '';
    router.push(`/funnel/ads/${segment}${search}`);
  }

  function pickRevenue(tier: 'under-100k' | '100k-plus') {
    trackEvent('ads-gate', 'ads_gate_revenue_answer', { tier });
    fireCustom('ads_gate_revenue_answer', { tier });
    if (tier === 'under-100k') {
      go('under-100k');
    } else {
      setStep('ads');
    }
  }

  function pickRunningAds(runningAds: boolean) {
    trackEvent('ads-gate', 'ads_gate_ads_answer', { runningAds });
    fireCustom('ads_gate_ads_answer', { runningAds });
    go(runningAds ? 'over-100k-ads' : 'over-100k-no-ads');
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 90% 70% at 50% 30%, rgba(245,230,163,0.05) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <img src="/onboarding/goh-logo.png" alt="Goh Consulting" style={{ width: 104, height: 104, objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
            Quick Question First
          </div>
          <h1 style={{ fontFamily: F, fontSize: 'clamp(20px,2.6vw,28px)', fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            How Established Founders Are Adding{' '}
            <span style={{ color: GOLD, whiteSpace: 'nowrap' }}>$100-300k/Mo</span> Profit With This Organic Content System
          </h1>
        </div>

        {step === 'revenue' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: CREAM, marginBottom: 26, lineHeight: 1.3, textAlign: 'center' }}>
              Whats your business currently doing in monthly revenue?
            </div>
            <GateOpt label="Less than $100K / month" onClick={() => pickRevenue('under-100k')} />
            <GateOpt label="$100K / month or more" onClick={() => pickRevenue('100k-plus')} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: CREAM, marginBottom: 26, lineHeight: 1.3, textAlign: 'center' }}>
              Are you currently running paid ads?
            </div>
            <GateOpt label="Yes, we're running ads" onClick={() => pickRunningAds(true)} />
            <GateOpt label="No, we're not running ads" onClick={() => pickRunningAds(false)} />
            <button
              onClick={() => setStep('revenue')}
              style={{ marginTop: 18, alignSelf: 'center', background: 'none', border: 'none', color: CREAM_DIM, fontFamily: F, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em' }}
            >← Back</button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: CREAM_FAINT, letterSpacing: '0.06em' }}>
          Your answers determine if — and how — we can help you.
        </div>
      </div>
    </div>
  );
}
