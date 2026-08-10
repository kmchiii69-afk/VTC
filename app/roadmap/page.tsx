'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MeshBg } from '@/components/ui/mesh-bg';
import { RecordingEmbed } from '@/components/ui/recording-embed';
import { AcquisitionDashboard } from '@/components/ui/acquisition-dashboard';
import {
  getCurrentPhase, isItemUnlocked, canToggleItem, isPhaseUnlocked,
  type RoadmapPhase, type RoadmapItem,
} from '@/lib/roadmap-data';
import { useRoadmap } from '@/lib/use-roadmap';
import { isEmbeddable, toEmbedUrl } from '@/lib/doc-embed';
import { useCornerClearance } from '@/components/ui/use-corner-clearance';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';
import { track } from '@vercel/analytics';

const ROADMAP_TOUR: TourStep[] = [
  { title: 'Your roadmap', body: "This is your step-by-step path through the program. Here's how it works." },
  { target: 'roadmap-phases', title: 'Phases', body: 'Your journey is split into phases. Each phase unlocks once you complete the one before it.' },
  { target: 'roadmap-steps', title: 'Steps', body: 'Each step shows its guides, videos and links right there — open any resource, then tick the ✓ when you’re done.' },
  { target: 'roadmap-progress', title: 'Progress', body: 'Watch this fill as you complete steps across every phase.' },
];


const resourcePill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 9,
  background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)',
  color: '#c9a455', textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

function ResourceLink({ label, url, onEmbed }: { label: string; url: string; onEmbed: (url: string, title: string) => void }) {
  if (isEmbeddable(url)) {
    return <button onClick={() => onEmbed(url, label)} style={resourcePill}>{label} ↗</button>;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" style={resourcePill}>{label} ↗</a>;
}

function EmbedModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, height: '88vh', display: 'flex', flexDirection: 'column', background: '#0a0806', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#c9a455', textDecoration: 'none' }}>Open in new tab ↗</a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <iframe src={toEmbedUrl(url)} allow="fullscreen" style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
      </div>
    </div>
  );
}

// Opens a matching recording (by category + title regex) in a popup player.
interface RecRow { id: string; category: string; title: string | null; embed_code: string | null; fathom_url: string | null; }
function RecordingModal({ rec, onClose }: { rec: { label: string; category: string; match: string }; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');
  const [match, setMatch] = useState<RecRow | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/recordings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RecRow[]) => {
        if (!alive) return;
        const re = new RegExp(rec.match, 'i');
        const hit = (rows || []).find((row) => row.category === rec.category && re.test(row.title || ''))
          ?? (rows || []).find((row) => re.test(row.title || ''));
        if (hit && (hit.embed_code || hit.fathom_url)) { setMatch(hit); setState('ready'); }
        else setState('none');
      })
      .catch(() => { if (alive) setState('none'); });
    return () => { alive = false; };
  }, [rec.category, rec.match]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', background: '#0a0806', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match?.title || rec.label}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: state === 'ready' ? 0 : '40px 20px', minHeight: 120 }}>
          {state === 'loading' && <div style={{ textAlign: 'center', color: 'rgba(240,232,212,0.55)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</div>}
          {state === 'none' && (
            <div style={{ textAlign: 'center', color: 'rgba(240,232,212,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.6 }}>
              This recording isn’t available yet — find it in the <Link href="/hub" style={{ color: '#c9a455' }}>VTC recordings</Link>.
            </div>
          )}
          {state === 'ready' && match && (
            match.embed_code
              ? <RecordingEmbed html={match.embed_code} />
              : <div style={{ padding: 20 }}><a href={match.fathom_url!} target="_blank" rel="noopener noreferrer" style={{ color: '#c9a455' }}>Watch the recording ↗</a></div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, index, completed, locked, canToggle, onToggle, onModClick, onEmbed, onRecording }: {
  item: RoadmapItem;
  index: number;
  completed: boolean;
  locked: boolean;
  canToggle: boolean;
  onToggle: () => void;
  onModClick: (modIndex: number) => void;
  onEmbed: (url: string, title: string) => void;
  onRecording: (rec: NonNullable<RoadmapItem['recording']>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasContents = !!((item.mods && item.mods.length) || item.sop || item.href || (item.links && item.links.length) || (item.guides && item.guides.length) || item.recording);
  // Details (resources + any remaining description) are always shown — no dropdown.
  const showDetails = !locked && (hasContents || !!item.desc);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: completed
          ? 'rgba(201,164,85,0.04)'
          : hovered && !locked ? 'rgba(201,164,85,0.06)' : 'rgba(0,0,0,0.22)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: completed
          ? '1px solid rgba(201,164,85,0.2)'
          : hovered && !locked ? '1px solid rgba(201,164,85,0.25)' : '1px solid rgba(201,164,85,0.1)',
        borderRadius: 14,
        padding: '0.95rem 1.25rem',
        width: '100%', minHeight: 72, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        transition: 'all 0.2s ease',
        opacity: locked ? 0.5 : completed ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: '1.05rem', fontWeight: 300,
            color: completed ? 'rgba(201,164,85,0.55)' : hovered && !locked ? '#f0e8d4' : 'rgba(240,232,212,0.75)',
            lineHeight: 1.35, transition: 'color 0.2s',
            textDecorationLine: completed ? 'line-through' : 'none', textDecorationColor: 'rgba(201,164,85,0.3)',
          }}>
            {item.text}
          </span>
          {item.optional && (
            <span style={{ flexShrink: 0, fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.7)', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 20, padding: '2px 8px' }}>
              If applicable
            </span>
          )}
        </div>

        {locked ? (
          <span title="Complete the previous phase to unlock" style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(240,232,212,0.55)', fontSize: '13px',
          }}>🔒</span>
        ) : (
          <button
            onClick={() => { if (canToggle) onToggle(); }}
            disabled={!canToggle}
            title={completed ? 'Mark incomplete' : 'Mark complete'}
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: completed ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
              border: completed ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.1)',
              color: completed ? '#4ade80' : 'rgba(255,255,255,0.25)',
              cursor: canToggle ? 'pointer' : 'default', fontSize: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', opacity: canToggle ? 1 : 0.6,
            }}
          >
            ✓
          </button>
        )}
      </div>

      {/* Always-open details: description text (if any) + resource pills. */}
      {showDetails && (
        <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid rgba(201,164,85,0.1)' }}>
          {item.desc && (
            <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.6, color: 'rgba(240,232,212,0.62)', whiteSpace: 'pre-wrap' }}>
              {item.desc}
            </p>
          )}
          {hasContents && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: item.desc ? 12 : 0 }}>
              {item.guides?.map((g) => (
                <Link key={g.slug} href={`/guides/${g.slug}`} style={resourcePill}>📄 {g.label}</Link>
              ))}
              {item.recording && (
                <button onClick={() => onRecording(item.recording!)} style={resourcePill}>▶ {item.recording.label}</button>
              )}
              {item.href && (
                <Link href={item.href} style={resourcePill}>Open in the app ▶</Link>
              )}
              {item.sop && <ResourceLink label="Open SOP" url={item.sop} onEmbed={onEmbed} />}
              {item.links?.map((lnk) => (
                <ResourceLink key={lnk.url} label={lnk.label} url={lnk.url} onEmbed={onEmbed} />
              ))}
              {item.mods?.map((mod) => (
                <button key={mod.num} onClick={() => onModClick(mod.num - 1)} style={{
                  background: 'rgba(201,164,85,0.07)', border: '1px solid rgba(201,164,85,0.2)',
                  borderRadius: 100, padding: '4px 10px 4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '8px', color: 'rgba(201,164,85,0.45)' }}>{String(mod.num).padStart(2, '0')}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', color: 'rgba(201,164,85,0.75)' }}>{mod.title}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', color: 'rgba(201,164,85,0.35)' }}>▶</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Phase Tab ────────────────────────────────────────────────────────────────

function PhaseTab({ phase, active, locked, completedCount, onClick }: {
  phase: RoadmapPhase;
  active: boolean;
  locked: boolean;
  completedCount: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = active || (hovered && !locked);
  const pct = Math.round((completedCount / phase.items.length) * 100);

  return (
    <button
      onClick={() => { if (!locked) onClick(); }}
      disabled={locked}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'rgba(201,164,85,0.09)' : 'transparent',
        border: active ? '1px solid rgba(201,164,85,0.28)' : '1px solid rgba(201,164,85,0.1)',
        borderRadius: 100, padding: '7px 16px', cursor: locked ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s',
        position: 'relative', opacity: locked ? 0.4 : 1,
      }}
    >
      <span style={{
        fontFamily: 'ui-monospace, monospace', fontSize: '9px',
        color: lit ? 'rgba(201,164,85,0.55)' : 'rgba(201,164,85,0.22)',
        transition: 'color 0.2s',
      }}>{phase.num}</span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: '11px',
        fontWeight: active ? 600 : 400, letterSpacing: '0.08em',
        color: lit ? '#c9a455' : 'rgba(201,164,85,0.4)', transition: 'color 0.2s',
      }}>{phase.title}</span>
      {locked && <span style={{ fontSize: '9px' }}>🔒</span>}
      {!locked && pct === 100 && <span style={{ fontSize: '9px', color: '#4ade80' }}>✓</span>}
      {!locked && pct > 0 && pct < 100 && (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.45)' }}>{pct}%</span>
      )}
    </button>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '1rem' }}>
      <div style={{ flex: 1, height: 2, background: 'rgba(201,164,85,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: pct === 100 ? '#4ade80' : 'rgba(201,164,85,0.55)',
          borderRadius: 2, transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontFamily: 'ui-monospace, monospace', fontSize: '10px',
        color: pct === 100 ? '#4ade80' : 'rgba(201,164,85,0.5)',
        letterSpacing: '0.05em', flexShrink: 0, transition: 'color 0.3s',
      }}>
        {value}/{total}
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  // Tracked by id, not by object — which phase set is in play (standard vs
  // Creative Specialist) only lands once progress loads.
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [autoJumped, setAutoJumped] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [overrides, setOverrides] = useState<Record<string, { description: string | null; links: { label: string; url: string }[] }>>({});
  const [embed, setEmbed] = useState<{ url: string; title: string } | null>(null);
  const [recModal, setRecModal] = useState<{ label: string; category: string; match: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // "Acquisition" clients see an extra tab that swaps the phases for the
  // Acquisition Dashboard SOP wiki. Gated by the per-client feature flag.
  const [hasAcq, setHasAcq] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'roadmap' | 'acquisition'>('roadmap');
  const { completed, toggle, loaded, open, phases, total, variant } = useRoadmap();
  const activePhase: RoadmapPhase = phases.find((p) => p.id === activePhaseId) ?? phases[0];
  // Keep the floating quick-redirect pills clear of the corner FAB stack.
  const cornerClearance = useCornerClearance();

  useEffect(() => {
    const c = () => setIsMobile(window.innerWidth < 768);
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((u) => {
        if (!u) { router.push('/'); return; }
        setUserEmail(u.email);
        // Only ever GRANT admin here — never reset it. The /api/me/features call
        // below independently grants admin for the `acq_admin` tag, and these two
        // fetches race; a `setIsAdmin(false)` here would clobber that grant when
        // this response lands last (acq-admin's role is 'user'), hiding the
        // client picker + admin powers on the board.
        if (u.role === 'admin') setIsAdmin(true);
        setTimeout(() => setVisible(true), 80);
      })
      .catch(() => router.push('/'));
    // Admin-editable description/link overrides (merged into the static roadmap).
    fetch('/api/roadmap-content').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.overrides) setOverrides(d.overrides); }).catch(() => {});
    // Acquisition Dashboard access: tagged clients ('acquisition') and acq-admins
    // ('acq_admin') both get the tab; acq-admins additionally get admin powers.
    fetch('/api/me/features', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const f = Array.isArray(d?.features) ? d.features : [];
      const acq = f.includes('acquisition') || f.includes('acq_admin');
      if (acq) setHasAcq(true);
      if (f.includes('acq_admin')) setIsAdmin(true);
      // Deep link (e.g. from the Discord "tasks assigned" ping): /roadmap?view=acquisition
      if (acq && new URLSearchParams(window.location.search).get('view') === 'acquisition') {
        setView('acquisition');
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once progress loads, jump to the phase the client is currently working on.
  useEffect(() => {
    if (loaded && !autoJumped) {
      setActivePhaseId(getCurrentPhase([...completed], phases).id);
      setAutoJumped(true);
    }
  }, [loaded, autoJumped, completed, phases]);

  const toggleItem = async (itemId: string) => {
    const willComplete = !completed.has(itemId);
    if (willComplete) track('roadmap_complete', { itemId, email: userEmail, phase: activePhase.title });
    await toggle(itemId);
  };

  const handleModClick = (modIndex: number) => router.push(`/modules?m=${modIndex}`);

  const totalCompleted = completed.size;
  const phaseCompleted = (phase: RoadmapPhase) => phase.items.filter((i) => completed.has(i.id)).length;
  const activeIdx = phases.findIndex((p) => p.id === activePhase.id);
  const nextLocked = !open && activeIdx < phases.length - 1 && !isPhaseUnlocked(phases[activeIdx + 1].id, completed, phases);

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#050403' }}>
      <MeshBg speed={0.2} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)',
      }} />

      <button
        onClick={() => router.push('/select')}
        style={{
          position: 'fixed', top: 28, left: 32, zIndex: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          transition: 'color 0.2s', padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >← Menu</button>

      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        overflowY: 'auto',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        padding: '80px 28px 80px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.4em',
            textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.45)',
            marginBottom: hasAcq ? '1rem' : '0.5rem',
          }}>{view === 'acquisition' ? 'Acquisition' : variant === 'creative' ? 'Creative Specialist Roadmap' : 'Roadmap'}</p>

          {/* Roadmap ⇄ Acquisition Dashboard tab switch (acquisition clients only) */}
          {hasAcq && (
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: '1.5rem', borderRadius: 100, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.14)' }}>
              {([['roadmap', 'Roadmap'], ['acquisition', 'Acquisition Dashboard']] as const).map(([key, label]) => {
                const active = view === key;
                return (
                  <button key={key} onClick={() => setView(key)} style={{
                    padding: '7px 16px', borderRadius: 100, cursor: 'pointer', transition: 'all 0.18s',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    background: active ? 'rgba(201,164,85,0.14)' : 'transparent',
                    border: active ? '1px solid rgba(201,164,85,0.3)' : '1px solid transparent',
                    color: active ? '#c9a455' : 'rgba(201,164,85,0.45)',
                  }}>{label}</button>
                );
              })}
            </div>
          )}

          {view === 'roadmap' && (<>
          <div data-tour="roadmap-progress" style={{ maxWidth: 400, margin: '0 auto 1.5rem' }}>
            <ProgressBar value={totalCompleted} total={total} />
          </div>

          <div data-tour="roadmap-phases" style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {phases.map((ph) => (
              <PhaseTab
                key={ph.id}
                phase={ph}
                active={activePhase.id === ph.id}
                locked={!open && !isPhaseUnlocked(ph.id, completed, phases)}
                completedCount={phaseCompleted(ph)}
                onClick={() => setActivePhaseId(ph.id)}
              />
            ))}
          </div>
          </>)}
        </div>

        {view === 'acquisition' && <AcquisitionDashboard isAdmin={isAdmin} />}

        {/* Phase content */}
        {view === 'roadmap' && (
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{
            background: 'rgba(0,0,0,0.28)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(201,164,85,0.18)',
            borderRadius: 18, padding: '1.75rem 2rem', marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: '0.5rem' }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.35)', letterSpacing: '0.1em' }}>
                {activePhase.label}
              </span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.2)', letterSpacing: '0.1em' }}>
                {activePhase.items.length} steps
              </span>
            </div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300,
              color: '#f0e8d4', lineHeight: 1.15, margin: '0 0 0.4rem',
            }}>{activePhase.title}</h2>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
              color: 'rgba(240,232,212,0.58)', lineHeight: 1.6, margin: '0 0 0.25rem',
            }}>{activePhase.sub}</p>
            <ProgressBar value={phaseCompleted(activePhase)} total={activePhase.items.length} />
          </div>

          <div data-tour="roadmap-steps" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activePhase.items.map((item, i) => {
              const ov = overrides[item.id];
              const merged = ov
                ? { ...item, desc: ov.description ?? item.desc, links: (ov.links && ov.links.length) ? ov.links : item.links }
                : item;
              return (
              <ItemCard
                key={item.id}
                item={merged}
                index={i}
                completed={completed.has(item.id)}
                locked={!open && !isItemUnlocked(item.id, completed, phases)}
                canToggle={open || canToggleItem(item.id, completed, phases)}
                onToggle={() => toggleItem(item.id)}
                onModClick={handleModClick}
                onEmbed={(url, title) => setEmbed({ url, title })}
                onRecording={(rec) => setRecModal(rec)}
              />
              );
            })}
          </div>

          {/* Phase nav */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '2rem', paddingTop: '1.5rem',
            borderTop: '1px solid rgba(201,164,85,0.08)',
          }}>
            <button
              onClick={() => { if (activeIdx > 0) setActivePhaseId(phases[activeIdx - 1].id); }}
              disabled={activeIdx === 0}
              style={{
                background: 'none', border: 'none',
                cursor: activeIdx === 0 ? 'default' : 'pointer',
                color: activeIdx === 0 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.5)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', fontWeight: 600, padding: 0, transition: 'color 0.2s',
              }}
            >← Prev</button>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: 'rgba(201,164,85,0.25)', letterSpacing: '0.1em' }}>
              {activeIdx + 1} / {phases.length}
            </span>
            <button
              onClick={() => { if (activeIdx < phases.length - 1 && !nextLocked) setActivePhaseId(phases[activeIdx + 1].id); }}
              disabled={activeIdx === phases.length - 1 || nextLocked}
              title={nextLocked ? 'Finish this stage to unlock the next' : undefined}
              style={{
                background: 'none', border: 'none',
                cursor: (activeIdx === phases.length - 1 || nextLocked) ? 'default' : 'pointer',
                color: (activeIdx === phases.length - 1 || nextLocked) ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.5)',
                fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em',
                textTransform: 'uppercase', fontWeight: 600, padding: 0, transition: 'color 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >{nextLocked && <span style={{ fontSize: '10px' }}>🔒</span>}Next →</button>
          </div>

          {/* Mobile: quick redirects sit inline at the bottom (no floating overlap) */}
          {isMobile && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(201,164,85,0.08)' }}>
              {[{ label: 'Select screen', href: '/select' }, { label: 'Hub', href: '/hub' }].map((l) => (
                <Link key={l.href} href={l.href} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 999,
                  background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)',
                  color: '#c9a455', textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                }}>{l.label} →</Link>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Quick redirects — floating on desktop, inline (above) on mobile.
          Sit ABOVE the shared corner FABs (to-do / leaderboard) so they never
          overlap, adjusting automatically to however many are shown. */}
      {!isMobile && (
      <div style={{ position: 'fixed', right: 'clamp(14px, 3vw, 28px)', bottom: cornerClearance, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {[{ label: 'Go to Select screen', href: '/select' }, { label: 'Go to your Hub', href: '/hub' }].map((l) => (
          <Link key={l.href} href={l.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999,
            background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.32)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            color: '#c9a455', textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
            boxShadow: '0 6px 22px rgba(0,0,0,0.3)',
          }}>{l.label} →</Link>
        ))}
      </div>
      )}

      {embed && <EmbedModal url={embed.url} title={embed.title} onClose={() => setEmbed(null)} />}
      {recModal && <RecordingModal rec={recModal} onClose={() => setRecModal(null)} />}
      <PageTour id="roadmap" steps={ROADMAP_TOUR} />
    </main>
  );
}
