import SegmentFunnel, { type SegmentConfig } from '@/components/funnel/SegmentFunnel';

const cfg: SegmentConfig = {
  segment: 'over-100k-no-ads',
  apiEndpoint: '/api/funnel/segment-application',
  pixelContentName: 'Brand Architect — Over 100k No Ads',
  eyebrow: '$100K+/Mo Businesses Growing Organically',
  headlinePre: 'How Established Founders Are Adding',
  headlineHi: '$100-300k/Mo',
  headlinePost: ' Profit With This Organic Content System',
  subheadline: "You Already Bet On Organic. Let's Make It Compound.",
  proofLine: "The highest-earning businesses usually aren't running the best ads. They've built a personal brand strong enough that ads become optional, not required, to keep the leads coming.",
  trustFacts: [
    '200+ clients scaled with this system',
    '$50M+ generated for clients to date',
    '$408k/mo — 100% organic, zero ad spend',
    '4.9★ average client rating',
    'Organic-backed businesses close 59–60% of qualified calls',
    'Every case study below is a real, named client',
  ],
};

export default function Page() {
  return <SegmentFunnel cfg={cfg} />;
}
