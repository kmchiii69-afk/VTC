'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Play, Check } from 'lucide-react';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';

// Sections from /modules, embedded inline in the onboarding wizard so clients
// can watch without leaving the flow. Kept in sync with the matching sections in
// lib/modules-data.ts (Vidalytics embedIds).
const OFFER_MODULES: { title: string; embedId: string }[] = [
  { title: 'Offer Pitch Deck', embedId: 'QhKG1YOJpddMIVGP' },
  { title: 'Bonuses and Guarantees', embedId: 'HUvweCrZa5KdsHOh' },
  { title: 'Pricing Your Offer (Group Call)', embedId: '8DFMlngQnU1eFPRc' },
  { title: 'Crafting an Irresistible Offer', embedId: 'JCahpOPa0Rbk6RnS' },
  { title: 'Product Market Fit', embedId: 'Y_sNmv8moXU9NqkJ' },
  { title: 'Cash Injection Actionables Checklist', embedId: '8HBCPSNcwo0dmimS' },
];

const MINDSET_MODULES: { title: string; embedId: string }[] = [
  { title: 'Mindset', embedId: 'C2wEZO_Mgb7MLcW2' },
  { title: 'Removing Limiting Beliefs To Make $151k/mo', embedId: 'EOQPKFSGQJkRf7ho' },
  { title: 'Break Your Old Identity', embedId: '0cZl3DFQbx95_3cy' },
  { title: 'Maximising Goh Consulting', embedId: 'jVqmwBo7_O479EkL' },
  { title: 'Nero Mastermind Call', embedId: 'Khfph1B95I88VARC' },
];

function VidalyticsPlayer({ embedId }: { embedId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const div = document.createElement('div');
    div.id = `vidalytics_embed_${embedId}`;
    div.style.width = '100%';
    div.style.position = 'relative';
    div.style.paddingTop = '56.25%';
    ref.current.appendChild(div);
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerHTML = `(function (v, i, d, a, l, y, t, c, s) {
      y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}var vl='Loader',vli=v[y][vl],vsl=v[c][vl + 'Script'],vlf=v[c][vl + 'Loaded'],ve='Embed';
      if (!vsl){vsl=function(u,cb){
          if(t){cb();return;}s=i.createElement("script");s.type="text/javascript";s.async=1;s.src=u;
          if(s.readyState){s.onreadystatechange=function(){if(s.readyState==="loaded"||s.readyState=="complete"){s.onreadystatechange=null;vlf=1;cb();}};}else{s.onload=function(){vlf=1;cb();};}
          i.getElementsByTagName("head")[0].appendChild(s);
      };}
      vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
    })(window, document, 'Vidalytics', 'vidalytics_embed_${embedId}', 'https://fast.vidalytics.com/embeds/Dyp2a1Oi/${embedId}/');`;
    ref.current.appendChild(script);
  }, [embedId]);
  return <div ref={ref} style={{ width: '100%' }} />;
}

// A titles-only list for one module section. Clicking a title opens that module
// in a pop-up video player (same Vidalytics player as /modules) over a blurred
// backdrop; a small back arrow at the top returns to the list to pick another.
// Opening a module marks it "watched" — when every module has been opened the
// onAllWatched callback fires (used to unlock the onboarding Continue button).
function ModulesEmbed({ modules, storageKey, onAllWatched }: { modules: { title: string; embedId: string }[]; storageKey?: string; onAllWatched?: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [watched, setWatched] = useState<Set<number>>(new Set());

  // Restore watched-set from localStorage on mount.
  useEffect(() => {
    setMounted(true);
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setWatched(new Set(JSON.parse(raw) as number[]));
    } catch { /* ignore */ }
  }, [storageKey]);

  // Notify the parent the moment every module has been opened (incl. on restore).
  useEffect(() => {
    if (watched.size >= modules.length && modules.length > 0) onAllWatched?.();
  }, [watched, modules.length, onAllWatched]);

  const openModule = (i: number) => {
    setActive(i);
    setWatched((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev).add(i);
      if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
  };

  const close = () => setActive(null);
  const open = active !== null ? modules[active] : null;

  const popup = open && (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(6,5,4,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 36px)' }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1000, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <button onClick={close} title="Back to modules" aria-label="Back to modules" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={17} />
          </button>
          <span className="font-serif" style={{ color: cream, fontSize: '1.05rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{open.title}</span>
        </div>
        <VidalyticsPlayer embedId={open.embedId} />
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modules.map((m, i) => {
          const seen = watched.has(i);
          return (
            <button
              key={m.embedId}
              onClick={() => openModule(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: `1px solid ${seen ? 'rgba(74,222,128,0.3)' : 'rgba(201,164,85,0.22)'}`, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.08)'; e.currentTarget.style.borderColor = 'rgba(201,164,85,0.45)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = seen ? 'rgba(74,222,128,0.3)' : 'rgba(201,164,85,0.22)'; }}
            >
              {/* number badge */}
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 30, height: 30, padding: '0 9px', borderRadius: 8, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.3)', color: G, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: cream, lineHeight: 1.35 }}>{m.title}</span>
              {/* play / watched indicator */}
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: seen ? 'rgba(74,222,128,0.14)' : 'rgba(201,164,85,0.1)', border: `1px solid ${seen ? 'rgba(74,222,128,0.45)' : 'rgba(201,164,85,0.3)'}` }}>
                {seen ? <Check size={14} style={{ color: '#4ade80' }} /> : <Play size={12} fill={G} strokeWidth={0} style={{ color: G, marginLeft: 1 }} />}
              </span>
            </button>
          );
        })}
      </div>
      {mounted && popup ? createPortal(popup, document.body) : null}
    </div>
  );
}

export function OfferModulesEmbed({ storageKey, onAllWatched }: { storageKey?: string; onAllWatched?: () => void } = {}) {
  return <ModulesEmbed modules={OFFER_MODULES} storageKey={storageKey} onAllWatched={onAllWatched} />;
}

export function MindsetModulesEmbed({ storageKey, onAllWatched }: { storageKey?: string; onAllWatched?: () => void } = {}) {
  return <ModulesEmbed modules={MINDSET_MODULES} storageKey={storageKey} onAllWatched={onAllWatched} />;
}

// Module counts, so callers can show "watched N/total" if desired.
export const OFFER_MODULE_COUNT = OFFER_MODULES.length;
export const MINDSET_MODULE_COUNT = MINDSET_MODULES.length;
