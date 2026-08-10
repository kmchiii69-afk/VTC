'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Check, FileText, ArrowRight } from 'lucide-react';
import { MeshBg } from '@/components/ui/mesh-bg';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';
import type { ModuleSection } from '@/lib/modules-data';
import { ResourceInline, type Resource } from '@/components/ui/resources-section';
import { ResourceLinkActions } from '@/components/ui/resource-link-actions';
import { BetaSidebar, BetaLessonView, BetaEditor } from '@/components/modules/ba-beta';
import type { BetaTree, BetaLesson } from '@/lib/ba-beta';
import { trackView } from '@/lib/track';

const MODULES_TOUR: TourStep[] = [
  { title: 'Your training library', body: "Every module lives here. Here's how to find your way around." },
  { target: 'modules-list', title: 'Browse modules', body: 'Modules are grouped by section in this sidebar — tap any one to load it.' },
  { target: 'modules-player', title: 'Watch here', body: 'The selected module plays here. Use Previous / Next at the bottom to move through them in order.' },
];

const G = '#c9a455';

// Placeholder that holds a sidebar list's place while its catalog is in flight.
const sidebarLoading: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'rgba(240,232,212,0.3)', padding: '14px 20px',
};

interface FlatModule {
  id: string;
  num: number;
  title: string;
  embedId: string;
  section: string;
  sectionId: string;
}

function flatten(sections: ModuleSection[]): FlatModule[] {
  const out: FlatModule[] = [];
  let n = 0;
  for (const s of sections) {
    for (const it of s.items) {
      n += 1;
      out.push({ id: it.id, num: n, title: it.title, embedId: it.embed_id, section: s.name, sectionId: s.id });
    }
  }
  return out;
}

// ─── Video Player ──────────────────────────────────────────────────────────────

function VideoPlayer({ embedId }: { embedId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    if (!embedId) return;

    const div = document.createElement('div');
    div.id = `vidalytics_embed_${embedId}`;
    div.style.width = '100%';
    div.style.position = 'relative';
    div.style.paddingTop = '56.25%';
    containerRef.current.appendChild(div);

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
    containerRef.current.appendChild(script);
  }, [embedId]);

  if (!embedId) {
    return (
      <div style={{ width: '100%', paddingTop: '56.25%', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
          No video attached yet.
        </div>
      </div>
    );
  }
  return <div ref={containerRef} style={{ width: '100%' }} />;
}

// ─── Attached resource ───────────────────────────────────────────────────────
// Some modules have a companion in-app doc/resource (same one used in the
// onboarding wizard). Keyed by module title → resource slug.
const MODULE_RESOURCE_SLUGS: Record<string, string> = {
  'product market fit': 'market-research',
  'offer pitch deck': 'offer-doc',
};

// Pill button below the module video that opens the matching resource (markdown
// + template "make your copy"/upload) in a popup — reusing the exact resource
// shown in the onboarding wizard.
function ModuleResource({ slug }: { slug: string }) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/resources/${slug}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.resource) setResource(d.resource); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  // Lock body scroll while the popup is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!resource) return null;

  // The underlying document, if the resource is backed by one — that's what the
  // popup header's Download / Open actions point at.
  const docUrl = (resource.type === 'embed' ? resource.embed_url : resource.template_url) || '';

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 999,
          padding: '10px 18px', color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500,
          transition: 'all 0.18s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.5)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.14)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.28)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.08)'; }}
      >
        <FileText size={15} color={G} />
        {resource.title}
        <ArrowRight size={14} color="rgba(201,164,85,0.6)" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 420, background: 'rgba(6,5,4,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 40px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(20,16,9,0.97)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 20, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(201,164,85,0.14)', flexShrink: 0 }}>
              <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.25rem', fontWeight: 300, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
              {docUrl && <ResourceLinkActions url={docUrl} title={resource.title} />}
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, cursor: 'pointer', flexShrink: 0 }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 22 }}>
              <ResourceInline resource={resource} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Last lesson (resume) ─────────────────────────────────────────────────────
// Remember which lesson you were on so reopening /modules — new tab, new day,
// fresh browser session — lands back on it instead of jumping to lesson one.
// GET a JSON payload, retrying a dropped request instead of giving up on it.
// One failed request used to blank the whole library for that page load — and,
// for /api/auth/me, silently downgrade an admin to the member view, which is
// what made the fuller category list come and go between loads.
async function fetchJsonRetry<T>(url: string, tries = 3): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return (await r.json()) as T;
    } catch { /* offline / aborted — fall through to the retry */ }
    if (attempt < tries - 1) await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return null;
}

const LAST_LESSON_KEY = 'goh:modules:last-lesson';
const readLastLesson = (): string | null => {
  try { return localStorage.getItem(LAST_LESSON_KEY); } catch { return null; }
};
const rememberLesson = (id: string) => {
  try { localStorage.setItem(LAST_LESSON_KEY, id); } catch { /* private mode */ }
};

// ─── Main Page ────────────────────────────────────────────────────────────────

function ModulesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);
  // We couldn't establish who's signed in. This decides WHICH catalog renders,
  // so guessing "member" on a failed call is what made the fuller category list
  // come and go for admins. Show a retry instead of the wrong library.
  const [roleError, setRoleError] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  // VTC Beta — admin-only sandbox catalog layered on top of /modules.
  // We track only the selected lesson id and resolve the live lesson from the
  // tree on render, so edits/deletes reflect without a state-sync effect.
  const [betaTree, setBetaTree] = useState<BetaTree | null>(null);
  const [betaSelId, setBetaSelId] = useState<string | null>(null);
  const [betaEditorOpen, setBetaEditorOpen] = useState(false);
  // The catalog fetch failed after retries. Kept separate from "loaded and
  // empty" — telling someone they have no modules when the request just failed
  // is what made the library look like it came and went.
  const [betaError, setBetaError] = useState(false);

  // Catalog. Starts EMPTY, never with the built-in seed defaults: painting those
  // while /api/modules is still in flight flashed the old VTC 2.0 list
  // into the sidebar for a frame, then swapped it for the live one.
  const [sections, setSections] = useState<ModuleSection[]>([]);
  // Whether the live catalog is DB-backed. Comes from the API — inferring it from
  // synthetic `default-` ids stopped working once we start out empty.
  const [catalogPersisted, setCatalogPersisted] = useState(true);
  const allModules = flatten(sections);

  const [activeIndex, setActiveIndex] = useState(() => {
    const raw = parseInt(searchParams.get('m') ?? '0', 10) || 0;
    return Math.max(0, raw);
  });
  // Admin only: they've navigated into the VTC program catalog, so a
  // VTC load failure shouldn't take that view over.
  const [programSelected, setProgramSelected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const idResolved = useRef(false);   // ?id= deep-link applied once, after catalog load
  const trackedId = useRef<string | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [programError, setProgramError] = useState(false);

  // Same retry as the VTC catalog below: nothing renders in the
  // program list until this lands, because the built-in seed defaults are a
  // DIFFERENT module list than the live one — the admin-side version of "the
  // topics changed between loads". programError says so out loud instead.
  const load = async (): Promise<void> => {
    setProgramError(false);
    const d = await fetchJsonRetry<{ sections?: ModuleSection[]; persisted?: boolean }>('/api/modules');
    if (d?.sections) { setSections(d.sections); setCatalogPersisted(d.persisted !== false); }
    else setProgramError(true);
    setCatalogLoaded(true);
  };

  // VTC catalog. Members read it via /api/modules/beta (the admin
  // endpoint 403s for them); it's what members now see in place of the Goh
  // Consulting program catalog. Admins load it too — they keep both catalogs.
  // Retried, because a single failed request used to empty the whole library
  // until the next page load.
  const loadBeta = async (): Promise<void> => {
    setBetaError(false);
    const d = await fetchJsonRetry<BetaTree>('/api/modules/beta');
    if (d?.categories) setBetaTree(d);
    else setBetaError(true);
  };

  // Which catalog you see hangs off this, so a failure is reported rather than
  // resolved to a default.
  const loadRole = async (): Promise<void> => {
    setRoleError(false);
    const u = await fetchJsonRetry<{ role?: string }>('/api/auth/me');
    if (u) setIsAdmin(u.role === 'admin');
    else setRoleError(true);
    setRoleResolved(true);
  };

  const retryAll = () => { loadRole(); loadBeta(); if (programError) load(); };

  useEffect(() => {
    setAuthed(true);
    setTimeout(() => setVisible(true), 80);
    load();
    loadBeta();
    loadRole();
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the selected beta lesson from the live tree (null if none/deleted).
  let betaSel: { lesson: BetaLesson; categoryName: string } | null = null;
  if (betaSelId && betaTree) {
    for (const c of betaTree.categories) {
      const l = c.lessons.find((x) => x.id === betaSelId);
      if (l) { betaSel = { lesson: l, categoryName: c.name }; break; }
    }
  }

  // Members now see the VTC catalog only; the VTC program
  // catalog is hidden from them (admins still see + manage both). Gate on
  // roleResolved so admins never flash the member-only view before /me returns.
  // roleError guards this: an unresolved role must not silently mean "member",
  // which would hide every lesson that has no video from an admin.
  const isMember = roleResolved && !roleError && !isAdmin;

  // Members only see lessons that actually have a video attached — a lesson with
  // no embed is hidden from them (and any category left empty drops out too)
  // until a video is added. Admins keep seeing every lesson so they can add the
  // videos in the first place.
  // Still fetching the VTC catalog. Distinct from "loaded and empty":
  // rendering the empty-state sidebar in the meantime told people they had no
  // modules a frame before their modules arrived.
  const betaLoading = betaTree === null && !betaError;

  const hasVideo = (embedId?: string) => !!(embedId && embedId.trim());
  const visibleTree: BetaTree | null = !betaTree
    ? null
    : isMember
    ? {
        ...betaTree,
        categories: betaTree.categories
          .map((c) => ({ ...c, lessons: c.lessons.filter((l) => hasVideo(l.embed_id)) }))
          .filter((c) => c.lessons.length > 0),
      }
    : betaTree;

  // Flattened visible lessons in catalog order — powers the default selection,
  // Prev / Next, and the header count.
  const betaFlat: { lesson: BetaLesson; categoryName: string }[] = [];
  if (visibleTree) for (const c of visibleTree.categories) for (const l of c.lessons) betaFlat.push({ lesson: l, categoryName: c.name });
  const betaIndex = betaSelId ? betaFlat.findIndex((x) => x.lesson.id === betaSelId) : -1;

  // Gate the main content until we KNOW which catalog to show — otherwise the
  // VTC program's first module (from the seed defaults) flashes for a
  // frame before the VTC default lands. Ready once: a beta lesson is
  // selected, OR an admin deep-linked to a program module, OR the beta catalog
  // has loaded and is genuinely empty.
  const programDeepLink = isAdmin && (searchParams.get('m') !== null || searchParams.get('id') !== null);
  const betaEmpty = betaTree !== null && betaFlat.length === 0;
  // The failure flags are part of "ready" or a failed load spins forever, and so
  // is programSelected — an admin clicking into the program catalog clears
  // betaSelId, which otherwise dropped them back to the spinner.
  const viewReady = roleResolved && (betaSelId !== null || programSelected || programDeepLink || betaEmpty || betaError || roleError);

  // Open the right lesson, in priority order: a ?id= deep link (what the resume
  // links in /select and the welcome-back card point at), then the lesson you
  // were last on, then the first one — so nobody auto-lands on a VTC
  // module. Runs once (a ref, not `!betaSelId`) so admins can then click a
  // program module without being yanked back. Admins arriving via a program
  // deep-link (?m= / ?id=) keep it.
  const betaDefaulted = useRef(false);
  useEffect(() => {
    if (betaDefaulted.current || !roleResolved || !betaFlat.length) return;
    betaDefaulted.current = true;
    const programDeepLink = isAdmin && (searchParams.get('m') !== null || searchParams.get('id') !== null);
    // ?id= carries a module id from either catalog — whichever one holds it wins,
    // so a member's resume link resolves here even though ?m= is program-only.
    const wanted = searchParams.get('id') || (programDeepLink ? null : readLastLesson());
    const match = wanted ? betaFlat.find((x) => x.lesson.id === wanted) : undefined;
    if (match) { setBetaSelId(match.lesson.id); return; }
    if (!programDeepLink) setBetaSelId(betaFlat[0].lesson.id);
  }, [roleResolved, isAdmin, betaFlat.length, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log member beta-lesson views to the journey timeline (resume support).
  useEffect(() => {
    if (!isMember || !betaSel || trackedId.current === betaSel.lesson.id) return;
    trackedId.current = betaSel.lesson.id;
    trackView('module_view', betaSel.lesson.id, betaSel.lesson.title);
  }, [isMember, betaSel?.lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active index in range as the catalog changes.
  const safeIndex = Math.min(activeIndex, Math.max(0, allModules.length - 1));
  const activeMod = allModules[safeIndex];

  useEffect(() => {
    if (!sidebarRef.current) return;
    const el = sidebarRef.current.querySelector(`[data-idx="${safeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [safeIndex]);

  // Resume-by-id: journey events store a module's id (not its index), so support
  // /modules?id=<moduleId>. Applied once, after the LIVE catalog loads (resolving
  // against seed defaults could mis-match an admin-edited catalog).
  useEffect(() => {
    if (idResolved.current || !catalogLoaded) return;
    idResolved.current = true;
    const id = searchParams.get('id');
    if (!id) return;
    const i = allModules.findIndex((m) => m.id === id);
    if (i >= 0) setActiveIndex(i);
  }, [catalogLoaded, allModules, searchParams]);

  // Log a module view to the journey timeline (drives "resume where you left
  // off"). Deduped per module id per page-load by trackView + the server window.
  useEffect(() => {
    if (isMember) return; // members view the beta catalog, tracked separately below
    if (!activeMod?.id || trackedId.current === activeMod.id) return;
    trackedId.current = activeMod.id;
    trackView('module_view', activeMod.id, activeMod.title);
  }, [isMember, activeMod?.id, activeMod?.title]);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= allModules.length) return;
    setBetaSelId(null); // leaving the beta view back to the core catalog
    setProgramSelected(true);
    setActiveIndex(idx);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectBeta = (lesson: BetaLesson) => {
    setBetaSelId(lesson.id);
    rememberLesson(lesson.id);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!authed) return null;

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#050403' }}>
      <MeshBg speed={0.2} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 70% at 50% 50%, rgba(5,4,3,0.45) 0%, transparent 100%)',
      }} />

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 25, background: 'rgba(0,0,0,0.6)' }} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        data-tour="modules-list"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 300,
          background: 'rgba(5,4,3,0.78)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          borderRight: '1px solid rgba(201,164,85,0.1)', zIndex: 30, overflowY: 'auto',
          transform: isMobile && !sidebarOpen ? 'translateX(-300px)' : 'translateX(0)',
          transition: 'transform 0.3s ease', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(201,164,85,0.08)', flexShrink: 0 }}>
          <button
            onClick={() => router.push('/select')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,164,85,0.45)',
              fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase',
              fontWeight: 600, padding: 0, transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.45)')}
          >
            ← Menu
          </button>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.35em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.35)', marginBottom: 4 }}>
            VTC
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'rgba(201,164,85,0.4)' }}>
            {/* No count until the catalog lands — "0 modules" for a frame reads
                as an empty library rather than a loading one. */}
            {visibleTree ? `${betaFlat.length} modules` : ' '}
          </p>
        </div>

        <div style={{ flex: 1, padding: '8px 0 24px' }}>
          {/* Members see the VTC catalog as their whole library.
              Admins keep the editable VTC Beta copy at the TOP, then
              the VTC program catalog under a "Program Modules" heading. */}
          {isMember && (betaLoading ? (
            <p style={sidebarLoading}>Loading…</p>
          ) : (
            <BetaSidebar
              memberView
              tree={visibleTree}
              selectedId={betaSelId}
              onSelect={selectBeta}
              onManage={() => {}}
            />
          ))}
          {isAdmin && (
            <>
              {betaLoading ? (
                <p style={sidebarLoading}>Loading…</p>
              ) : (
                <BetaSidebar
                  atTop
                  tree={visibleTree}
                  selectedId={betaSelId}
                  onSelect={selectBeta}
                  onManage={() => setBetaEditorOpen(true)}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 20px 2px' }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.26em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(201,164,85,0.65)', margin: 0 }}>
                  Program Modules
                </p>
                <button
                  onClick={() => setEditorOpen(true)}
                  title="Manage program modules"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 7, padding: '4px 9px', color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Pencil size={11} /> Manage
                </button>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.05em', color: 'rgba(201,164,85,0.3)', padding: '0 20px 4px', textTransform: 'uppercase', fontWeight: 600 }}>
                Not shown to members
              </p>
              {programError && (
                <button
                  onClick={() => load()}
                  style={{ margin: '4px 20px 6px', width: 'calc(100% - 40px)', textAlign: 'left', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '7px 10px', color: '#fca5a5', fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, lineHeight: 1.45, cursor: 'pointer' }}
                >
                  Couldn&apos;t load the program list. Tap to retry.
                </button>
              )}
              {!catalogLoaded && !programError && <p style={sidebarLoading}>Loading…</p>}
              {sections.map((sec) => (
            <div key={sec.id}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.3)', padding: '16px 20px 6px' }}>
                {sec.name}
              </p>
              {sec.items.map((m) => {
                const mod = allModules.find((x) => x.id === m.id);
                if (!mod) return null;
                const isActive = mod.num - 1 === safeIndex;
                return (
                  <button
                    key={mod.id}
                    data-idx={mod.num - 1}
                    onClick={() => goTo(mod.num - 1)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: isActive ? 'rgba(201,164,85,0.08)' : 'none', border: 'none',
                      borderLeft: isActive ? '2px solid rgba(201,164,85,0.6)' : '2px solid transparent',
                      padding: '9px 20px 9px 18px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.04)'; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '9px', color: isActive ? 'rgba(201,164,85,0.6)' : 'rgba(201,164,85,0.2)', flexShrink: 0, letterSpacing: '0.05em', transition: 'color 0.15s' }}>
                      {String(mod.num).padStart(2, '0')}
                    </span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', lineHeight: 1.4, color: isActive ? 'rgba(240,232,212,0.9)' : 'rgba(240,232,212,0.6)', fontWeight: isActive ? 500 : 400, transition: 'color 0.15s' }}>
                      {mod.title}
                    </span>
                  </button>
                );
              })}
            </div>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, marginLeft: isMobile ? 0 : 300, overflowY: 'auto',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        <div style={{
          display: isMobile ? 'flex' : 'none', position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(5,4,3,0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(201,164,85,0.08)', padding: '14px 20px', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.1em' }}>
            ☰ Modules
          </button>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(201,164,85,0.35)' }}>
            {betaSel
              ? `${betaFlat.length ? betaIndex + 1 : 0} / ${betaFlat.length}`
              : `${allModules.length ? safeIndex + 1 : 0} / ${allModules.length}`}
          </span>
        </div>

        <div style={{ padding: isMobile ? '20px 20px 60px' : '40px 40px 60px', maxWidth: 960, margin: '0 auto' }}>
          {!viewReady ? (
            <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
              <span className="goh-spinner" style={{ width: 26, height: 26 }} />
            </div>
          ) : (betaError || roleError) && !(programDeepLink || programSelected) ? (
            <div style={{ padding: '70px 0', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
              <p style={{ color: 'rgba(240,232,212,0.75)', fontSize: 14, marginBottom: 6 }}>
                Your modules didn&apos;t load.
              </p>
              <p style={{ color: 'rgba(240,232,212,0.4)', fontSize: 12.5, marginBottom: 18 }}>
                Nothing has been removed — the connection dropped. Try again.
              </p>
              <button
                onClick={retryAll}
                style={{ background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.32)', borderRadius: 10, padding: '10px 22px', color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          ) : betaSel ? (
            <>
              <BetaLessonView lesson={betaSel.lesson} categoryName={betaSel.categoryName} />
              {betaFlat.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderTop: '1px solid rgba(201,164,85,0.08)' }}>
                  <button
                    onClick={() => { if (betaIndex > 0) selectBeta(betaFlat[betaIndex - 1].lesson); }}
                    disabled={betaIndex <= 0}
                    style={{ background: 'none', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 10, padding: '10px 20px', cursor: betaIndex <= 0 ? 'default' : 'pointer', color: betaIndex <= 0 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, opacity: betaIndex <= 0 ? 0.4 : 1 }}
                  >
                    ← Previous
                  </button>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(201,164,85,0.25)', letterSpacing: '0.1em' }}>
                    {betaIndex + 1} / {betaFlat.length}
                  </span>
                  <button
                    onClick={() => { if (betaIndex < betaFlat.length - 1) selectBeta(betaFlat[betaIndex + 1].lesson); }}
                    disabled={betaIndex >= betaFlat.length - 1}
                    style={{ background: betaIndex < betaFlat.length - 1 ? 'rgba(201,164,85,0.08)' : 'none', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10, padding: '10px 20px', cursor: betaIndex >= betaFlat.length - 1 ? 'default' : 'pointer', color: betaIndex >= betaFlat.length - 1 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.8)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, opacity: betaIndex >= betaFlat.length - 1 ? 0.4 : 1 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          ) : isMember ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              No modules yet.
            </div>
          ) : !catalogLoaded ? (
            // Admin landing straight in the program catalog (deep link) — wait for
            // the live list rather than showing "No modules yet" against an
            // unloaded one.
            <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
              <span className="goh-spinner" style={{ width: 26, height: 26 }} />
            </div>
          ) : !activeMod ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
              No modules yet.{isAdmin ? ' Use “Manage modules” to add the first one.' : ''}
            </div>
          ) : (
            <>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.35)', fontWeight: 700, marginBottom: '0.75rem' }}>
                {activeMod.section}
              </p>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: '1.5rem' }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: 'rgba(201,164,85,0.3)', letterSpacing: '0.08em', flexShrink: 0 }}>
                  {String(activeMod.num).padStart(2, '0')}
                </span>
                <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300, color: '#f0e8d4', lineHeight: 1.15, margin: 0 }}>
                  {activeMod.title}
                </h1>
              </div>

              <div data-tour="modules-player" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <VideoPlayer embedId={activeMod.embedId} />
              </div>

              {MODULE_RESOURCE_SLUGS[activeMod.title.trim().toLowerCase()] && (
                <ModuleResource slug={MODULE_RESOURCE_SLUGS[activeMod.title.trim().toLowerCase()]} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', borderTop: '1px solid rgba(201,164,85,0.08)' }}>
                <button
                  onClick={() => goTo(safeIndex - 1)}
                  disabled={safeIndex === 0}
                  style={{ background: 'none', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 10, padding: '10px 20px', cursor: safeIndex === 0 ? 'default' : 'pointer', color: safeIndex === 0 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, transition: 'all 0.2s', opacity: safeIndex === 0 ? 0.4 : 1 }}
                  onMouseEnter={(e) => { if (safeIndex > 0) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a455'; } }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = safeIndex === 0 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.6)'; }}
                >
                  ← Previous
                </button>

                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(201,164,85,0.25)', letterSpacing: '0.1em' }}>
                  {safeIndex + 1} / {allModules.length}
                </span>

                <button
                  onClick={() => goTo(safeIndex + 1)}
                  disabled={safeIndex >= allModules.length - 1}
                  style={{ background: safeIndex < allModules.length - 1 ? 'rgba(201,164,85,0.08)' : 'none', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10, padding: '10px 20px', cursor: safeIndex >= allModules.length - 1 ? 'default' : 'pointer', color: safeIndex >= allModules.length - 1 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.8)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, transition: 'all 0.2s', opacity: safeIndex >= allModules.length - 1 ? 0.4 : 1 }}
                  onMouseEnter={(e) => { if (safeIndex < allModules.length - 1) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a455'; } }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = safeIndex < allModules.length - 1 ? 'rgba(201,164,85,0.08)' : 'none'; (e.currentTarget as HTMLButtonElement).style.color = safeIndex >= allModules.length - 1 ? 'rgba(201,164,85,0.15)' : 'rgba(201,164,85,0.8)'; }}
                >
                  Next →
                </button>
              </div>

              {safeIndex < allModules.length - 1 && (
                <button
                  onClick={() => goTo(safeIndex + 1)}
                  style={{ width: '100%', textAlign: 'left', background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.1)', borderRadius: 14, padding: '1rem 1.25rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.28)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.06)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,164,85,0.1)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.2)'; }}
                >
                  <div>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.35)', fontWeight: 700, marginBottom: 4 }}>
                      Up Next
                    </p>
                    <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.1rem', fontWeight: 300, color: 'rgba(240,232,212,0.75)', margin: 0 }}>
                      {allModules[safeIndex + 1].title}
                    </p>
                  </div>
                  <span style={{ color: 'rgba(201,164,85,0.4)', fontSize: '18px', flexShrink: 0 }}>→</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {isAdmin && editorOpen && (
        <ModulesEditor sections={sections} persisted={catalogPersisted} onChanged={load} onClose={() => setEditorOpen(false)} />
      )}

      {isAdmin && betaEditorOpen && (
        <BetaEditor tree={betaTree} onChanged={loadBeta} onClose={() => setBetaEditorOpen(false)} />
      )}

      <PageTour id="modules" steps={MODULES_TOUR} />
    </main>
  );
}

// ─── Admin editor overlay ───────────────────────────────────────────────────────

function ModulesEditor({ sections, persisted, onChanged, onClose }: { sections: ModuleSection[]; persisted: boolean; onChanged: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newSection, setNewSection] = useState('');

  const run = async (fn: () => Promise<Response | null>) => {
    setBusy(true); setErr('');
    try {
      const res = await fn();
      if (res && !res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || 'Action failed'); }
      else await onChanged();
    } catch { setErr('Something went wrong'); }
    finally { setBusy(false); }
  };
  const api = (method: string, url: string, body?: unknown) =>
    fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });

  const addSection = () => { const name = newSection.trim(); if (!name) return; run(() => api('POST', '/api/admin/modules/sections', { name }).then((r) => { setNewSection(''); return r; })); };
  const renameSection = (id: string, name: string) => run(() => api('PATCH', `/api/admin/modules/sections/${id}`, { name }));
  const deleteSection = (id: string, name: string) => { if (!confirm(`Delete category “${name}” and all its modules? This can't be undone.`)) return; run(() => api('DELETE', `/api/admin/modules/sections/${id}`)); };
  const addItem = (sectionId: string, title: string, embedId: string) => run(() => api('POST', '/api/admin/modules/items', { section_id: sectionId, title, embed_id: embedId }));
  const editItem = (id: string, title: string, embedId: string) => run(() => api('PATCH', `/api/admin/modules/items/${id}`, { title, embed_id: embedId }));
  const deleteItem = (id: string, title: string) => { if (!confirm(`Delete module “${title}”?`)) return; run(() => api('DELETE', `/api/admin/modules/items/${id}`)); };

  // Swap sort_order with the neighbour in the given direction.
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= sections.length) return;
    const a = sections[i], b = sections[j];
    run(async () => { await api('PATCH', `/api/admin/modules/sections/${a.id}`, { sort_order: b.sort_order }); return api('PATCH', `/api/admin/modules/sections/${b.id}`, { sort_order: a.sort_order }); });
  };
  const moveItem = (sec: ModuleSection, i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= sec.items.length) return;
    const a = sec.items[i], b = sec.items[j];
    run(async () => { await api('PATCH', `/api/admin/modules/items/${a.id}`, { sort_order: b.sort_order }); return api('PATCH', `/api/admin/modules/items/${b.id}`, { sort_order: a.sort_order }); });
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(6,5,4,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px,3vw,40px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <div className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.25rem', fontWeight: 300 }}>Manage modules</div>
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!persisted && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>
              Showing the built-in defaults. Run <code>supabase-modules.sql</code> in Supabase to enable editing — saves will fail until then.
            </div>
          )}
          {err && <div style={{ fontSize: 12.5, color: '#ef4444', fontFamily: "'DM Sans', sans-serif" }}>{err}</div>}

          {sections.map((sec, si) => (
            <SectionEditor
              key={sec.id} sec={sec} index={si} total={sections.length} busy={busy}
              onRename={(name) => renameSection(sec.id, name)}
              onDelete={() => deleteSection(sec.id, sec.name)}
              onMove={(dir) => moveSection(si, dir)}
              onAddItem={(t, e) => addItem(sec.id, t, e)}
              onEditItem={(id, t, e) => editItem(id, t, e)}
              onDeleteItem={(id, t) => deleteItem(id, t)}
              onMoveItem={(i, dir) => moveItem(sec, i, dir)}
            />
          ))}

          {/* Add category */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 16 }}>
            <input value={newSection} onChange={(e) => setNewSection(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSection()} placeholder="New category name" style={editorInput} />
            <button onClick={addSection} disabled={busy || !newSection.trim()} style={{ ...editorBtnPrimary, opacity: busy || !newSection.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Add category
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionEditor({ sec, index, total, busy, onRename, onDelete, onMove, onAddItem, onEditItem, onDeleteItem, onMoveItem }: {
  sec: ModuleSection; index: number; total: number; busy: boolean;
  onRename: (name: string) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
  onAddItem: (title: string, embedId: string) => void;
  onEditItem: (id: string, title: string, embedId: string) => void;
  onDeleteItem: (id: string, title: string) => void;
  onMoveItem: (i: number, dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(sec.name);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmbed, setNewEmbed] = useState('');

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 14, padding: '14px 16px' }}>
      {/* Category header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== sec.name) onRename(name.trim()); }}
          style={{ ...editorInput, fontWeight: 700, letterSpacing: '0.04em', color: G, flex: 1 }}
        />
        <IconBtn title="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}><ChevronUp size={15} /></IconBtn>
        <IconBtn title="Move down" disabled={busy || index === total - 1} onClick={() => onMove(1)}><ChevronDown size={15} /></IconBtn>
        <IconBtn title="Delete category" disabled={busy} danger onClick={onDelete}><Trash2 size={14} /></IconBtn>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sec.items.map((it, i) => (
          <ItemRow key={it.id} item={it} index={i} count={sec.items.length} busy={busy}
            onSave={(t, e) => onEditItem(it.id, t, e)} onDelete={() => onDeleteItem(it.id, it.title)} onMove={(dir) => onMoveItem(i, dir)} />
        ))}
      </div>

      {/* Add module */}
      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,164,85,0.1)' }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Module title" style={editorInput} />
          <input value={newEmbed} onChange={(e) => setNewEmbed(e.target.value)} placeholder="Vidalytics embed ID (e.g. 6Llqml3sawJeP184)" style={{ ...editorInput, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || !newTitle.trim()} onClick={() => { onAddItem(newTitle.trim(), newEmbed.trim()); setNewTitle(''); setNewEmbed(''); setAdding(false); }} style={{ ...editorBtnPrimary, opacity: busy || !newTitle.trim() ? 0.5 : 1 }}>Add</button>
            <button onClick={() => { setAdding(false); setNewTitle(''); setNewEmbed(''); }} style={editorBtnGhost}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed rgba(201,164,85,0.25)', borderRadius: 8, padding: '7px 12px', color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, cursor: 'pointer' }}>
          <Plus size={13} /> Add module
        </button>
      )}
    </div>
  );
}

function ItemRow({ item, index, count, busy, onSave, onDelete, onMove }: {
  item: { id: string; title: string; embed_id: string }; index: number; count: number; busy: boolean;
  onSave: (title: string, embedId: string) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [embed, setEmbed] = useState(item.embed_id);
  const startEdit = () => { setTitle(item.title); setEmbed(item.embed_id); setEditing(true); };

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,164,85,0.14)' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={editorInput} />
        <input value={embed} onChange={(e) => setEmbed(e.target.value)} placeholder="Vidalytics embed ID" style={{ ...editorInput, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy || !title.trim()} onClick={() => { onSave(title.trim(), embed.trim()); setEditing(false); }} style={{ ...editorBtnPrimary, opacity: busy || !title.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={13} /> Save</button>
          <button onClick={() => { setEditing(false); setTitle(item.title); setEmbed(item.embed_id); }} style={editorBtnGhost}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.015)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#e9e0cc', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
      {!item.embed_id && <span style={{ fontSize: 9, color: 'rgba(239,68,68,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>no video</span>}
      <IconBtn title="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} /></IconBtn>
      <IconBtn title="Move down" disabled={busy || index === count - 1} onClick={() => onMove(1)}><ChevronDown size={14} /></IconBtn>
      <IconBtn title="Edit" disabled={busy} onClick={startEdit}><Pencil size={13} /></IconBtn>
      <IconBtn title="Delete" disabled={busy} danger onClick={onDelete}><Trash2 size={13} /></IconBtn>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
      background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
      color: danger ? 'rgba(239,68,68,0.75)' : 'rgba(201,164,85,0.7)', opacity: disabled ? 0.35 : 1,
    }}>{children}</button>
  );
}

const editorInput: React.CSSProperties = {
  padding: '8px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)',
  borderRadius: 8, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box', flex: 1, minWidth: 0,
};
const editorBtnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.32)',
  borderRadius: 8, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const editorBtnGhost: React.CSSProperties = {
  padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
};

export default function ModulesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050403' }} />}>
      <ModulesInner />
    </Suspense>
  );
}
