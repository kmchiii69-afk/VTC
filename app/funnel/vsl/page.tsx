import SegmentFunnel, { type SegmentConfig } from '@/components/funnel/SegmentFunnel';

// The VSL funnel is the same page as the ads /under-100k funnel, with its own
// hero copy. Kept on its own `vsl` segment so it tracks + stores independently
// (leads still flow to /api/funnel/application → vsl_applications).
const cfg: SegmentConfig = {
  segment: 'vsl',
  apiEndpoint: '/api/funnel/application',
  pixelContentName: 'Brand Architect VSL',
  eyebrow: 'Coaches & Consultants',
  headlinePre: 'How Established Founders Are Adding',
  headlineHi: '$100-300k/Mo',
  headlinePost: ' Profit With This Organic Content System',
  subheadline: 'So You Can Sign Clients Consistently With Organic Content',
};

export default function Page() {
  return <SegmentFunnel cfg={cfg} />;
}
