import SegmentFunnel, { type SegmentConfig } from '@/components/funnel/SegmentFunnel';

const cfg: SegmentConfig = {
  segment: 'under-100k',
  apiEndpoint: '/api/funnel/segment-application',
  pixelContentName: 'VTC — Under 100k',
  // This funnel books its own Calendly event (not the shared "1 on 1 Strategy Call").
  calendlyEventName: '1-on-1 Strategy Call',
  calendlyEventSlug: '1-on-1-strategy-calls',
  eyebrow: 'Coaches & Consultants Under $100K/Mo',
  headlinePre: 'How Established Founders Are Adding',
  headlineHi: '$100-300k/Mo',
  headlinePost: ' Profit With This Organic Content System',
  subheadline: 'Nobody Cares About Your Results — Until They Care About You.',
};

export default function Page() {
  return <SegmentFunnel cfg={cfg} />;
}
