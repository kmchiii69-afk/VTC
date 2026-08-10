'use client';
/* Multi-touch attribution + stage velocity + cross-funnel journeys, computed
 * from the granular `funnel_events` stream (lib/funnel-tracker.ts writes it,
 * app/api/admin/funnel-events-analytics/route.ts aggregates it). Styled to
 * match the rest of the admin app (Cormorant Garamond + DM Sans, soft cards)
 * and translated into plain English rather than raw event/funnel slugs, so
 * it reads fine to someone who didn't build the tracking. */

const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';
const SANS = "'DM Sans', sans-serif";
const GOLD = '#F5E6A3';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.5)';
const creamDim = 'rgba(240,232,212,0.32)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: '18px 20px',
};

export interface FunnelEventsAnalytics {
  configured: boolean;
  totalEvents?: number;
  totalSessions?: number;
  attribution: {
    first: { source: string; count: number }[];
    last: { source: string; count: number }[];
    touchBuckets: { bucket: string; count: number }[];
  };
  velocity: { funnel: string; from: string; to: string; medianFmt: string; n: number }[];
  dailyCohorts: { day: string; funnel: string; sessions: number }[];
  journeys: { path: string; count: number }[];
  video: {
    plays: number;
    completionRate: number;
    avgWatchTimeFmt: string;
    milestones: { milestone: number; sessions: number; pct: number }[];
    heatmap: { bucketPct: number; count: number; pct: number }[];
  };
}

/* ── Human-readable labels for funnel slugs and raw event names ── */
const FUNNEL_LABELS: Record<string, string> = {
  vsl: 'VSL', ig: 'Instagram DM', diagnostic: 'Diagnostic',
  'ads-gate': 'Ads · Gate',
  'under-100k': 'Ads · Under $100k',
  'over-100k-ads': 'Ads · $100k+ (Running Ads)',
  'over-100k-no-ads': 'Ads · $100k+ (No Ads)',
};
/* Narrow-column variant for the daily cohort table header, where the full
 * labels above ("Ads · $100k+ (Running Ads)") wrap and overlap — hover the
 * header for the full name via the title attribute. */
const FUNNEL_LABELS_SHORT: Record<string, string> = {
  vsl: 'VSL', ig: 'Instagram', diagnostic: 'Diagnostic',
  'ads-gate': 'Ads Gate',
  'under-100k': '<$100k',
  'over-100k-ads': '$100k+ Ads',
  'over-100k-no-ads': '$100k+ Organic',
};
function funnelLabelShort(f: string): string {
  return FUNNEL_LABELS_SHORT[f] || funnelLabel(f);
}
function funnelLabel(f: string): string {
  return FUNNEL_LABELS[f] || f.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FUNNEL_COLORS: Record<string, string> = {
  vsl: GOLD, ig: '#8FD0FF', 'ads-gate': '#F59E0B',
  'under-100k': '#C9A8FF', 'over-100k-ads': '#F0826D', 'over-100k-no-ads': '#BFFA46',
};
function funnelColor(f: string) { return FUNNEL_COLORS[f] || '#6FE9FF'; }

const EVENT_LABELS: Record<string, string> = {
  view: 'Viewed the page',
  form_step: 'Answered a question',
  form_submitted: 'Submitted the application',
  application: 'Submitted the application',
  qualified: 'Qualified',
  disqualified: "Didn't qualify",
  cta_click: 'Clicked the CTA',
  calendar_viewed: 'Reached the booking calendar',
  revenue_answer: 'Answered the revenue question',
  ads_answer: 'Answered the running-ads question',
  routed: 'Routed to a funnel',
  play: 'Started the video',
  pause: 'Paused the video',
  session_end: 'Stopped / left the video',
  milestone: 'Hit a video milestone',
};
function humanizeEvent(funnel: string, event: string): string {
  let e = event;
  const candidates = [`${funnel}_`, `${funnel.replace(/-/g, '_')}_`, 'ads_gate_', 'video_'];
  for (const p of candidates) {
    if (e.startsWith(p)) { e = e.slice(p.length); break; }
  }
  if (EVENT_LABELS[e]) return EVENT_LABELS[e];
  return e.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function StatTile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 130 }}>
      <div style={{ fontFamily: SANS, fontSize: 13, color: creamFaint, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, lineHeight: 1, color: color || cream }}>{value}</div>
    </div>
  );
}

// Freebie opt-in funnels are excluded from the "visits by funnel" cohort table.
const FREEBIE_FUNNELS = new Set(['clipping', 'buyer-mirror', 'freebie']);

function DailyCohortTable({ rows: allRows }: { rows: { day: string; funnel: string; sessions: number }[] }) {
  const rows = allRows.filter(r => !FREEBIE_FUNNELS.has(r.funnel));
  if (rows.length === 0) return <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '8px 0' }}>No sessions yet in this range.</div>;

  const funnels = [...new Set(rows.map(r => r.funnel))].sort();
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, {});
    byDay.get(r.day)![r.funnel] = r.sessions;
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 14);
  const maxTotal = Math.max(...days.map(d => funnels.reduce((sum, f) => sum + (byDay.get(d)?.[f] || 0), 0)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `70px repeat(${funnels.length}, 1fr) 50px`, gap: 10, padding: '0 0 8px' }}>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim }}>Day</span>
        {funnels.map(f => (
          <span key={f} title={funnelLabel(f)} style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: funnelColor(f), textAlign: 'right' as const, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{funnelLabelShort(f)}</span>
        ))}
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim, textAlign: 'right' as const }}>Total</span>
      </div>
      {days.map(day => {
        const total = funnels.reduce((sum, f) => sum + (byDay.get(day)?.[f] || 0), 0);
        return (
          <div key={day} style={{ display: 'grid', gridTemplateColumns: `70px repeat(${funnels.length}, 1fr) 50px`, gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontFamily: SANS, fontSize: 14, color: cream }}>{new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {funnels.map(f => (
              <span key={f} style={{ fontFamily: SANS, fontSize: 14.5, color: (byDay.get(day)?.[f] || 0) > 0 ? funnelColor(f) : creamDim, textAlign: 'right' as const }}>
                {byDay.get(day)?.[f] || '—'}
              </span>
            ))}
            <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: GOLD, textAlign: 'right' as const }}>{total}</span>
            <div style={{ gridColumn: `1 / -1`, background: 'rgba(255,255,255,0.04)', height: 2, marginTop: 2, borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${Math.round((total / maxTotal) * 100)}%`, background: GOLD, opacity: 0.5, borderRadius: 2 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WatchHeatmap({ rows }: { rows: { bucketPct: number; count: number; pct: number }[] }) {
  if (rows.length === 0) return <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '8px 0' }}>Not enough viewers yet to map this.</div>;
  const maxPct = Math.max(...rows.map(r => r.pct), 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 40 }}>
        {rows.map((r, i) => {
          const intensity = r.pct / maxPct;
          return (
            <div key={i} title={`${r.bucketPct}% into the video · ${r.pct}% of viewers watched here`}
              style={{ flex: 1, background: GOLD, opacity: 0.12 + intensity * 0.7, borderRadius: 3 }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {[0, 25, 50, 75, 100].map(m => (
          <span key={m} style={{ fontFamily: SANS, fontSize: 12, color: creamDim }}>{m}%</span>
        ))}
      </div>
    </div>
  );
}

function SourceBars({ rows, color }: { rows: { source: string; count: number }[]; color: string }) {
  if (rows.length === 0) return <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '8px 0' }}>No visits yet.</div>;
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => (
        <div key={r.source} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', gap: 10, alignItems: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: 14.5, color: cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source}</div>
          <div style={{ background: 'rgba(255,255,255,0.05)', height: 6, borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${Math.round((r.count / max) * 100)}%`, background: color, opacity: 0.8, borderRadius: 3 }} />
          </div>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color, textAlign: 'right' as const }}>{r.count}</div>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '28px 0 16px', flexWrap: 'wrap' as const }}>
      <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 24, color: cream }}>{children}</span>
      {sub && <span style={{ fontFamily: SANS, fontSize: 13.5, color: creamDim }}>{sub}</span>}
    </div>
  );
}

export function AttributionVelocityPanel({ data, loading }: { data: FunnelEventsAnalytics | null; loading: boolean }) {
  if (loading) return null;
  if (!data || !data.configured || (data.totalSessions ?? 0) === 0) {
    return (
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 22, color: cream, marginBottom: 8 }}>Attribution &amp; Velocity</div>
        <div style={{ fontFamily: SANS, fontSize: 15, color: creamFaint, lineHeight: 1.6 }}>
          No visit data yet for this range. Once traffic flows through the Instagram, Ads, or VSL funnels, this section fills in automatically.
        </div>
      </div>
    );
  }

  const { attribution, velocity, journeys, dailyCohorts } = data;
  const maxTouch = Math.max(...attribution.touchBuckets.map(b => b.count), 1);

  const touchLabels: Record<string, string> = {
    '1 touch': 'One visit', '2 touches': 'Two visits', '3-5 touches': '3–5 visits', '6+ touches': '6+ visits',
  };

  return (
    <>
      <SectionHeading sub={`${data.totalSessions} sessions · ${data.totalEvents} tracked actions`}>Attribution &amp; Velocity</SectionHeading>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>Where visitors came from first</div>
          <SourceBars rows={attribution.first} color="#8FD0FF" />
        </div>
        <div style={card}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>Where they came from just before converting</div>
          <SourceBars rows={attribution.last} color={GOLD} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {attribution.touchBuckets.map(b => (
          <div key={b.bucket} style={card}>
            <div style={{ fontFamily: SANS, fontSize: 13, color: creamFaint, marginBottom: 6 }}>{touchLabels[b.bucket] || b.bucket}</div>
            <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 28, lineHeight: 1, color: cream, marginBottom: 8 }}>{b.count}</div>
            <div style={{ background: 'rgba(255,255,255,0.05)', height: 3, borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${Math.round((b.count / maxTouch) * 100)}%`, background: GOLD, opacity: 0.7, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: journeys.length > 0 ? '1.3fr 1fr' : '1fr', gap: 14, marginBottom: 18 }}>
        <div style={card}>
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>How fast people move from one step to the next</div>
          {velocity.length === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '8px 0' }}>Not enough data yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Array.from(new Set(velocity.map(v => v.funnel))).map(funnel => {
                const rows = velocity.filter(v => v.funnel === funnel);
                return (
                  <div key={funnel}>
                    <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: funnelColor(funnel), letterSpacing: '0.04em', marginBottom: 4 }}>{funnelLabel(funnel)}</div>
                    {rows.map((v, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <span style={{ fontFamily: SANS, fontSize: 14.5, color: cream, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {humanizeEvent(v.funnel, v.from)} <span style={{ color: creamDim }}>→</span> {humanizeEvent(v.funnel, v.to)}
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: GOLD, flexShrink: 0 }}>{v.medianFmt}</span>
                        <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim, flexShrink: 0 }}>({v.n} {v.n === 1 ? 'person' : 'people'})</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {journeys.length > 0 && (
          <div style={card}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>People who visited more than one funnel</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {journeys.map((j, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: SANS, fontSize: 14.5, color: cream }}>{j.path.split(',').map(funnelLabel).join(' → ')}</span>
                  <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: '#C9A8FF' }}>{j.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>Visits by funnel, last 14 days</div>
        <DailyCohortTable rows={dailyCohorts} />
      </div>

      {data.video.plays > 0 && (
        <>
          <SectionHeading sub="VSL engagement">Video Analytics</SectionHeading>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
            <StatTile label="Plays" value={data.video.plays} color="#8FD0FF" />
            <StatTile label="Completion rate" value={`${data.video.completionRate}%`} color={data.video.completionRate >= 40 ? '#BFFA46' : '#F0826D'} />
            <StatTile label="Avg watch time" value={data.video.avgWatchTimeFmt} color={GOLD} />
          </div>
          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>How far people watch</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.video.milestones.map(m => (
                <div key={m.milestone} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 90px', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: cream }}>{m.milestone}%</div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', height: 6, borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${m.pct}%`, background: GOLD, opacity: 0.7, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: GOLD, textAlign: 'right' as const }}>{m.sessions} viewers ({m.pct}%)</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: creamFaint, marginBottom: 12 }}>Where in the video people watch most</div>
            <WatchHeatmap rows={data.video.heatmap} />
          </div>
        </>
      )}
    </>
  );
}
