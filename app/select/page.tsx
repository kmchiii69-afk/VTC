'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';
import { RECORDING_CATEGORY_IDS, recordingCategory, formatCallDate, type Recording } from '@/lib/recordings';

const SELECT_TOUR: TourStep[] = [
  { title: 'Welcome to VTC', body: 'This is your starting screen — a quick look at how to get around.' },
  { target: 'select-nav', title: 'Choose where to go', body: 'Talk to your AI assistant, or jump into your recordings, roadmap, and SOP library.' },
];

const G = '#c9a455';
const CREAM = '#f0e8d4';

// Nav items, in the order shown on the home. 'AI Assistant' is always on; the
// rest unlock per portal feature (admins always on). `exclusive` items are hidden
// entirely rather than greyed out when locked — they only make sense for the
// members they belong to (the weekly KPI report is a Creative Specialist thing).
const OPTIONS = [
  { id: 'assistant',  label: 'SooWei AI', href: '/SooWei-AI', feature: null as string | null, exclusive: false },
  { id: 'recordings', label: 'Recordings',   href: '/hub',       feature: 'recordings' as string | null, exclusive: false },
  { id: 'roadmap',    label: 'Roadmap',      href: '/roadmap',   feature: 'roadmap' as string | null, exclusive: false },
  { id: 'sops',       label: 'SOP Library',  href: '/sops',      feature: 'sops' as string | null, exclusive: false },
  // One tile — the Wednesday / Friday choice lives inside the report itself.
  { id: 'weekly', label: 'Weekly Report', href: '/weekly-report', feature: 'creative_specialist' as string | null, exclusive: true },
] as const;

// ── Last-activity → deep link (mirrors components/ui/welcome-back) ──
type ViewType = 'module_view' | 'recording_view' | 'guide_view' | 'sop_view';
interface Activity { type: ViewType; refId: string | null; title: string | null; occurredAt: string; }
const TYPE_LABEL: Record<ViewType, string> = {
  module_view: 'Training', recording_view: 'Group call', guide_view: 'Guide', sop_view: 'SOP',
};
function hrefFor(a: Activity): string {
  const id = a.refId ? encodeURIComponent(a.refId) : '';
  switch (a.type) {
    case 'module_view':    return id ? `/modules?id=${id}` : '/modules';
    case 'recording_view': return id ? `/hub?rec=${id}` : '/hub';
    case 'guide_view':     return id ? `/guides/${id}` : '/select';
    case 'sop_view':       return id ? `/sops?sop=${id}` : '/sops';
    default:               return '/modules';
  }
}

function moduleIds(sections: { items: { id: string }[] }[]): string[] {
  const out: string[] = [];
  for (const s of sections) for (const it of s.items) out.push(it.id);
  return out;
}

function latestGroupCall(recordings: Recording[]): Recording | null {
  const group = recordings.filter((r) => RECORDING_CATEGORY_IDS.includes(r.category));
  if (!group.length) return null;
  return group.slice().sort((a, b) => {
    const da = a.call_date ?? '', db = b.call_date ?? '';
    if (da !== db) return db.localeCompare(da);
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  })[0];
}

export default function SelectPage() {
  const router = useRouter();
  const [authed, setAuthed]     = useState(false);
  const [visible, setVisible]   = useState(false);
  const [isAdmin, setIsAdmin]   = useState(false);
  const [name, setName]         = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [resumeHover, setResumeHover] = useState(false);
  const [replayHover, setReplayHover] = useState(false);

  const [totalModules, setTotalModules] = useState(0);
  const [doneModules, setDoneModules]   = useState(0);
  const [activity, setActivity]         = useState<Activity | null>(null);
  const [call, setCall]                 = useState<Recording | null>(null);

  useEffect(() => {
    setAuthed(true);
    setTimeout(() => setVisible(true), 120);

    fetch('/api/me/features', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.features)) setFeatures(d.features); })
      .catch(() => {});

    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setIsAdmin(u?.role === 'admin');
        setName(u?.name || '');
        if (u && u.role !== 'admin') {
          fetch('/api/me/onboarding', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((ob) => { if (ob && !ob.onboardedAt) router.replace('/onboarding'); })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Training progress: completed modules over the full catalog.
    Promise.all([
      fetch('/api/modules', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/me/modules', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([cat, prog]) => {
      const ids = Array.isArray(cat?.sections) ? moduleIds(cat.sections) : [];
      const completed = new Set<string>(Array.isArray(prog?.completed) ? prog.completed : []);
      setTotalModules(ids.length);
      setDoneModules(ids.filter((id) => completed.has(id)).length);
    });

    // Pick-up-where-you-left-off deep link.
    fetch('/api/me/last-activity', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.activity?.type) setActivity(d.activity as Activity); })
      .catch(() => {});

    // Latest group-call recording for the replay card.
    fetch('/api/recordings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { const latest = latestGroupCall(Array.isArray(d) ? d : []); if (latest) setCall(latest); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authed) return null;

  const firstName = (name || '').trim().split(/\s+/)[0] || '';
  const pct = totalModules > 0 ? Math.round((doneModules / totalModules) * 100) : 0;
  const actLabel = activity ? (TYPE_LABEL[activity.type] ?? 'Session') : '';
  const resumeTitle = activity?.title || (activity ? `Your last ${actLabel.toLowerCase()}` : 'Jump back into your training');
  const resumeHref = activity ? hrefFor(activity) : '/modules';

  const cat = call ? recordingCategory(call.category) : null;
  const callLabel = cat?.name || 'Group Call';
  // "NEW" if the call happened within the last 14 days.
  const isNewCall = (() => {
    if (!call?.call_date) return false;
    const t = new Date(call.call_date).getTime();
    return !Number.isNaN(t) && (Date.now() - t) < 14 * 24 * 60 * 60 * 1000;
  })();

  const cardBase: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20,
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
  };

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#060504' }}>
      <style>{`
        button:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.15); border-radius: 2px; }
      `}</style>

      <MeshBg speed={0.45} />

      {/* Faint hexagon motifs (echo the brand mark) */}
      <div className="hex-shape" style={{ position: 'absolute', top: -120, right: -80, width: 420, height: 420, border: '1px solid rgba(201,164,85,0.06)', pointerEvents: 'none' }} />
      <div className="hex-shape" style={{ position: 'absolute', bottom: -160, left: -120, width: 460, height: 460, border: '1px solid rgba(201,164,85,0.05)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(6,5,4,0.35) 0%, transparent 100%)' }} />

      <ProfileButton />
      {/* Name label to the left of the avatar (top-right) */}
      {firstName && (
        <div style={{ position: 'fixed', top: 38, right: 86, zIndex: 55, fontFamily: "'DM Sans', sans-serif",
          fontSize: 13.5, color: 'rgba(240,232,212,0.62)', letterSpacing: '0.02em' }}>
          {name}
        </div>
      )}

      {/* ── Main scroll column ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, overflowY: 'auto',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(18px)',
        transition: 'opacity 0.7s ease, transform 0.5s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(56px,9vh,110px) 24px 80px', display: 'flex', flexDirection: 'column' }}>

          {/* Hero */}
          <h1 style={{ textAlign: 'center', fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 400, fontSize: 'clamp(2.4rem,5vw,3.5rem)', lineHeight: 1.05, color: CREAM,
            margin: '0 0 clamp(28px,4vh,48px)' }}>
            Welcome back{firstName ? <>, <span style={{ color: G }}>{firstName}</span></> : ''}
          </h1>

          {/* Resume card */}
          <div style={{ ...cardBase, padding: 'clamp(22px,3vw,30px)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.7)', marginBottom: 12 }}>
                Pick up where you left off
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400,
                fontSize: 'clamp(1.3rem,2.4vw,1.75rem)', color: CREAM, lineHeight: 1.2, marginBottom: 16 }}>
                {resumeTitle}
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${G}, #e6c877)`, borderRadius: 4, transition: 'width 0.7s ease' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: 'rgba(240,232,212,0.4)' }}>
                  {actLabel ? `${actLabel} · ` : ''}{totalModules > 0 ? `Step ${Math.min(doneModules + 1, totalModules)} of ${totalModules}` : 'Getting started'}
                </span>
                {totalModules > 0 && (
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: G }}>{pct}%</span>
                )}
              </div>
            </div>

            <button
              onClick={() => router.push(resumeHref)}
              onMouseEnter={() => setResumeHover(true)}
              onMouseLeave={() => setResumeHover(false)}
              style={{
                flexShrink: 0, padding: '14px 40px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(180deg, #e6c877, #c9a455)', color: '#1a1206',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                boxShadow: resumeHover ? '0 8px 30px rgba(201,164,85,0.45)' : '0 6px 20px rgba(201,164,85,0.28)',
                transform: resumeHover ? 'translateY(-1px)' : 'none', transition: 'box-shadow 0.2s ease, transform 0.2s ease',
              }}
            >
              Resume
            </button>
          </div>

          {/* Nav pill bar — equal space above and below keeps it centered between
              the resume card and the group-call card */}
          <div data-tour="select-nav" style={{ display: 'flex', justifyContent: 'center', margin: 'clamp(64px,12vh,156px) 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 16,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {OPTIONS
                .filter((opt) => !opt.exclusive || isAdmin || (!!opt.feature && features.includes(opt.feature)))
                .map((opt, i) => {
                const disabled = !isAdmin && !!opt.feature && !features.includes(opt.feature);
                const isH = hoveredId === opt.id && !disabled;
                return (
                  <div key={opt.id} style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <div style={{ width: 1, height: 20, background: 'rgba(201,164,85,0.14)' }} />}
                    <button
                      onClick={() => { if (!disabled) router.push(opt.href); }}
                      disabled={disabled}
                      onMouseEnter={() => { if (!disabled) setHoveredId(opt.id); }}
                      onMouseLeave={() => setHoveredId(null)}
                      title={disabled ? 'Coming soon' : undefined}
                      style={{
                        background: isH ? 'rgba(201,164,85,0.08)' : 'none', border: 'none', borderRadius: 11,
                        cursor: disabled ? 'default' : 'pointer', padding: '11px 22px',
                        fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: disabled ? 'rgba(240,232,212,0.22)' : isH ? CREAM : 'rgba(240,232,212,0.62)',
                        transition: 'color 0.2s ease, background 0.2s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Latest group-call card */}
          {call && (
            <button
              onClick={() => router.push(`/hub?rec=${encodeURIComponent(call.id)}`)}
              onMouseEnter={() => setReplayHover(true)}
              onMouseLeave={() => setReplayHover(false)}
              style={{ ...cardBase, textAlign: 'left', cursor: 'pointer',
                borderColor: replayHover ? 'rgba(201,164,85,0.3)' : 'rgba(201,164,85,0.14)',
                padding: 'clamp(18px,2.4vw,24px) clamp(20px,3vw,30px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
                transition: 'border-color 0.2s ease' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 240, flex: 1 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}`, marginTop: 7, flexShrink: 0 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    {isNewCall && (
                      <span style={{ padding: '2px 9px', borderRadius: 999, background: 'rgba(201,164,85,0.85)', color: '#1a1206',
                        fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em' }}>
                        NEW
                      </span>
                    )}
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 700,
                      letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,232,212,0.4)' }}>
                      {callLabel}{call.call_date ? ` · ${formatCallDate(call.call_date)}` : ''}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 400,
                    fontSize: 'clamp(1.1rem,2vw,1.4rem)', color: CREAM, lineHeight: 1.25 }}>
                    {call.title || callLabel}
                  </div>
                </div>
              </div>
              <span style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                color: replayHover ? '#e6c877' : G, transition: 'color 0.2s ease' }}>
                Watch replay →
              </span>
            </button>
          )}

        </div>
      </div>

      <PageTour id="select" steps={SELECT_TOUR} />
    </main>
  );
}
