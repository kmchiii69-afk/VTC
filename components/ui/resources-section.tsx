'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, ArrowLeft, ArrowRight, ExternalLink, Upload, FileCheck2, X, Settings2, Plus, Trash2 } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import { CenterLoader } from '@/components/ui/loaders';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

type ResourceType = 'native' | 'embed' | 'template';

export interface Resource {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  type: ResourceType;
  body: string;
  embed_url?: string | null;
  template_url?: string | null;
  upload_step_id?: string | null;
  upload_slot?: string | null;
  persisted?: boolean;
}

interface UploadFile { id: string; url: string; name: string; }

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(201,164,85,0.14)',
  borderRadius: 16,
  backdropFilter: 'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
};

const TYPE_LABEL: Record<ResourceType, string> = { native: 'Guide', embed: 'Document', template: 'Template' };

export function ResourcesView({ isAdmin = false, initialSlug = null }: { isAdmin?: boolean; initialSlug?: string | null }) {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [active, setActive] = useState<Resource | null>(null);
  const [managing, setManaging] = useState(false);
  const openedInitial = useRef(false);

  const load = useCallback(() => {
    fetch('/api/resources', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setResources(Array.isArray(d?.resources) ? d.resources : []))
      .catch(() => setResources([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep-link (/portal?resource=<slug>): open that resource once, after load.
  useEffect(() => {
    if (openedInitial.current || !initialSlug || !resources) return;
    const match = resources.find((r) => r.slug === initialSlug);
    if (match) setActive(match);
    openedInitial.current = true;
  }, [initialSlug, resources]);

  if (resources === null) return <CenterLoader label="Loading resources…" />;

  if (managing) return <ResourcesManager resources={resources} onClose={() => { setManaging(false); load(); }} />;

  if (active) return <ResourceDetail resource={active} onBack={() => setActive(null)} />;

  if (!resources.length) {
    return <div style={{ color: faint, fontSize: 14, padding: 20 }}>No resources yet.</div>;
  }

  // Group by category, preserving the sort order the API returns.
  const categories: { name: string; items: Resource[] }[] = [];
  for (const r of resources) {
    let g = categories.find((c) => c.name === r.category);
    if (!g) { g = { name: r.category, items: [] }; categories.push(g); }
    g.items.push(r);
  }

  return (
    <div data-tour="resources-list">
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ color: cream, fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Resources</h1>
          <p style={{ color: sub, fontSize: 14, margin: '6px 0 0' }}>Your offer docs, guides, and program references — all in one place.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setManaging(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(201,164,85,0.08)', color: cream, border: `1px solid rgba(201,164,85,0.3)`, fontSize: 13, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Settings2 size={15} /> Manage
          </button>
        )}
      </div>

      {categories.map((cat) => (
        <div key={cat.name} style={{ marginBottom: 28 }}>
          <div style={{ color: G, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>{cat.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {cat.items.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                style={{ ...card, padding: 18, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.18s, transform 0.18s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(201,164,85,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,164,85,0.14)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FileText size={20} color={G} />
                  <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, border: `1px solid rgba(201,164,85,0.2)`, borderRadius: 6, padding: '2px 7px' }}>{TYPE_LABEL[r.type]}</span>
                </div>
                <div style={{ color: cream, fontWeight: 600, fontSize: 15.5, marginTop: 4 }}>{r.title}</div>
                <div style={{ color: sub, fontSize: 13, lineHeight: 1.5 }}>{r.description}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: G, fontSize: 12.5, marginTop: 4 }}>Open <ArrowRight size={13} /></div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Standalone, header-less render of a single resource (markdown body + any
// template actions) for embedding outside the Resources tab — e.g. below the
// matching module on the /modules page. Mirrors ResourceDetail's body exactly.
export function ResourceInline({ resource }: { resource: Resource }) {
  if (resource.type === 'embed' && resource.embed_url) {
    return (
      <div style={{ ...card, padding: 0, overflow: 'hidden', height: '70vh' }}>
        <iframe src={resource.embed_url} title={resource.title} allow="fullscreen" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: '26px 30px' }}>
      <Markdown content={resource.body} />
      {resource.type === 'template' && <TemplateActions resource={resource} />}
    </div>
  );
}

function ResourceDetail({ resource, onBack }: { resource: Resource; onBack: () => void }) {
  return (
    <div>
      <button
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: sub, cursor: 'pointer', fontSize: 13, marginBottom: 18, padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = cream)}
        onMouseLeave={(e) => (e.currentTarget.style.color = sub)}
      >
        <ArrowLeft size={15} /> All resources
      </button>

      {resource.type === 'embed' && resource.embed_url ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden', height: '75vh' }}>
          <iframe src={resource.embed_url} title={resource.title} allow="fullscreen" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
        </div>
      ) : (
        <div style={{ ...card, padding: '26px 30px', maxWidth: 820 }}>
          <Markdown content={resource.body} />
          {resource.type === 'template' && <TemplateActions resource={resource} />}
        </div>
      )}
    </div>
  );
}

// Template: "Make your copy" + (when mapped) upload-for-approval reusing the
// existing onboarding upload pipeline (storage + Discord notice + CSM view).
function TemplateActions({ resource }: { resource: Resource }) {
  const storeKey = resource.upload_slot ? `${resource.upload_step_id}:${resource.upload_slot}` : resource.upload_step_id || '';
  const canUpload = !!resource.upload_step_id;

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canUpload) return;
    fetch('/api/me/onboarding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const u = d?.uploads?.[storeKey]; if (Array.isArray(u)) setFiles(u); })
      .catch(() => {});
  }, [canUpload, storeKey]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('stepId', resource.upload_step_id || '');
      if (resource.upload_slot) fd.append('slot', resource.upload_slot);
      const res = await fetch('/api/me/onboarding/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.file) setFiles((prev) => [...prev, data.file]);
      else setErr(data.error || 'Upload failed');
    } catch { setErr('Upload failed'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeFile = async (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    await fetch('/api/me/onboarding/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
  };

  return (
    <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid rgba(201,164,85,0.15)' }}>
      {resource.template_url && (
        <a
          href={resource.template_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: G, color: '#1a1407', fontWeight: 600, fontSize: 14, padding: '11px 18px', borderRadius: 10, textDecoration: 'none' }}
        >
          <ExternalLink size={16} /> Open the template — make your copy
        </a>
      )}

      {canUpload && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: cream, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Submit your completed doc</div>
          <div style={{ color: sub, fontSize: 13, marginBottom: 12 }}>When it's filled out, export it as a PDF and upload it here for the team to review.</div>

          {files.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', marginBottom: 8 }}>
              <FileCheck2 size={16} color="#4ade80" />
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: cream, fontSize: 13, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</a>
              <button onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: faint, padding: 2 }} title="Remove"><X size={15} /></button>
            </div>
          ))}

          <input ref={fileRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(201,164,85,0.08)', color: cream, border: `1px solid rgba(201,164,85,0.3)`, fontSize: 13.5, padding: '10px 16px', borderRadius: 10, cursor: uploading ? 'default' : 'pointer' }}
          >
            <Upload size={15} /> {uploading ? 'Uploading…' : files.length ? 'Upload another PDF' : 'Upload PDF'}
          </button>
          {err && <div style={{ color: '#ef4444', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

/* ─── Admin: manage resources (add / edit / delete) ──────────────────────── */

function ResourcesManager({ resources, onClose }: { resources: Resource[]; onClose: () => void }) {
  const [items, setItems] = useState<Resource[]>(resources);
  const [creating, setCreating] = useState(false);
  const notPersisted = items.some((r) => r.persisted === false);

  const addNew = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/resources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Resource', type: 'native', category: 'Resources' }),
      });
      const row = await res.json().catch(() => null);
      if (res.ok && row?.id) setItems((prev) => [...prev, row]);
    } catch { /* ignore */ }
    setCreating(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <button
          onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: sub, cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          <ArrowLeft size={15} /> Back to resources
        </button>
        <button
          onClick={addNew}
          disabled={creating}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: G, color: '#1a1407', fontWeight: 600, border: 'none', fontSize: 13, padding: '9px 14px', borderRadius: 10, cursor: creating ? 'default' : 'pointer' }}
        >
          <Plus size={15} /> {creating ? 'Adding…' : 'Add resource'}
        </button>
      </div>

      {notPersisted && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 13 }}>
          The <code>resources</code> table isn't set up yet — run <code>supabase-resources.sql</code> so edits save. Until then this list is read-only defaults.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((r) => (
          <ResourceEditor
            key={r.id}
            resource={r}
            onSaved={(u) => setItems((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(201,164,85,0.2)',
  borderRadius: 8, padding: '8px 10px', color: cream, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { color: faint, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display: 'block' };

function ResourceEditor({ resource, onSaved, onDeleted }: { resource: Resource; onSaved: (r: Resource) => void; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Resource>(resource);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (k: keyof Resource, v: string) => setD((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`/api/admin/resources/${resource.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: d.title, description: d.description, category: d.category, type: d.type,
          body: d.body, embed_url: d.embed_url || null, template_url: d.template_url || null,
          upload_step_id: d.upload_step_id || null, upload_slot: d.upload_slot || null,
        }),
      });
      if (res.ok) { onSaved(d); setMsg('Saved ✓'); setTimeout(() => setMsg(''), 1500); }
      else { const e = await res.json().catch(() => ({})); setMsg(e.error || 'Save failed'); }
    } catch { setMsg('Save failed'); }
    setSaving(false);
  };

  const del = async () => {
    if (!confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/resources/${resource.id}`, { method: 'DELETE' });
    if (res.ok) onDeleted(resource.id);
  };

  return (
    <div style={{ ...card, padding: open ? 18 : '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <div style={{ minWidth: 0 }}>
          <span style={{ color: cream, fontWeight: 600, fontSize: 14.5 }}>{d.title || 'Untitled'}</span>
          <span style={{ color: faint, fontSize: 12, marginLeft: 10 }}>{d.category} · {TYPE_LABEL[d.type]}</span>
        </div>
        <span style={{ color: G, fontSize: 12.5 }}>{open ? 'Close' : 'Edit'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Title</label><input style={inputStyle} value={d.title} onChange={(e) => set('title', e.target.value)} /></div>
            <div><label style={labelStyle}>Category</label><input style={inputStyle} value={d.category} onChange={(e) => set('category', e.target.value)} /></div>
          </div>
          <div><label style={labelStyle}>Description</label><input style={inputStyle} value={d.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={d.type} onChange={(e) => set('type', e.target.value)}>
              <option value="native">Native (in-app content)</option>
              <option value="embed">Embed (iframe a doc)</option>
              <option value="template">Template (fill out + upload)</option>
            </select>
          </div>

          {d.type === 'embed' ? (
            <div><label style={labelStyle}>Embed URL (use a /preview or published-to-web link)</label><input style={inputStyle} value={d.embed_url || ''} onChange={(e) => set('embed_url', e.target.value)} /></div>
          ) : (
            <div><label style={labelStyle}>Content (markdown)</label>
              <textarea style={{ ...inputStyle, minHeight: 220, lineHeight: 1.5, resize: 'vertical' }} value={d.body} onChange={(e) => set('body', e.target.value)} />
            </div>
          )}

          {d.type === 'template' && (
            <>
              <div><label style={labelStyle}>Template URL (the doc clients duplicate & fill)</label><input style={inputStyle} value={d.template_url || ''} onChange={(e) => set('template_url', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Upload step id (optional)</label><input style={inputStyle} placeholder="e.g. submit-docs" value={d.upload_step_id || ''} onChange={(e) => set('upload_step_id', e.target.value)} /></div>
                <div><label style={labelStyle}>Upload slot (optional)</label><input style={inputStyle} placeholder="e.g. pmf | offer" value={d.upload_slot || ''} onChange={(e) => set('upload_slot', e.target.value)} /></div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <button onClick={save} disabled={saving} style={{ background: G, color: '#1a1407', fontWeight: 600, border: 'none', fontSize: 13, padding: '9px 18px', borderRadius: 9, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={del} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' }}><Trash2 size={14} /> Delete</button>
            {msg && <span style={{ color: msg.includes('✓') ? '#4ade80' : '#ef4444', fontSize: 12.5 }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
