import SegmentFunnel, { type SegmentConfig } from '@/components/funnel/SegmentFunnel';

const cfg: SegmentConfig = {
  segment: 'over-100k-ads',
  apiEndpoint: '/api/funnel/segment-application',
  pixelContentName: 'VTC — Over 100k Running Ads',
  eyebrow: '$100K+/Mo Businesses Running Paid Ads',
  headlinePre: 'How Established Founders Are Adding',
  headlineHi: '$100-300k/Mo',
  headlinePost: ' Profit With This Organic Content System',
  subheadline: "It's Not The Ads. It's The Brand Behind Them.",
  proofLine: "Ads-only businesses average 45% margins. Add a personal brand, and that jumps to 64%. Your CAC drops as your reach grows instead of increasing with ad costs. And while ads-only funnels close around 40% of qualified calls, organic backed funnels close 60%. That 20-point gap compounds every month.",
  adsFunnelBonus: true,
};

export default function Page() {
  return <SegmentFunnel cfg={cfg} />;
}
