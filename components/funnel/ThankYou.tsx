'use client';
/* One shared post-booking screen for every funnel (VSL, the 3 ads segments,
 * IG) — replaces the bare "you're booked, check your email" screens with a
 * real pre-call page: journey timeline, a reflection prompt, a fit
 * qualifier, a prep checklist, and social proof — modeled on the Prophecy AI
 * precall-stage1/2 pattern (~/Desktop/kimchi/precall-stage1.html), adapted to
 * VTC's gold/cream Cormorant Garamond + DM Sans look. Copy flexes
 * by ICP tier (computed from the investment/commitment answers already
 * collected on the qualification form) rather than duplicating a whole
 * screen per funnel. */

const GOLD = '#F5E6A3';
const BG_CARD = 'rgba(255,255,255,0.03)';
const SERIF = "'Cormorant Garamond', serif";
const SANS = "'DM Sans', sans-serif";
const CREAM = 'rgba(240,232,212,0.92)';
const CREAM_DIM = 'rgba(240,232,212,0.6)';
const CREAM_FAINT = 'rgba(240,232,212,0.32)';

export type IcpTier = 'high' | 'standard';

const HIGH_INVESTMENT = ['$30,000 – $50,000', '$50,000+'];

/** Investment/commitment answers only exist on the qualification-form funnels
 *  (VSL + ads segments) — IG's simple opt-in has neither, so it always falls
 *  back to 'standard'. */
export function computeIcpTier(investment?: string, commitment?: string): IcpTier {
  const highInvestment = investment ? HIGH_INVESTMENT.some(v => investment.includes(v)) : false;
  const highCommitment = commitment ? parseInt(commitment, 10) >= 9 : false;
  return highInvestment || highCommitment ? 'high' : 'standard';
}

const JOURNEY = [
  { n: '1', title: 'You just booked your call.', body: 'You did what most people never do — you raised your hand for a real plan instead of another maybe-someday.' },
  { n: '2', title: 'Watch the checklist below', body: 'Three quick things that make the difference between a wasted 30 minutes and walking away with an actual plan.' },
  { n: '3', title: 'Show up on time', body: 'We hold your spot. If something comes up, just reply to the reminder email and we’ll find another time.' },
  { n: '4', title: 'The Call — Your Brand Breakdown', body: 'We map your exact bottlenecks and show you the fastest path to a content system that brings clients to you.' },
];

const CHECKLIST = [
  { n: '1', title: 'Know your numbers', body: 'A rough idea of your current monthly revenue, your content output, and where you want to be in 12 months. You don’t need to be exact.' },
  { n: '2', title: 'Find a quiet 30 minutes', body: 'No distractions, no background noise. Treat it like the most important meeting on your calendar this week — because it might be.' },
  { n: '3', title: 'Have notes open', body: 'You’ll leave with a plan. The people who write it down are the ones who actually follow through on it.' },
];

const PROOF = [
  { initials: 'MJ', name: 'Maya & Joey', result: '$20K → $224K/mo', desc: 'Installed the exact content system and positioning framework we’ll walk you through on the call.' },
  { initials: 'H', name: 'Hans', result: '$70K → $165K/mo', desc: 'Went from inconsistent posting to a repeatable content-to-call pipeline in under 90 days.' },
  { initials: 'AB', name: 'Alessio & Bryan', result: '$40K → $154K/mo', desc: 'Fixed their positioning first, then scaled the same content system that’s free on this call.' },
  { initials: 'D', name: 'Dario', result: '$45K → $109K/mo', desc: 'Scaled in 30 days once he stopped guessing and started following the system.' },
];

export type FunnelKey = 'vsl' | 'under-100k' | 'over-100k-ads' | 'over-100k-no-ads' | 'ig';

interface FunnelCopy {
  reflectionQuestion: string;
  reflectionBody: string;
  reflectionClose: string;
  fitIs: string[];
  fitIsnt: string[];
}

/** Per-funnel reflection + fit-qualifier copy — mirrors the same audience
 *  distinctions each funnel already makes pre-booking (headline/proofLine/
 *  adsFunnelBonus in SegmentConfig), so the thank-you page keeps talking to
 *  the same person instead of resetting to one generic voice post-booking. */
const FUNNEL_COPY: Record<FunnelKey, FunnelCopy> = {
  'vsl': {
    reflectionQuestion: 'If nothing changes in the next 12 months — same content, same inconsistency, same invisible brand — where does your business end up?',
    reflectionBody: 'The people who show up to these calls with a real plan are the ones who decided they’re done guessing. Everyone else is in the exact same place next year.',
    reflectionClose: 'You applied. You booked. You’re one step from a clear plan — finish it.',
    fitIs: ['You want a real content system, not more random posting', 'You’re ready to invest in the right positioning', 'You’ll show up, take notes, and take action'],
    fitIsnt: ['You’re just browsing and not ready to move', 'You want someone to just "post for you"', 'You’ve already decided nothing will work'],
  },
  'under-100k': {
    reflectionQuestion: 'If nothing changes in the next 12 months — same content, same inconsistency, same invisible brand — where does your business end up?',
    reflectionBody: 'The people who show up to these calls with a real plan are the ones who decided they’re done guessing. Everyone else is in the exact same place next year.',
    reflectionClose: 'You applied. You booked. You’re one step from a clear plan — finish it.',
    fitIs: ['You want a real content system, not more random posting', 'You’re ready to invest in the right positioning', 'You’ll show up, take notes, and take action'],
    fitIsnt: ['You’re just browsing and not ready to move', 'You want someone to just "post for you"', 'You’ve already decided nothing will work'],
  },
  'over-100k-ads': {
    reflectionQuestion: 'If you keep running ads without a brand behind them, what does another 12 months of that closing-rate gap actually cost you?',
    reflectionBody: 'You already saw the number above — that’s not a one-time hit, it compounds every month the gap stays open. The businesses that close it treat this call as the fix, not just another lead.',
    reflectionClose: 'You applied. You booked. Let’s close that gap — starting with this call.',
    fitIs: ['You’re running ads and want them converting at a higher rate, not just costing more', 'You want the redirect system that turns non-closers into revenue on the second pass', 'You’re ready to build the brand your ad spend is currently missing'],
    fitIsnt: ['You think doubling ad spend alone fixes a closing-rate problem', 'You’re not the one who approves the budget', 'You want a quick hack instead of a real system'],
  },
  'over-100k-no-ads': {
    reflectionQuestion: 'You already bet on organic instead of ads — if that stayed exactly the same for another 12 months, would you actually be where you want to be?',
    reflectionBody: 'Organic got you here. The businesses that compound past this point are the ones who install a real system behind it — not the ones who just post more and hope.',
    reflectionClose: 'You applied. You booked. Let’s turn “doing fine” into compounding.',
    fitIs: ['You’ve proven organic works and want to scale it without touching ads', 'You want a repeatable system, not one more content hack', 'You’re ready to go from “doing fine” to compounding'],
    fitIsnt: ['You want a fast paid-traffic shortcut instead of a real system', 'You’re happy where you are and not looking to scale', 'You’ve already decided content systems don’t work for you'],
  },
  'ig': {
    reflectionQuestion: 'You saw the post and you’re here — if nothing about your content or positioning changes in the next 12 months, are you actually further along?',
    reflectionBody: 'Most people scroll past. You didn’t. That’s usually the difference between staying stuck and actually changing something.',
    reflectionClose: 'You saw it, you clicked, you booked. Don’t let this be another tab you closed.',
    fitIs: ['You want a content system that actually gets you clients, not just likes', 'You’re open to a real conversation about your positioning', 'You’ll show up ready to talk business, not just browse'],
    fitIsnt: ['You’re just curious and not looking to change anything', 'You want free personalized advice without a real conversation', 'You’re not the one who’d make this decision for your business'],
  },
};

export default function ThankYou({ firstName, tier = 'standard', lostRevenue, funnel = 'vsl' }: { firstName?: string; tier?: IcpTier; lostRevenue?: number; funnel?: FunnelKey }) {
  const name = firstName ? firstName[0].toUpperCase() + firstName.slice(1) : '';
  const copy = FUNNEL_COPY[funnel] ?? FUNNEL_COPY.vsl;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px' }}>
      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(245,230,163,0.1)', border: `1px solid ${GOLD}44`,
          borderRadius: 40, padding: '7px 18px', marginBottom: 22,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: GOLD }}>
            {tier === 'high' ? 'Strategy Session Confirmed' : 'Call Confirmed'}
          </span>
        </div>
        <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 'clamp(28px,4.5vw,42px)', color: '#fff', lineHeight: 1.15, marginBottom: 14 }}>
          {tier === 'high' ? (
            <>You&apos;re In{name ? `, ${name}` : ''}.<br /><span style={{ color: GOLD, fontStyle: 'italic' }}>Here&apos;s What To Expect.</span></>
          ) : (
            <>Your Call Is In{name ? `, ${name}` : ''}.<br /><span style={{ color: GOLD, fontStyle: 'italic' }}>Now Do This.</span></>
          )}
        </h2>
        <p style={{ fontFamily: SANS, fontSize: 15, color: CREAM_DIM, maxWidth: 480, margin: '0 auto', lineHeight: 1.75 }}>
          {tier === 'high'
            ? 'From what you shared, this looks like a strong fit. Here’s exactly what to expect and how to prepare.'
            : 'This isn’t just a confirmation page. What you do in the next few minutes decides how much you get out of the call.'}
        </p>
      </div>

      {/* ── Ads lost-revenue urgency (over-100k-ads only, when computed) ── */}
      {!!lostRevenue && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(240,130,109,0.08), rgba(255,255,255,0.02))',
          border: '1px solid rgba(240,130,109,0.35)', borderRadius: 18, padding: '30px 28px', marginBottom: 48,
        }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#F0826D', marginBottom: 10 }}>
            Based On What You Shared
          </div>
          <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: '#fff', marginBottom: 14, lineHeight: 1.3 }}>
            Running ads without a brand behind them has likely cost you{' '}
            <span style={{ color: '#F0826D', fontStyle: 'italic' }}>~${lostRevenue.toLocaleString('en-US')}</span>.
          </h3>
          <p style={{ fontFamily: SANS, fontSize: 14.5, color: CREAM_DIM, lineHeight: 1.8 }}>
            That&apos;s the gap between what ads-only funnels close and what an organic-backed brand closes, compounded over the time you&apos;ve been running paid traffic. On the call, we&apos;ll show you exactly how to close it — starting with the next lead you spend money on.
          </p>
        </div>
      )}

      {/* ── Journey ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: GOLD, marginBottom: 6 }}>Your Journey</div>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: '#fff', marginBottom: 24 }}>Here&apos;s What Happens Next</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {JOURNEY.map((j, i) => (
            <div key={j.n} style={{
              display: 'flex', gap: 16, padding: '16px 18px', borderRadius: 14,
              background: i === 0 ? 'rgba(245,230,163,0.06)' : BG_CARD,
              border: `1px solid ${i === 0 ? GOLD + '44' : 'rgba(255,255,255,0.07)'}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SANS, fontSize: 13, fontWeight: 800,
                background: i === 0 ? GOLD : 'rgba(255,255,255,0.05)',
                color: i === 0 ? '#1a1710' : CREAM_FAINT,
              }}>{j.n}</div>
              <div>
                {i === 0 && (
                  <div style={{ display: 'inline-block', fontFamily: SANS, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#1a1710', background: GOLD, borderRadius: 5, padding: '2px 7px', marginBottom: 6 }}>You are here</div>
                )}
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{j.title}</div>
                <div style={{ fontFamily: SANS, fontSize: 13.5, color: CREAM_DIM, lineHeight: 1.6 }}>{j.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reflection ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245,230,163,0.05), rgba(255,255,255,0.02))',
        border: `1px solid ${GOLD}30`, borderRadius: 18, padding: '30px 28px', marginBottom: 48,
      }}>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, color: '#fff', marginBottom: 14, lineHeight: 1.3 }}>
          Before your call, ask yourself <span style={{ color: GOLD, fontStyle: 'italic' }}>one honest question.</span>
        </h3>
        <p style={{ fontFamily: SANS, fontSize: 14.5, color: CREAM_DIM, lineHeight: 1.8, marginBottom: 12 }}>
          {copy.reflectionQuestion}
        </p>
        <p style={{ fontFamily: SANS, fontSize: 14.5, color: CREAM_DIM, lineHeight: 1.8, marginBottom: 12 }}>
          {copy.reflectionBody}
        </p>
        <p style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: '#fff', lineHeight: 1.7 }}>
          {copy.reflectionClose}
        </p>
      </div>

      {/* ── Fit qualifier ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: GOLD, marginBottom: 6 }}>Read This First</div>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: '#fff', marginBottom: 20 }}>What This Call Is — And Isn&apos;t</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <div style={{ background: BG_CARD, border: `1px solid ${GOLD}30`, borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: GOLD, marginBottom: 14 }}>This IS for you if</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {copy.fitIs.map(t => (
                <div key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ color: GOLD, fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                  <span style={{ fontFamily: SANS, fontSize: 13.5, color: CREAM, lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: BG_CARD, border: '1px solid rgba(240,130,109,0.25)', borderRadius: 14, padding: '22px 24px' }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#F0826D', marginBottom: 14 }}>This is NOT for you if</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {copy.fitIsnt.map(t => (
                <div key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ color: '#F0826D', fontSize: 13, marginTop: 1, flexShrink: 0 }}>✕</span>
                  <span style={{ fontFamily: SANS, fontSize: 13.5, color: CREAM_DIM, lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Checklist ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: GOLD, marginBottom: 6 }}>Before The Call</div>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: '#fff', marginBottom: 20 }}>Your 3-Step Prep Checklist</h3>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {CHECKLIST.map(c => (
            <div key={c.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '16px 18px', background: BG_CARD, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(245,230,163,0.1)', border: `1px solid ${GOLD}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 12.5, fontWeight: 800, color: GOLD, marginTop: 2 }}>{c.n}</div>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontFamily: SANS, fontSize: 13.5, color: CREAM_DIM, lineHeight: 1.6 }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Social proof ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: GOLD, marginBottom: 6 }}>Proven Results</div>
        <h3 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, color: '#fff', marginBottom: 20 }}>People Who Showed Up — And What Happened</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          {PROOF.map(p => (
            <div key={p.name} style={{ background: BG_CARD, border: `1px solid ${GOLD}22`, borderRadius: 14, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(245,230,163,0.12)', border: `1.5px solid ${GOLD}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 12.5, fontWeight: 800, color: GOLD, flexShrink: 0 }}>{p.initials}</div>
                <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: '#fff' }}>{p.name}</div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 400, color: GOLD, marginBottom: 8 }}>{p.result}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: CREAM_DIM, lineHeight: 1.6 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Closing ── */}
      <div style={{
        textAlign: 'center', background: 'linear-gradient(135deg, rgba(245,230,163,0.06), rgba(255,255,255,0.02))',
        border: `1px solid ${GOLD}30`, borderRadius: 18, padding: '32px 28px',
      }}>
        {tier === 'high' ? (
          <>
            <p style={{ fontFamily: SANS, fontSize: 15, color: CREAM, lineHeight: 1.8, marginBottom: 10 }}>
              From what you shared, this looks like a strong fit — we&apos;re looking forward to the call.
              Check your email for the calendar invite and a few things to think about beforehand.
            </p>
            <p style={{ fontFamily: SANS, fontSize: 13, color: CREAM_FAINT }}>See you soon.</p>
          </>
        ) : (
          <>
            <p style={{ fontFamily: SANS, fontSize: 15, color: CREAM, lineHeight: 1.8, marginBottom: 10 }}>
              Check your email for the calendar invite — and if something comes up, reply to any reminder and we&apos;ll find another time.
            </p>
            <p style={{ fontFamily: SANS, fontSize: 13, color: CREAM_FAINT }}>Talk soon.</p>
          </>
        )}
      </div>
    </div>
  );
}
