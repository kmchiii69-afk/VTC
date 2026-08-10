'use client';

import { useState, useEffect } from 'react';
import { Markdown } from '@/components/ui/markdown';
import { ACQ_ROOT_ID, getAcqPage } from '@/lib/acquisition-data';
import { acqEditKind, acqAdminEditable, type AcqData, type AcqAdminData } from '@/lib/acquisition-config';
import { EditablePage, AdminContentView, AdminSectionEditor } from '@/components/ui/acquisition-editors';
import { TodoManager } from '@/components/ui/todo-manager';
import { AcquisitionRoadmap } from '@/components/ui/acquisition-roadmap';

// Self-contained, navigable render of the "Acquisition Dashboard" SOP wiki
// (baked from the client's Notion export — see lib/acquisition-data.ts). Shown
// as a gated tab inside /roadmap for clients tagged "acquisition".

const GOLD = '#c9a455';
const CREAM = '#f0e8d4';
const CASH_ID = '38f7eccd40c080daa49bf4020cd8d165'; // Cash Tracker page id
// The baked "Roadmap" page (under Personal SOP's) is repurposed as "Actionables":
// a to-do list the coach assigns and the client can add to themselves.
const ACTIONABLES_ID = '38f7eccd40c080688f05f1ab77f06932';
const ACTIONABLES_LABEL = 'Actionables';

const glass: React.CSSProperties = {
  background: 'rgba(0,0,0,0.28)',
  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(201,164,85,0.18)',
  borderRadius: 18,
};

const resourcePill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9,
  background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)',
  color: GOLD, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

// In-app popup that iframes an embeddable resource (e.g. a Miro board), with an
// "open in new tab" fallback for anything that refuses to be framed.
function EmbedModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, height: '88vh', display: 'flex', flexDirection: 'column', background: '#0a0806', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <span className="font-serif" style={{ color: CREAM, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: GOLD, textDecoration: 'none' }}>Open in new tab ↗</a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <iframe src={url} allow="fullscreen" style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
      </div>
    </div>
  );
}

function NavCard({ label, onClick }: { label: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        textAlign: 'left', cursor: 'pointer', width: '100%',
        background: h ? 'rgba(201,164,85,0.08)' : 'rgba(0,0,0,0.22)',
        border: `1px solid ${h ? 'rgba(201,164,85,0.32)' : 'rgba(201,164,85,0.12)'}`,
        borderRadius: 12, padding: '0.85rem 1.05rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        transition: 'all 0.18s ease',
      }}
    >
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '1.08rem', fontWeight: 300,
        color: h ? CREAM : 'rgba(240,232,212,0.8)', lineHeight: 1.3, transition: 'color 0.18s',
      }}>{label}</span>
      <span style={{ color: h ? GOLD : 'rgba(201,164,85,0.4)', fontSize: 13, flexShrink: 0, transition: 'color 0.18s' }}>→</span>
    </button>
  );
}

// The Actionables page: a single week-by-week Individual to-do list for the
// member being viewed. Editable by the member and by an admin viewing them
// (apiBase decides whose list is targeted).
function ActionablesPanel({ apiBase }: { apiBase: string }) {
  return <TodoManager key={apiBase} apiBase={apiBase} list="individual" showWeek showCategory={false} />;
}

export function AcquisitionDashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  // Navigation trail of page ids — last entry is the page in view; earlier
  // entries render as clickable breadcrumbs.
  const [trail, setTrail] = useState<string[]>([ACQ_ROOT_ID]);
  const id = trail[trail.length - 1];
  const page = getAcqPage(id);

  // Per-client editable content (paste-your-own SOPs/links, cash figures, offer
  // docs, product PDF). null while loading.
  const [content, setContent] = useState<Record<string, AcqData> | null>(null);
  const [embed, setEmbed] = useState<{ url: string; title: string } | null>(null);
  // Admin-authored global content (shared across all acquisition clients). null
  // while loading so the stateful admin editor mounts only once it's known.
  const [adminContent, setAdminContent] = useState<Record<string, AcqAdminData> | null>(null);
  // Acq-admin only: roster of acquisition clients + which client is being viewed
  // (null = the admin's own content).
  const [clients, setClients] = useState<{ email: string; name: string }[]>([]);
  const [targetEmail, setTargetEmail] = useState<string | null>(null);
  // Top-level view of the board: the SOP wiki ("dashboard") or the Roadmap.
  const [mode, setMode] = useState<'dashboard' | 'roadmap'>('dashboard');

  // Global admin content + (for acq-admins) the client roster — loaded once.
  useEffect(() => {
    fetch('/api/acquisition/global', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdminContent(d?.content && typeof d.content === 'object' ? d.content : {}))
      .catch(() => setAdminContent({}));
    if (isAdmin) {
      fetch('/api/admin/acquisition/clients', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (Array.isArray(d?.clients)) setClients(d.clients); })
        .catch(() => {});
    }
  }, [isAdmin]);

  // Per-client content for whoever is being viewed (self, or a selected client).
  useEffect(() => {
    setContent(null);
    const q = targetEmail ? `?client=${encodeURIComponent(targetEmail)}` : '';
    fetch(`/api/me/acquisition${q}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContent(d?.content && typeof d.content === 'object' ? d.content : {}))
      .catch(() => setContent({}));
  }, [targetEmail]);

  const go = (childId: string) => setTrail((t) => [...t, childId]);
  const jumpTo = (index: number) => setTrail((t) => t.slice(0, index + 1));

  if (!page) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto', ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
        This section isn’t available.
      </div>
    );
  }

  const editKind = acqEditKind(id);
  const savePage = (pid: string) => (data: AcqData) => setContent((c) => ({ ...(c ?? {}), [pid]: data }));

  // Cash Tracker is surfaced inline on the landing page (not behind a nav pill).
  const isRoot = id === ACQ_ROOT_ID;
  const cashPage = getAcqPage(CASH_ID);
  const groups = page.groups
    .map((g) => ({ ...g, links: g.links.filter((l) => l.id !== CASH_ID) }))
    .filter((g) => g.links.length > 0);
  const hasGroups = groups.length > 0;
  const adminData = adminContent?.[id];
  const hasAdminContent = !!(adminData && ((adminData.text ?? '').trim() || adminData.links?.length || adminData.files?.length));
  // Admins can globally edit any non-per-client page (the "Building" / reference pages).
  const showAdminEditor = isAdmin && !editKind && acqAdminEditable(id);
  const saveAdminPage = (pid: string) => (data: AcqAdminData) => setAdminContent((c) => ({ ...(c ?? {}), [pid]: data }));
  // When an acq-admin is viewing a specific client, per-client edits target them.
  const client = targetEmail ?? undefined;
  const targetName = targetEmail ? (clients.find((c) => c.email === targetEmail)?.name ?? targetEmail) : null;
  const isEmpty = !editKind && !page.body && !hasGroups && !hasAdminContent && !showAdminEditor && !(isRoot && cashPage);

  // Actionables page: the coach assigns to the client they're viewing; everyone
  // else (a client, or an admin on "My own view") manages their own list.
  const isActionables = id === ACTIONABLES_ID;
  const actionablesApiBase = isAdmin && targetEmail
    ? `/api/admin/clients/${encodeURIComponent(targetEmail)}/todos`
    : '/api/me/todos';
  const acqTitle = (tid: string, title: string | undefined) => (tid === ACTIONABLES_ID ? ACTIONABLES_LABEL : (title ?? '…'));

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      {/* Acq-admin: pick which client's dashboard you're viewing/editing */}
      {isAdmin && clients.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '1.25rem', padding: '10px 14px', ...glass, borderStyle: 'dashed', borderColor: 'rgba(201,164,85,0.35)' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: GOLD }}>Viewing</span>
          <select
            value={targetEmail ?? ''}
            onChange={(e) => setTargetEmail(e.target.value || null)}
            style={{ background: 'rgba(0,0,0,0.4)', color: CREAM, border: '1px solid rgba(201,164,85,0.28)', borderRadius: 8, padding: '7px 10px', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' }}
          >
            <option value="">My own view</option>
            {clients.map((c) => <option key={c.email} value={c.email}>{c.name} — {c.email}</option>)}
          </select>
          {targetName && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(240,232,212,0.6)' }}>Editing <strong style={{ color: CREAM }}>{targetName}</strong>’s content — changes save to their account.</span>}
        </div>
      )}

      {/* Dashboard ⇄ Roadmap switch */}
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: '1.5rem', borderRadius: 100, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.14)' }}>
        {([['dashboard', 'Dashboard'], ['roadmap', 'Roadmap']] as const).map(([key, label]) => {
          const active = mode === key;
          return (
            <button key={key} onClick={() => setMode(key)} style={{
              padding: '7px 16px', borderRadius: 100, cursor: 'pointer', transition: 'all 0.18s',
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              background: active ? 'rgba(201,164,85,0.14)' : 'transparent',
              border: active ? '1px solid rgba(201,164,85,0.3)' : '1px solid transparent',
              color: active ? GOLD : 'rgba(201,164,85,0.45)',
            }}>{label}</button>
          );
        })}
      </div>

      {mode === 'roadmap' ? (
        <AcquisitionRoadmap isAdmin={isAdmin} client={targetEmail ?? undefined} />
      ) : (<>
      {/* Breadcrumbs */}
      {trail.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: '1rem', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5 }}>
          {trail.map((tid, i) => {
            const p = getAcqPage(tid);
            const last = i === trail.length - 1;
            return (
              <span key={tid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: 'rgba(201,164,85,0.3)' }}>›</span>}
                {last ? (
                  <span style={{ color: 'rgba(240,232,212,0.55)' }}>{acqTitle(tid, p?.title)}</span>
                ) : (
                  <button onClick={() => jumpTo(i)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: GOLD, fontFamily: 'inherit', fontSize: 'inherit' }}>
                    {acqTitle(tid, p?.title)}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Title */}
      <h2 style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 300,
        color: CREAM, lineHeight: 1.1, margin: '0 0 1.25rem',
      }}>{isActionables ? ACTIONABLES_LABEL : page.title}</h2>

      {/* Actionables — the repurposed "Roadmap" page: an assignable to-do list */}
      {isActionables && (
        isAdmin && !targetEmail ? (
          <div style={{ ...glass, padding: '1.75rem', textAlign: 'center', color: 'rgba(240,232,212,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.6 }}>
            Select a client above to view and assign their actionables.
          </div>
        ) : (
          <div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(240,232,212,0.6)', lineHeight: 1.6, margin: '0 0 1rem' }}>
              {isAdmin && targetName
                ? <>Actionables for <strong style={{ color: CREAM }}>{targetName}</strong>. What you add here shows on their board — they can add their own too.</>
                : 'Your actionables — grouped by week. Your coach assigns these, and you can add your own.'}
            </p>
            <ActionablesPanel key={actionablesApiBase} apiBase={actionablesApiBase} />
          </div>
        )
      )}

      {!isActionables && (<>
      {/* Cash Tracker — front-and-centre on the landing page */}
      {isRoot && cashPage && (
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.5)', margin: '0 0 0.7rem' }}>Cash Tracker</p>
          {content === null
            ? <div style={{ ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</div>
            : <EditablePage key={CASH_ID + (targetEmail ?? '')} kind="cash" page={cashPage} stored={content[CASH_ID]} onSaved={savePage(CASH_ID)} client={client} />}
        </div>
      )}

      {/* Editable page — per-client content (SOPs/links, cash, offer docs, PDF) */}
      {editKind && (
        content === null
          ? <div style={{ ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading…</div>
          : <EditablePage key={id + (targetEmail ?? '')} kind={editKind} page={page} stored={content[id]} onSaved={savePage(id)} client={client} />
      )}

      {/* Body prose (static reference pages) */}
      {!editKind && page.body && (
        <div style={{ ...glass, padding: 'clamp(1.1rem, 3.5vw, 1.9rem)', marginBottom: '1.25rem' }}>
          <Markdown content={page.body} />
        </div>
      )}

      {/* Admin-managed global content (SOP text / links / PDFs), shown to everyone */}
      {!editKind && <AdminContentView data={adminData} />}

      {/* Admin-only editor for global content on "Building" / reference pages */}
      {showAdminEditor && adminContent !== null && (
        <AdminSectionEditor key={id} pageId={id} data={adminData} onSaved={saveAdminPage(id)} />
      )}

      {/* Embeddable external resources (e.g. Miro) → open in popup */}
      {page.embeds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1.25rem' }}>
          {page.embeds.map((e) => (
            <button key={e.url} onClick={() => setEmbed({ url: e.url, title: e.label })} style={resourcePill}>{e.label} ↗</button>
          ))}
        </div>
      )}

      {/* Navigation groups */}
      {groups.map((group, gi) => (
        group.links.length === 0 ? null : (
          <div key={gi} style={{ marginBottom: '1.25rem' }}>
            {group.heading && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.28em',
                textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.5)', margin: '0 0 0.7rem',
              }}>{group.heading}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {group.links.map((l) => <NavCard key={l.id} label={acqTitle(l.id, l.label)} onClick={() => go(l.id)} />)}
            </div>
          </div>
        )
      ))}

      {/* Stub page (no content authored yet in the source) */}
      {isEmpty && (
        <div style={{ ...glass, padding: '2rem', textAlign: 'center', color: 'rgba(240,232,212,0.55)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, lineHeight: 1.6 }}>
          This section is being built out — check back soon.
        </div>
      )}
      </>)}
      </>)}

      {embed && <EmbedModal url={embed.url} title={embed.title} onClose={() => setEmbed(null)} />}
    </div>
  );
}
