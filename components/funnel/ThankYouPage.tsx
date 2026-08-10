'use client';
/* Thin per-funnel wrapper around the shared <ThankYou> visual — each real
 * funnel gets its OWN route (/funnel/vsl/thank-you, /funnel/ads/<segment>/
 * thank-you, /funnel/ig/thank-you) instead of being a client-side state
 * embedded inside that funnel's own page component. That makes it: (1) a
 * real trackable page (fires its own `<funnel>_booking_completed` view
 * event, matching how every other stage tracks its own arrival), and (2)
 * independently editable — swap what this file renders for a given funnel
 * without touching that funnel's main page at all, so different audiences
 * can eventually get genuinely different post-booking copy. */
import { useEffect, useState } from 'react';
import ThankYou, { type IcpTier, type FunnelKey } from './ThankYou';
import { trackEvent } from '@/lib/funnel-tracker';
import { fireCustom } from '@/lib/pixel-tracker';

export default function ThankYouPage({ funnel }: { funnel: FunnelKey }) {
  const [firstName, setFirstName] = useState<string | undefined>();
  const [tier, setTier] = useState<IcpTier>('standard');
  const [lostRevenue, setLostRevenue] = useState<number | undefined>();

  useEffect(() => {
    window.scrollTo(0, 0);
    const p = new URLSearchParams(window.location.search);
    const name = p.get('name') || undefined;
    const t: IcpTier = p.get('tier') === 'high' ? 'high' : 'standard';
    const lostRaw = p.get('lost');
    const lost = lostRaw ? parseInt(lostRaw, 10) : undefined;
    setFirstName(name);
    setTier(t);
    setLostRevenue(lost && !isNaN(lost) ? lost : undefined);
    trackEvent(funnel, `${funnel}_booking_completed`, { firstName: name, tier: t });
    fireCustom(`${funnel}_booking_completed`, { firstName: name, tier: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', paddingTop: 'clamp(48px,8vw,80px)' }}>
      <ThankYou firstName={firstName} tier={tier} lostRevenue={lostRevenue} funnel={funnel} />
    </div>
  );
}
