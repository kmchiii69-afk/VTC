'use client';
/* Simple daily-views bar chart for the bottom of the Funnels tab — total
 * page views per day across every funnel, for the currently selected range.
 * Single-hue magnitude chart (gold), so no categorical palette is needed;
 * hovering a bar shows the per-page breakdown as text. */
import { useState } from 'react';

const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';
const SANS = "'DM Sans', sans-serif";
const GOLD = '#F5E6A3';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.5)';
const creamDim = 'rgba(240,232,212,0.32)';

const PAGE_LABELS: Record<string, string> = {
  ig: 'Instagram DM', 'ads-gate': 'Ads Gate', 'under-100k': 'Ads · Under $100k',
  'over-100k-ads': 'Ads · $100k+ (Ads)', 'over-100k-no-ads': 'Ads · $100k+ (No Ads)', vsl: 'VSL',
};
function pageLabel(id: string) { return PAGE_LABELS[id] || id; }

export function DailyViewsChart({ data }: { data: { day: string; total: number; byPage: Record<string, number> }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0 || data.every(d => d.total === 0)) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, color: cream, marginBottom: 4 }}>Views over time</div>
        <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, marginTop: 8 }}>No visits yet in this range.</div>
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.total), 1);
  const showEveryNth = Math.ceil(data.length / 12);
  const active = hover != null ? data[hover] : null;

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' as const }}>
        <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, color: cream }}>Views over time</div>
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: creamDim }}>every funnel page, by day</div>
      </div>

      <div style={{ height: 28, marginBottom: 4, fontFamily: SANS, fontSize: 14, color: cream }}>
        {active ? (
          <>
            <span style={{ fontWeight: 700, color: GOLD }}>{active.total}</span> view{active.total === 1 ? '' : 's'} on{' '}
            {new Date(active.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {Object.keys(active.byPage).length > 0 && (
              <span style={{ color: creamFaint }}>
                {' — '}
                {Object.entries(active.byPage).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${pageLabel(p)} (${c})`).join(', ')}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: creamDim }}>Hover a bar for the breakdown</span>
        )}
      </div>

      {/* Bars are capped to a sensible max width and left-aligned rather than
       * stretched to fill — with only a day or two of data (brand new
       * tracking) a flex-1 bar would render as one giant solid block instead
       * of a readable chart. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, justifyContent: data.length < 10 ? 'flex-start' : 'stretch' }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.day}
            onMouseEnter={() => setHover(i)}
            style={{ flex: data.length < 10 ? '0 0 32px' : 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}
          >
            <div style={{
              width: '100%', minHeight: 2,
              height: `${Math.max(2, Math.round((d.total / max) * 100))}%`,
              background: GOLD, opacity: hover === null || hover === i ? 0.85 : 0.35,
              borderRadius: '3px 3px 0 0', transition: 'opacity 120ms',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 6, justifyContent: data.length < 10 ? 'flex-start' : 'stretch' }}>
        {data.map((d, i) => (
          <div key={d.day} style={{ flex: data.length < 10 ? '0 0 32px' : 1, textAlign: 'center' as const, fontFamily: SANS, fontSize: 11.5, color: creamDim }}>
            {i % showEveryNth === 0 ? new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </div>
        ))}
      </div>
      {data.length < 5 && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: creamDim, marginTop: 10 }}>
          Only {data.length} day{data.length === 1 ? '' : 's'} of data so far — this fills in as more traffic comes through.
        </div>
      )}
    </div>
  );
}
