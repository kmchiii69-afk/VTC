'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Check, FileText, ArrowRight, FlaskConical, Upload, FileCheck2, GripVertical } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { VidalyticsEmbed } from '@/components/ui/vidalytics-embed';
import { RecordingEmbed } from '@/components/ui/recording-embed';
import { ResourceLinkActions } from '@/components/ui/resource-link-actions';
import type { BetaTree, BetaCategory, BetaLesson, BetaResource, BetaResourceKind } from '@/lib/ba-beta';

const G = '#c9a455';

// Many providers block being framed on their normal share/view links and only
// allow it via a dedicated embed URL. Rewrite the common ones so admins can
// paste the plain link and it still embeds. Unknown URLs pass through as-is.
function toEmbedUrl(raw: string): string {
  const url = (raw || '').trim();
  if (!url) return url;
  // Canva: /design/<id>/<token>/… link → the embeddable /view?embed form. The
  // <token> segment authorizes public viewing/embedding — dropping it makes
  // Canva refuse to connect, so preserve it when present.
  const canva = url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?/i);
  if (canva) {
    const path = canva[2] ? `${canva[1]}/${canva[2]}` : canva[1];
    return `https://www.canva.com/design/${path}/view?embed`;
  }
  // Google Docs/Sheets/Slides: an /edit (or bare) link → /preview, which frames.
  const gdoc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]+)/i);
  if (gdoc) return `https://docs.google.com/${gdoc[1]}/d/${gdoc[2]}/preview`;
  return url;
}

/* ─── Sidebar group (admin-only, shown above the core catalog) ───────────── */

export function BetaSidebar({
  tree, selectedId, onSelect, onManage, atTop = false, memberView = false,
}: {
  tree: BetaTree | null;
  selectedId: string | null;
  onSelect: (lesson: BetaLesson, categoryName: string) => void;
  onManage: () => void;
  atTop?: boolean;
  /** Members see this as their whole catalog — hide admin-only chrome (the
   *  "admin only" note + "Manage beta" button) and the internal "Beta" wording. */
  memberView?: boolean;
}) {
  const lessonCount = tree?.categories.reduce((n, c) => n + c.lessons.length, 0) ?? 0;

  return (
    <div style={memberView
      ? { paddingBottom: 10 }
      : atTop
      ? { borderBottom: '1px solid rgba(201,164,85,0.12)', paddingBottom: 14, marginBottom: 4 }
      : { borderTop: '1px solid rgba(201,164,85,0.12)', marginTop: 18, paddingBottom: 10 }}>
      {!memberView && (
        <>
          <div style={{ padding: '16px 20px 6px', display: 'flex', alignItems: 'center', gap: 7 }}>
            <FlaskConical size={12} color={G} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.26em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(201,164,85,0.65)' }}>
              Brand Architect
            </span>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9.5px', letterSpacing: '0.05em', color: 'rgba(201,164,85,0.3)', padding: '0 20px 8px', textTransform: 'uppercase', fontWeight: 600 }}>
            Shown to members · editable
          </p>

          <button
            onClick={onManage}
            style={{
              margin: '0 20px 6px', width: 'calc(100% - 40px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '8px 12px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 8,
              color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer',
            }}
          >
            <Pencil size={12} /> Manage
          </button>
        </>
      )}

      {lessonCount === 0 ? (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'rgba(240,232,212,0.35)', padding: '4px 20px 10px', lineHeight: 1.5 }}>
          {memberView ? 'No modules yet.' : 'No lessons yet. Use “Manage” to add a category and lessons.'}
        </p>
      ) : (
        tree!.categories.map((cat) => (
          <div key={cat.id}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.3)', padding: '12px 20px 6px' }}>
              {cat.name}
            </p>
            {cat.lessons.map((l) => {
              const active = l.id === selectedId;
              return (
                <button
                  key={l.id}
                  onClick={() => onSelect(l, cat.name)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: active ? 'rgba(201,164,85,0.08)' : 'none', border: 'none',
                    borderLeft: active ? '2px solid rgba(201,164,85,0.6)' : '2px solid transparent',
                    padding: '9px 20px 9px 18px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 10, transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,164,85,0.04)'; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', lineHeight: 1.4, color: active ? 'rgba(240,232,212,0.9)' : 'rgba(240,232,212,0.6)', fontWeight: active ? 500 : 400, transition: 'color 0.15s' }}>
                    {l.title}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Lesson view (video + resource pills) ───────────────────────────────── */

export function BetaLessonView({ lesson, categoryName }: { lesson: BetaLesson; categoryName: string }) {
  const pills = lesson.resources.filter((r) => !r.inline);
  const inlineRes = lesson.resources.filter((r) => r.inline);
  return (
    <>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.35)', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        {categoryName}
      </p>

      <h1 className="font-serif" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 300, color: '#f0e8d4', lineHeight: 1.15, margin: '0 0 1.5rem' }}>
        {lesson.title}
      </h1>

      <div style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
        {/* A full embed snippet (iframe / <script> from any provider) is rendered
            as-is; a bare token is treated as a Vidalytics id. */}
        {lesson.embed_id.includes('<')
          ? <RecordingEmbed html={lesson.embed_id} />
          : <VidalyticsEmbed embedId={lesson.embed_id} />}
      </div>

      {pills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: '1.5rem' }}>
          {pills.map((r) => (
            <BetaResourcePill key={r.id} resource={r} />
          ))}
        </div>
      )}

      {inlineRes.map((r) => (
        <BetaInlineAttachment key={r.id} resource={r} />
      ))}
    </>
  );
}

// Attachment embedded directly below the video (Canva slides, a PDF, a Google
// Doc, etc.) — chosen in the editor via "Show below the video". A 'link' embeds
// the URL in an iframe; a 'note' renders its markdown inline.
function BetaInlineAttachment({ resource }: { resource: BetaResource }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 16, overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 18px', borderBottom: '1px solid rgba(201,164,85,0.1)' }}>
        <FileText size={15} color={G} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: '#f0e8d4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
        {resource.kind === 'link' && resource.url && <ResourceLinkActions url={resource.url} title={resource.title} />}
      </div>
      {resource.kind === 'link' ? (
        resource.url ? (
          <iframe src={toEmbedUrl(resource.url)} title={resource.title} allow="fullscreen" style={{ display: 'block', width: '100%', height: 'min(75vh, 680px)', border: 0, background: '#fff' }} />
        ) : (
          <div style={{ padding: 24, color: 'rgba(240,232,212,0.45)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No link set.</div>
        )
      ) : (
        <div style={{ padding: 22 }}>
          <Markdown content={resource.body} />
        </div>
      )}
    </div>
  );
}

// Pill button that opens a resource in a popup — a 'link' shows the url in an
// iframe; a 'note' renders its markdown body. Mirrors the core /modules pills.
function BetaResourcePill({ resource }: { resource: BetaResource }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 999,
          padding: '10px 18px', color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 500, transition: 'all 0.18s',
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
            style={{ width: '100%', maxWidth: resource.kind === 'link' ? 1100 : 820, height: resource.kind === 'link' ? '88vh' : undefined, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(20,16,9,0.97)', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 20, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid rgba(201,164,85,0.14)', flexShrink: 0 }}>
              <span className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.25rem', fontWeight: 300, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
              {resource.kind === 'link' && resource.url && <ResourceLinkActions url={resource.url} title={resource.title} />}
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, cursor: 'pointer', flexShrink: 0 }}><X size={18} /></button>
            </div>
            {resource.kind === 'link' ? (
              resource.url ? (
                <iframe src={toEmbedUrl(resource.url)} title={resource.title} allow="fullscreen" style={{ flex: 1, width: '100%', border: 0, background: '#fff' }} />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,232,212,0.45)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No link set.</div>
              )
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 26 }}>
                <Markdown content={resource.body} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Admin editor overlay ───────────────────────────────────────────────── */

const api = (method: string, url: string, body?: unknown) =>
  fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });

type LessonDnd = {
  dragId: string | null;
  dropCatId: string | null;
  setDropCatId: (id: string | null) => void;
  onDragStart: (id: string) => void;
  onDragEnterLesson: (targetLessonId: string) => void;
  onDropCategory: (catId: string) => void;
  onDragEnd: () => void;
};

export function BetaEditor({ tree, onChanged, onClose }: { tree: BetaTree | null; onChanged: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newCat, setNewCat] = useState('');
  const persisted = tree?.persisted ?? false;

  // Local mirror so lessons can be dragged optimistically. `localRef` always
  // holds the latest arrangement synchronously (drag events outrun re-renders);
  // we persist from it on drop, then onChanged refetch re-syncs.
  const [local, setLocal] = useState<BetaCategory[]>(tree?.categories ?? []);
  const localRef = useRef<BetaCategory[]>(tree?.categories ?? []);
  useEffect(() => { const c = tree?.categories ?? []; setLocal(c); localRef.current = c; }, [tree]);
  const applyLocal = (next: BetaCategory[]) => { localRef.current = next; setLocal(next); };
  const categories = local;

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCatId, setDropCatId] = useState<string | null>(null);
  const cloneCats = (list: BetaCategory[]) => list.map((c) => ({ ...c, lessons: c.lessons.slice() }));
  const locate = (list: BetaCategory[], lessonId: string) => {
    for (const c of list) { const i = c.lessons.findIndex((l) => l.id === lessonId); if (i >= 0) return { catId: c.id, i }; }
    return null;
  };

  const run = async (fn: () => Promise<Response | null>) => {
    setBusy(true); setErr('');
    try {
      const res = await fn();
      if (res && !res.ok) {
        // Surface the real reason: JSON {error} if present, else the raw body
        // (an HTML error page, etc.) and the HTTP status, so failures aren't
        // hidden behind a generic "Action failed".
        const raw = await res.text().catch(() => '');
        let msg = '';
        try { msg = (JSON.parse(raw) as { error?: string }).error || ''; } catch { msg = raw.slice(0, 140); }
        setErr(`${msg || 'Action failed'} (HTTP ${res.status})`);
      } else await onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const addCat = () => { const name = newCat.trim(); if (!name) return; run(() => api('POST', '/api/admin/ba-beta/categories', { name }).then((r) => { setNewCat(''); return r; })); };
  const renameCat = (id: string, name: string) => run(() => api('PATCH', `/api/admin/ba-beta/categories/${id}`, { name }));
  const deleteCat = (id: string, name: string) => { if (!confirm(`Delete category “${name}” and all its lessons? This can't be undone.`)) return; run(() => api('DELETE', `/api/admin/ba-beta/categories/${id}`)); };
  const moveCat = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= categories.length) return;
    const a = categories[i], b = categories[j];
    run(async () => { await api('PATCH', `/api/admin/ba-beta/categories/${a.id}`, { sort_order: b.sort_order }); return api('PATCH', `/api/admin/ba-beta/categories/${b.id}`, { sort_order: a.sort_order }); });
  };

  const addLesson = (categoryId: string, title: string, embedId: string) => run(() => api('POST', '/api/admin/ba-beta/lessons', { category_id: categoryId, title, embed_id: embedId }));
  const editLesson = (id: string, title: string, embedId: string) => run(() => api('PATCH', `/api/admin/ba-beta/lessons/${id}`, { title, embed_id: embedId }));
  const deleteLesson = (id: string, title: string) => { if (!confirm(`Delete lesson “${title}” and its resources?`)) return; run(() => api('DELETE', `/api/admin/ba-beta/lessons/${id}`)); };
  // Re-parent a lesson into another category, appending it to that category's end.
  const moveLessonToCategory = (lessonId: string, targetCategoryId: string) => {
    const target = categories.find((c) => c.id === targetCategoryId);
    const sort_order = target?.lessons.length ? Math.max(...target.lessons.map((l) => l.sort_order)) + 1 : 0;
    run(() => api('PATCH', `/api/admin/ba-beta/lessons/${lessonId}`, { category_id: targetCategoryId, sort_order }));
  };

  // ── Drag-and-drop lessons (reorder within a category · move between them) ──
  const persistLessonOrder = () => {
    const items = localRef.current.flatMap((c) => c.lessons.map((l, i) => ({ id: l.id, category_id: c.id, sort_order: i })));
    run(() => api('PATCH', '/api/admin/ba-beta/lessons/reorder', { items }));
  };
  // Dragged lesson passes over `targetLessonId` → drop it into that slot.
  const onLessonDragEnter = (targetLessonId: string) => {
    if (!dragId || dragId === targetLessonId) return;
    const cur = localRef.current;
    const src = locate(cur, dragId); const tgt = locate(cur, targetLessonId);
    if (!src || !tgt) return;
    const next = cloneCats(cur);
    const srcCat = next.find((c) => c.id === src.catId)!;
    const [moved] = srcCat.lessons.splice(srcCat.lessons.findIndex((l) => l.id === dragId), 1);
    const tgtCat = next.find((c) => c.id === tgt.catId)!;
    tgtCat.lessons.splice(tgtCat.lessons.findIndex((l) => l.id === targetLessonId), 0, moved);
    applyLocal(next);
    setDropCatId(tgt.catId);
  };
  // Dropped on a category (its body or an empty category) → append there.
  const onCategoryDrop = (catId: string) => {
    if (!dragId) return;
    const cur = localRef.current;
    const src = locate(cur, dragId);
    if (!src || src.catId === catId) { setDropCatId(null); return; }
    const next = cloneCats(cur);
    const srcCat = next.find((c) => c.id === src.catId)!;
    const [moved] = srcCat.lessons.splice(srcCat.lessons.findIndex((l) => l.id === dragId), 1);
    next.find((c) => c.id === catId)!.lessons.push(moved);
    applyLocal(next);
    setDropCatId(null);
  };
  const endLessonDrag = () => {
    if (dragId) persistLessonOrder();
    setDragId(null);
    setDropCatId(null);
  };
  const lessonDnd = {
    dragId, dropCatId, setDropCatId,
    onDragStart: (id: string) => setDragId(id),
    onDragEnterLesson: onLessonDragEnter,
    onDropCategory: onCategoryDrop,
    onDragEnd: endLessonDrag,
  };

  const addResource = (lessonId: string, body: ResForm) =>
    run(() => api('POST', '/api/admin/ba-beta/resources', { lesson_id: lessonId, ...body }));
  const editResource = (id: string, body: ResForm) =>
    run(() => api('PATCH', `/api/admin/ba-beta/resources/${id}`, body));
  const deleteResource = (id: string, title: string) => { if (!confirm(`Delete resource “${title}”?`)) return; run(() => api('DELETE', `/api/admin/ba-beta/resources/${id}`)); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(6,5,4,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px,3vw,40px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <div className="font-serif" style={{ color: '#f0e8d4', fontSize: '1.25rem', fontWeight: 300, display: 'flex', alignItems: 'center', gap: 9 }}>
            <FlaskConical size={17} color={G} /> Brand Architect
          </div>
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!persisted && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5 }}>
              The beta tables aren’t set up yet. Run <code>supabase-ba-beta.sql</code> in Supabase — saves will fail until then.
            </div>
          )}
          {err && <div style={{ fontSize: 12.5, color: '#ef4444', fontFamily: "'DM Sans', sans-serif" }}>{err}</div>}

          {categories.length > 0 && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: 'rgba(240,232,212,0.45)', margin: 0 }}>
              <GripVertical size={13} style={{ color: 'rgba(201,164,85,0.5)' }} /> Drag a lesson by its handle to reorder it, or drag it onto another category to move it there.
            </p>
          )}

          {categories.map((cat, ci) => (
            <CategoryEditor
              key={cat.id} cat={cat} index={ci} total={categories.length} busy={busy}
              allCategories={categories} dnd={lessonDnd}
              onRename={(name) => renameCat(cat.id, name)}
              onDelete={() => deleteCat(cat.id, cat.name)}
              onMove={(dir) => moveCat(ci, dir)}
              onAddLesson={(t, e) => addLesson(cat.id, t, e)}
              onEditLesson={(id, t, e) => editLesson(id, t, e)}
              onDeleteLesson={(id, t) => deleteLesson(id, t)}
              onMoveLessonToCategory={moveLessonToCategory}
              onAddResource={addResource}
              onEditResource={editResource}
              onDeleteResource={deleteResource}
            />
          ))}

          {/* Add category */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 16 }}>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} placeholder="New category name" style={inputStyle} />
            <button onClick={addCat} disabled={busy || !newCat.trim()} style={{ ...btnPrimary, opacity: busy || !newCat.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Add category
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({
  cat, index, total, busy, allCategories, dnd, onRename, onDelete, onMove,
  onAddLesson, onEditLesson, onDeleteLesson, onMoveLessonToCategory,
  onAddResource, onEditResource, onDeleteResource,
}: {
  cat: BetaCategory; index: number; total: number; busy: boolean;
  allCategories: BetaCategory[]; dnd: LessonDnd;
  onRename: (name: string) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
  onAddLesson: (title: string, embedId: string) => void;
  onEditLesson: (id: string, title: string, embedId: string) => void;
  onDeleteLesson: (id: string, title: string) => void;
  onMoveLessonToCategory: (lessonId: string, targetCategoryId: string) => void;
  onAddResource: (lessonId: string, body: ResForm) => void;
  onEditResource: (id: string, body: ResForm) => void;
  onDeleteResource: (id: string, title: string) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmbed, setNewEmbed] = useState('');

  // Whole category is a drop zone: dropping a dragged lesson here (incl. an
  // empty category) moves it into this category at the end.
  const isDropTarget = dnd.dragId != null && dnd.dropCatId === cat.id;
  const dropZone = {
    onDragOver: (e: React.DragEvent) => { if (dnd.dragId) { e.preventDefault(); dnd.setDropCatId(cat.id); } },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); dnd.onDropCategory(cat.id); },
  };

  return (
    <div {...dropZone} style={{ background: isDropTarget ? 'rgba(201,164,85,0.07)' : 'rgba(255,255,255,0.02)', border: isDropTarget ? '1px solid rgba(201,164,85,0.45)' : '1px solid rgba(201,164,85,0.12)', borderRadius: 14, padding: '14px 16px', transition: 'background 0.15s, border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== cat.name) onRename(name.trim()); }}
          style={{ ...inputStyle, fontWeight: 700, letterSpacing: '0.04em', color: G, flex: 1 }}
        />
        <IconBtn title="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}><ChevronUp size={15} /></IconBtn>
        <IconBtn title="Move down" disabled={busy || index === total - 1} onClick={() => onMove(1)}><ChevronDown size={15} /></IconBtn>
        <IconBtn title="Delete category" disabled={busy} danger onClick={onDelete}><Trash2 size={14} /></IconBtn>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cat.lessons.map((l) => (
          <LessonEditor
            key={l.id} lesson={l} busy={busy} dnd={dnd}
            categories={allCategories} currentCategoryId={cat.id}
            onSave={(t, e) => onEditLesson(l.id, t, e)} onDelete={() => onDeleteLesson(l.id, l.title)}
            onMoveToCategory={(targetId) => onMoveLessonToCategory(l.id, targetId)}
            onAddResource={(body) => onAddResource(l.id, body)}
            onEditResource={onEditResource}
            onDeleteResource={onDeleteResource}
          />
        ))}
        {cat.lessons.length === 0 && (
          <div style={{ padding: '12px 10px', textAlign: 'center', borderRadius: 8, border: '1px dashed rgba(201,164,85,0.2)', color: 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5 }}>
            {dnd.dragId ? 'Drop a lesson here' : 'No lessons yet.'}
          </div>
        )}
      </div>

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(201,164,85,0.1)' }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Lesson title" style={inputStyle} />
          <textarea value={newEmbed} onChange={(e) => setNewEmbed(e.target.value)} rows={2} placeholder="Vidalytics ID (e.g. 6Llqml3sawJeP184) — or paste a full embed code (iframe / <script>)" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || !newTitle.trim()} onClick={() => { onAddLesson(newTitle.trim(), newEmbed.trim()); setNewTitle(''); setNewEmbed(''); setAdding(false); }} style={{ ...btnPrimary, opacity: busy || !newTitle.trim() ? 0.5 : 1 }}>Add</button>
            <button onClick={() => { setAdding(false); setNewTitle(''); setNewEmbed(''); }} style={btnGhost}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed rgba(201,164,85,0.25)', borderRadius: 8, padding: '7px 12px', color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, cursor: 'pointer' }}>
          <Plus size={13} /> Add lesson
        </button>
      )}
    </div>
  );
}

function LessonEditor({
  lesson, busy, dnd, categories, currentCategoryId, onSave, onDelete, onMoveToCategory,
  onAddResource, onEditResource, onDeleteResource,
}: {
  lesson: BetaLesson; busy: boolean; dnd: LessonDnd;
  categories: BetaCategory[]; currentCategoryId: string;
  onSave: (title: string, embedId: string) => void; onDelete: () => void;
  onMoveToCategory: (targetCategoryId: string) => void;
  onAddResource: (body: ResForm) => void;
  onEditResource: (id: string, body: ResForm) => void;
  onDeleteResource: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [embed, setEmbed] = useState(lesson.embed_id);
  const startEdit = () => { setTitle(lesson.title); setEmbed(lesson.embed_id); setEditing(true); };
  const dragging = dnd.dragId === lesson.id;

  return (
    <div style={{ borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(201,164,85,0.08)', opacity: dragging ? 0.4 : 1 }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3} placeholder="Vidalytics ID — or paste a full embed code (iframe / <script>)" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
          {categories.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>Category</span>
              <select
                value={currentCategoryId} disabled={busy}
                onChange={(e) => { const t = e.target.value; if (t !== currentCategoryId) { onMoveToCategory(t); setEditing(false); } }}
                style={inputStyle}
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || !title.trim()} onClick={() => { onSave(title.trim(), embed.trim()); setEditing(false); }} style={{ ...btnPrimary, opacity: busy || !title.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={13} /> Save</button>
            <button onClick={() => { setEditing(false); setTitle(lesson.title); setEmbed(lesson.embed_id); }} style={btnGhost}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          draggable={!busy}
          onDragStart={(e) => { dnd.onDragStart(lesson.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnter={() => dnd.onDragEnterLesson(lesson.id)}
          onDragOver={(e) => { if (dnd.dragId) e.preventDefault(); }}
          onDragEnd={dnd.onDragEnd}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}
        >
          <span title="Drag to reorder · drag onto another category to move it" style={{ cursor: 'grab', color: 'rgba(201,164,85,0.4)', display: 'flex', flexShrink: 0 }}>
            <GripVertical size={15} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#e9e0cc', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lesson.title}</span>
          {!lesson.embed_id && <span style={{ fontSize: 9, color: 'rgba(239,68,68,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>no video</span>}
          <button
            onClick={() => setOpen((v) => !v)}
            title="PDFs, links & notes for this lesson"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, background: open ? 'rgba(201,164,85,0.14)' : 'rgba(201,164,85,0.06)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 7, padding: '4px 9px', cursor: 'pointer', color: 'rgba(201,164,85,0.85)', fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 600 }}
          >
            <FileText size={12} /> {lesson.resources.length > 0 ? `Files (${lesson.resources.length})` : 'Add files'}
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <IconBtn title="Edit title / video" disabled={busy} onClick={startEdit}><Pencil size={13} /></IconBtn>
          <IconBtn title="Delete" disabled={busy} danger onClick={onDelete}><Trash2 size={13} /></IconBtn>
        </div>
      )}

      {open && !editing && (
        <div style={{ padding: '0 10px 10px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lesson.resources.map((r) => (
            <ResourceEditor key={r.id} resource={r} busy={busy}
              onSave={(body) => onEditResource(r.id, body)} onDelete={() => onDeleteResource(r.id, r.title)} />
          ))}
          <AddResource busy={busy} onAdd={onAddResource} />
        </div>
      )}
    </div>
  );
}

type ResForm = { title: string; kind: BetaResourceKind; url: string; body: string; inline: boolean };

function emptyResForm(): ResForm {
  return { title: '', kind: 'link', url: '', body: '', inline: false };
}

function ResourceFields({ d, set }: { d: ResForm; set: <K extends keyof ResForm>(k: K, v: ResForm[K]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setUploading(true); setUpErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/ba-beta/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        set('url', data.url);
        if (!d.title.trim()) set('title', (data.name || file.name).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
      } else {
        setUpErr(data.error || 'Upload failed');
      }
    } catch { setUpErr('Upload failed'); }
    setUploading(false);
  };

  return (
    <>
      <input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Pill label (e.g. Offer doc)" style={inputStyle} />
      <select value={d.kind} onChange={(e) => set('kind', e.target.value as BetaResourceKind)} style={inputStyle}>
        <option value="link">Document / link (Canva, PDF, Google Doc…)</option>
        <option value="note">Note (in-app text)</option>
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '2px 1px' }}>
        <input type="checkbox" checked={d.inline} onChange={(e) => set('inline', e.target.checked)} style={{ width: 15, height: 15, accentColor: G, cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: 'rgba(240,232,212,0.75)', fontFamily: "'DM Sans', sans-serif" }}>
          Show <strong style={{ color: '#f0e8d4' }}>below the video</strong> when playing (embed inline instead of a popup pill)
        </span>
      </label>
      {d.kind === 'link' ? (
        <>
          <input value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="Paste a URL (Google Doc /preview, Notion, PDF, Loom…)" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.45)', fontFamily: "'DM Sans', sans-serif" }}>or</span>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload PDF'}
            </button>
            {d.url && !uploading && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#4ade80', fontFamily: "'DM Sans', sans-serif" }}>
                <FileCheck2 size={13} /> Attached
              </span>
            )}
          </div>
          {upErr && <div style={{ color: '#ef4444', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{upErr}</div>}
        </>
      ) : (
        <textarea value={d.body} onChange={(e) => set('body', e.target.value)} placeholder="Markdown content" style={{ ...inputStyle, minHeight: 140, lineHeight: 1.5, resize: 'vertical' }} />
      )}
    </>
  );
}

function AddResource({ busy, onAdd }: { busy: boolean; onAdd: (body: ResForm) => void }) {
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<ResForm>(emptyResForm());
  const set = <K extends keyof ResForm>(k: K, v: ResForm[K]) => setD((p) => ({ ...p, [k]: v }));

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px dashed rgba(201,164,85,0.25)', borderRadius: 8, padding: '6px 11px', color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer' }}>
        <Plus size={12} /> Add PDF / link / note
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 9, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(201,164,85,0.12)' }}>
      <ResourceFields d={d} set={set} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={busy || !d.title.trim()} onClick={() => { onAdd({ ...d, title: d.title.trim(), url: d.url.trim() }); setD(emptyResForm()); setAdding(false); }} style={{ ...btnPrimary, opacity: busy || !d.title.trim() ? 0.5 : 1 }}>Add</button>
        <button onClick={() => { setAdding(false); setD(emptyResForm()); }} style={btnGhost}>Cancel</button>
      </div>
    </div>
  );
}

function ResourceEditor({ resource, busy, onSave, onDelete }: {
  resource: BetaResource; busy: boolean;
  onSave: (body: ResForm) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<ResForm>({ title: resource.title, kind: resource.kind, url: resource.url, body: resource.body, inline: resource.inline });
  const set = <K extends keyof ResForm>(k: K, v: ResForm[K]) => setD((p) => ({ ...p, [k]: v }));

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 9, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(201,164,85,0.14)' }}>
        <ResourceFields d={d} set={set} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy || !d.title.trim()} onClick={() => { onSave({ ...d, title: d.title.trim(), url: d.url.trim() }); setEditing(false); }} style={{ ...btnPrimary, opacity: busy || !d.title.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={12} /> Save</button>
          <button onClick={() => { setEditing(false); setD({ title: resource.title, kind: resource.kind, url: resource.url, body: resource.body, inline: resource.inline }); }} style={btnGhost}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(201,164,85,0.05)', border: '1px solid rgba(201,164,85,0.12)' }}>
      <FileText size={13} color={G} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#e9e0cc', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</span>
      {resource.inline && <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.7)' }}>Below video</span>}
      <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)' }}>{resource.kind === 'link' ? 'Document' : 'Note'}</span>
      <IconBtn title="Edit" disabled={busy} onClick={() => setEditing(true)}><Pencil size={12} /></IconBtn>
      <IconBtn title="Delete" disabled={busy} danger onClick={onDelete}><Trash2 size={12} /></IconBtn>
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

const inputStyle: React.CSSProperties = {
  padding: '8px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)',
  borderRadius: 8, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box', flex: 1, minWidth: 0, width: '100%',
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.32)',
  borderRadius: 8, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
};
