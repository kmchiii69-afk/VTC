'use client';
/* Per-page funnel breakdown + UTM link generator — one row per real funnel
 * page (views → optins → qualified → booked → showed → closed), click a row
 * to expand its channel breakdown, click Link to build a tagged promo link
 * (pick medium → pick platform → copied to clipboard) or grab a `?preview=1`
 * link that opens the real page without polluting analytics (lib/funnel-
 * tracker.ts + lib/tracking.ts both suppress/relabel tracking when that
 * param is present). Styled to match the rest of the admin app. */
import { useState } from 'react';

const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';
const SANS = "'DM Sans', sans-serif";
const GOLD = '#F5E6A3';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.5)';
const creamDim = 'rgba(240,232,212,0.32)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
};

export interface PageFunnelRow {
  id: string;
  groupId: string;
  groupLabel: string;
  stageLabel: string;
  pagePath: string;
  views: number;
  viewsUnique: number;
  optins: number;
  optinRate: number;
  qualified: number | null;
  booked: number | null;
  showed: number | null;
  closed: number | null;
  revenue: number | null;
  channels: { channel: string; color: string; views: number; optins: number; qualified: number | null }[];
  trend: { day: string; count: number }[];
}

/* Same funnel = same color everywhere in the admin app (matches
 * AttributionVelocityPanel's FUNNEL_COLORS). */
const GROUP_COLORS: Record<string, string> = {
  vsl: GOLD, ig: '#8FD0FF', 'ads-gate': '#F59E0B',
  'under-100k': '#C9A8FF', 'over-100k-ads': '#F0826D', 'over-100k-no-ads': '#BFFA46',
};
function groupColor(id: string) { return GROUP_COLORS[id] || '#6FE9FF'; }

/* Funnel families — top-level sections in grouped mode. */
const FAMILY_OF: Record<string, string> = {
  clipping: 'freebie', 'buyer-mirror': 'freebie',
  vsl: 'vsl',
  'ads-gate': 'ads', 'under-100k': 'ads', 'over-100k-ads': 'ads', 'over-100k-no-ads': 'ads',
  ig: 'ig',
};
const FAMILY_LABELS: Record<string, string> = { freebie: 'Freebie Opt-ins', vsl: 'VSL', ads: 'Ads', ig: 'Instagram DM', other: 'Other' };
const FAMILY_COLORS: Record<string, string> = { freebie: '#8FD0FF', vsl: GOLD, ads: '#F0826D', ig: '#6FE9FF', other: '#6FE9FF' };
const FAMILY_ORDER = ['freebie', 'vsl', 'ads', 'ig', 'other'];
const familyOf = (groupId: string) => FAMILY_OF[groupId] || 'other';

const MEDIUMS = [
  { id: 'paid', label: 'Paid', desc: 'ads & sponsored' },
  { id: 'organic', label: 'Organic', desc: 'bio, post, description' },
  { id: 'email', label: 'Email', desc: 'newsletters & sequences' },
  { id: 'outbound', label: 'Outbound', desc: 'DMs & direct outreach' },
  { id: 'cold', label: 'Cold', desc: 'cold traffic & lists' },
] as const;

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', source: 'youtube' },
  { id: 'tiktok', label: 'TikTok', source: 'tiktok' },
  { id: 'instagram', label: 'Instagram', source: 'instagram' },
  { id: 'facebook', label: 'Facebook', source: 'facebook' },
  { id: 'linkedin', label: 'LinkedIn', source: 'linkedin' },
  { id: 'x', label: 'X / Twitter', source: 'twitter' },
  { id: 'text', label: 'Text / SMS', source: 'text' },
  { id: 'email', label: 'Email', source: 'email' },
  { id: 'ghl', label: 'GoHighLevel', source: 'ghl' },
] as const;

function fmt$(n: number | null): string {
  if (!n) return '—';
  return `$${n.toLocaleString()}`;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0 || data.every(v => v === 0)) return <span style={{ color: creamDim, fontFamily: SANS, fontSize: 13 }}>—</span>;
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 22 }}>
      {data.map((v, i) => (
        <div key={i} style={{ width: 3, height: Math.max(2, Math.round((v / max) * 22)), background: GOLD, opacity: 0.4 + (v / max) * 0.6, borderRadius: 1.5 }} />
      ))}
    </div>
  );
}

function LinkGeneratorPopover({ pagePath }: { pagePath: string }) {
  const [step, setStep] = useState<'closed' | 'medium' | 'platform'>('closed');
  const [medium, setMedium] = useState<string>('paid');
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = `${origin}${pagePath}`;
  const previewUrl = `${baseUrl}${pagePath.includes('?') ? '&' : '?'}preview=1`;

  function buildLink(source: string): string {
    const params = new URLSearchParams();
    params.set('utm_source', source);
    params.set('utm_medium', medium);
    params.set('utm_campaign', pagePath.replace(/^\//, '').replace(/\//g, '_') || 'home');
    return `${baseUrl}?${params.toString()}`;
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => { setCopied(null); setStep('closed'); }, 1200);
  }

  const menuItem = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    width: '100%', textAlign: 'left', padding: '9px 12px', background: active ? 'rgba(245,230,163,0.1)' : 'transparent',
    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: active ? GOLD : cream,
    fontFamily: SANS, fontSize: 14.5, cursor: 'pointer',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setStep(step === 'closed' ? 'medium' : 'closed')}
        title="Get a trackable link for this page"
        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '4px 10px', color: creamFaint, fontFamily: SANS, fontSize: 13, cursor: 'pointer' }}
      >
        Link
      </button>

      {step !== 'closed' && <div onClick={() => setStep('closed')} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {step === 'medium' && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, width: 260, background: '#0d0c0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontFamily: SANS, fontSize: 12, color: creamDim, marginBottom: 6 }}>Preview link — doesn&apos;t count toward analytics</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 13, color: creamFaint, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={previewUrl}>
                {previewUrl}
              </div>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" title="Open preview" style={{ color: creamFaint, textDecoration: 'none', fontSize: 15 }}>↗</a>
              <button onClick={() => copy('preview', previewUrl)} title="Copy preview link" style={{ background: 'transparent', border: 'none', color: copied === 'preview' ? '#BFFA46' : creamFaint, cursor: 'pointer', fontSize: 14 }}>
                {copied === 'preview' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div style={{ padding: '8px 12px 4px', fontFamily: SANS, fontSize: 12.5, color: creamDim }}>Where will promo come from?</div>
          {MEDIUMS.map(m => (
            <button key={m.id} onClick={() => { setMedium(m.id); setStep('platform'); }} style={menuItem(false)}>
              <span>{m.label}</span>
              <span style={{ fontSize: 12, color: creamDim }}>{m.desc}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'platform' && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, width: 220, background: '#0d0c0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim }}>
              {MEDIUMS.find(m => m.id === medium)?.label} — Platform
            </span>
            <button onClick={() => setStep('medium')} style={{ background: 'transparent', border: 'none', color: creamDim, fontFamily: SANS, fontSize: 12.5, cursor: 'pointer' }}>← Back</button>
          </div>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => copy(p.id, buildLink(p.source))} style={menuItem(copied === p.id)}>
              <span>{p.label}</span>
              {copied === p.id && <span style={{ fontSize: 12 }}>Copied!</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelBreakdown({ channels }: { channels: PageFunnelRow['channels'] }) {
  const withData = channels.filter(ch => ch.views > 0 || ch.optins > 0);
  if (withData.length === 0) {
    return <div style={{ fontFamily: SANS, fontSize: 14, color: creamDim }}>No visits yet in this range.</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
      {withData.map(ch => (
        <div key={ch.channel} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 20,
          background: `${ch.color}14`,
          border: `1px solid ${ch.color}44`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ch.color, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: cream }}>{ch.channel}</span>
          <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim }}>
            {ch.views} view{ch.views === 1 ? '' : 's'} · {ch.optins} optin{ch.optins === 1 ? '' : 's'}
            {ch.qualified != null ? ` · ${ch.qualified} qual` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function StageRow({ p, cols, isExpanded, onToggle }: { p: PageFunnelRow; cols: string; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '12px 16px 12px 34px', borderTop: '1px solid rgba(255,255,255,0.05)', background: isExpanded ? 'rgba(245,230,163,0.03)' : 'transparent', cursor: 'pointer', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: creamDim, fontSize: 12, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>▶</span>
          <LinkGeneratorPopover pagePath={p.pagePath} />
          <div style={{ fontFamily: SANS, fontSize: 14.5, color: creamFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.stageLabel}</div>
        </div>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.views || '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.viewsUnique || '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.optins || '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: p.optinRate >= 20 ? '#BFFA46' : cream, textAlign: 'center' }}>{p.optins > 0 ? `${p.optinRate}%` : '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.qualified ?? '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.booked ?? '—'}</span>
        <span style={{ fontFamily: SANS, fontSize: 15, color: cream, textAlign: 'center' }}>{p.showed ?? '—'}</span>
        <span style={{ textAlign: 'center' }}>
          <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: (p.closed ?? 0) > 0 ? 700 : 400, color: (p.closed ?? 0) > 0 ? '#BFFA46' : cream }}>{p.closed ?? '—'}</span>
          {p.revenue != null && p.revenue > 0 && <span style={{ fontFamily: SANS, fontSize: 13, color: GOLD, marginLeft: 4 }}>{fmt$(p.revenue)}</span>}
        </span>
        <span style={{ display: 'flex', justifyContent: 'center' }}>
          <Sparkline data={p.trend.map(t => t.count)} />
        </span>
      </div>

      {isExpanded && (
        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '14px 16px 16px 58px' }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: creamDim, marginBottom: 10 }}>Where visits &amp; opt-ins come from</div>
          <ChannelBreakdown channels={p.channels} />
        </div>
      )}
    </div>
  );
}

export function PageFunnelTable({ pages, loading, grouped = false }: { pages: PageFunnelRow[]; loading: boolean; grouped?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  if (loading) {
    return <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '24px 0', textAlign: 'center' }}>Loading page data…</div>;
  }
  if (pages.length === 0) {
    return <div style={{ fontFamily: SANS, fontSize: 15, color: creamDim, padding: '24px 0' }}>No pages configured.</div>;
  }

  const cols = '1.6fr 70px 70px 70px 60px 60px 60px 60px 90px 70px';

  // Preserve the API's ordering — group consecutive rows that share a groupId
  // into distinct funnel blocks, each its own card, instead of one long flat
  // table where 16 stage-rows across 6 funnels all blur together.
  const groups: { groupId: string; groupLabel: string; rows: PageFunnelRow[] }[] = [];
  for (const p of pages) {
    const last = groups[groups.length - 1];
    if (last && last.groupId === p.groupId) last.rows.push(p);
    else groups.push({ groupId: p.groupId, groupLabel: p.groupLabel, rows: [p] });
  }

  // One funnel card (used flat and inside family sections).
  const groupCard = (g: { groupId: string; groupLabel: string; rows: PageFunnelRow[] }) => {
    const color = groupColor(g.groupId);
    const totalViews = g.rows.reduce((s, r) => s + r.views, 0);
    const isOpen = openGroup === g.groupId;
    return (
      <div key={g.groupId} style={{ ...card, padding: 0, overflow: 'visible', borderLeft: `3px solid ${color}` }}>
        <div
          onClick={() => setOpenGroup(isOpen ? null : g.groupId)}
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 18px', cursor: 'pointer' }}
        >
          <span style={{ color: creamDim, fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>▶</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, color: cream }}>{g.groupLabel}</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: creamDim }}>{g.rows[0].pagePath}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: creamFaint }}>{totalViews} total view{totalViews === 1 ? '' : 's'}</span>
        </div>

        {isOpen && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 18px 6px 42px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 0 }}>
              {['Stage', 'Views', 'Unique', 'Optins', 'Opt %', 'Qual', 'Booked', 'Showed', 'Closed / Rev', 'Trend'].map(h => (
                <span key={h} style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: creamDim, textAlign: h === 'Stage' ? 'left' : 'center', paddingTop: 10 }}>{h}</span>
              ))}
            </div>
            {g.rows.map(p => (
              <StageRow key={p.id} p={p} cols={cols} isExpanded={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} />
            ))}
          </>
        )}
      </div>
    );
  };

  // Flat mode — one card per funnel (used by the Funnels tab).
  if (!grouped) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>{groups.map(groupCard)}</div>;
  }

  // Grouped mode — bucket funnels into families, each an openable section.
  const families = FAMILY_ORDER
    .map(fam => ({ fam, groups: groups.filter(g => familyOf(g.groupId) === fam) }))
    .filter(f => f.groups.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {families.map(({ fam, groups: fg }) => {
        const color = FAMILY_COLORS[fam];
        const totalViews = fg.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.views, 0), 0);
        const isOpen = openFamily === fam;
        return (
          <div key={fam} style={{ ...card, padding: 0, overflow: 'visible', borderLeft: `4px solid ${color}` }}>
            <div
              onClick={() => setOpenFamily(isOpen ? null : fam)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', cursor: 'pointer' }}
            >
              <span style={{ color: creamDim, fontSize: 13, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms', flexShrink: 0 }}>▶</span>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, color: cream }}>{FAMILY_LABELS[fam]}</span>
              <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim }}>{fg.length} funnel{fg.length === 1 ? '' : 's'}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: creamFaint }}>{totalViews} total view{totalViews === 1 ? '' : 's'}</span>
            </div>
            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ height: 2 }} />
                {fg.map(groupCard)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
