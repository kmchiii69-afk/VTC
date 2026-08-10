'use client';

import { useState } from 'react';
import { Markdown } from '@/components/ui/markdown';
import type { AcqPage } from '@/lib/acquisition-data';
import {
  type AcqEditKind, type AcqData, type AcqLinkItem, type AcqCashRow,
  type AcqAdminData, type AcqFile,
  ACQ_DEFAULT_LINKS, ACQ_DEFAULT_CASH,
} from '@/lib/acquisition-config';

const GOLD = '#c9a455';
const CREAM = '#f0e8d4';

const glass: React.CSSProperties = {
  background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(201,164,85,0.18)', borderRadius: 18, padding: 'clamp(1.1rem, 3.5vw, 1.9rem)',
};
const input: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.2)', borderRadius: 8,
  color: CREAM, fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: '8px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnGold: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: '#0a0806', background: GOLD, border: 'none',
};
const btnGhost: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(201,164,85,0.75)',
  background: 'transparent', border: '1px solid rgba(201,164,85,0.28)',
};
const label: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
  fontWeight: 700, color: 'rgba(201,164,85,0.5)',
};

const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Returns null on success, or an error message to show the user. `client` lets
// an acq-admin save on behalf of a specific client (omitted = save own).
async function saveAcq(pageId: string, data: AcqData, client?: string): Promise<string | null> {
  try {
    const r = await fetch('/api/me/acquisition', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, data, client }),
    });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error || 'Save failed';
  } catch { return 'Network error'; }
}

const errText: React.CSSProperties = { color: '#f87171', fontFamily: "'DM Sans', sans-serif", fontSize: 12 };
const okText: React.CSSProperties = { color: '#4ade80', fontFamily: "'DM Sans', sans-serif", fontSize: 12 };
const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9,
  background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)',
  color: GOLD, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
};
const xBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.4)', fontSize: 16, flexShrink: 0, padding: '0 4px' };
const adminBadge: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: '#0a0806', background: GOLD, borderRadius: 4, padding: '2px 6px' };

// Returns null on success, or an error message.
async function saveAdmin(pageId: string, data: AcqAdminData): Promise<string | null> {
  try {
    const r = await fetch('/api/admin/acquisition', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, data }),
    });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error || 'Save failed';
  } catch { return 'Network error'; }
}

// ── Doc editor (markdown notes, seeded from the baked template) ───────────────
function DocEditor({ pageId, defaultText, stored, onSaved, client }: {
  pageId: string; defaultText: string; stored: AcqData | undefined; onSaved: (d: AcqData) => void; client?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const effective = (stored?.text ?? '').trim() ? (stored!.text as string) : defaultText;

  const start = () => { setErr(''); setDraft(stored?.text ?? defaultText ?? ''); setEditing(true); };
  const save = async () => {
    setSaving(true); setErr('');
    const data: AcqData = { ...stored, text: draft };
    const e = await saveAcq(pageId, data, client);
    setSaving(false);
    if (!e) { onSaved(data); setEditing(false); } else setErr(e);
  };

  if (editing) {
    return (
      <div style={glass}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={16}
          placeholder="Write your notes here — Markdown supported (## headings, - bullets, **bold**)…"
          style={{ ...input, minHeight: 320, resize: 'vertical', lineHeight: 1.6 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button onClick={save} disabled={saving} style={{ ...btnGold, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => setEditing(false)} disabled={saving} style={btnGhost}>Cancel</button>
          {err && <span style={errText}>{err}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...glass, position: 'relative' }}>
      <button onClick={start} style={{ ...btnGhost, position: 'absolute', top: 14, right: 14, padding: '5px 12px' }}>✎ Edit</button>
      {effective.trim()
        ? <div style={{ paddingRight: 70 }}><Markdown content={effective} /></div>
        : <p style={{ color: 'rgba(240,232,212,0.45)', fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, margin: 0, paddingRight: 70 }}>Nothing here yet — click Edit to add your own content.</p>}
    </div>
  );
}

// ── Product editor (doc + PDF upload) ────────────────────────────────────────
function ProductEditor({ pageId, defaultText, stored, onSaved, client }: {
  pageId: string; defaultText: string; stored: AcqData | undefined; onSaved: (d: AcqData) => void; client?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pdf = stored?.pdf ?? null;

  const upload = async (file: File) => {
    setErr(''); setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('pageId', pageId);
      if (client) fd.append('client', client);
      const r = await fetch('/api/me/acquisition/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Upload failed'); return; }
      const data: AcqData = { ...stored, pdf: { url: j.url, name: j.name } };
      const e = await saveAcq(pageId, data, client);
      if (!e) onSaved(data); else setErr(e);
    } finally { setBusy(false); }
  };
  const removePdf = async () => {
    setBusy(true); setErr('');
    const data: AcqData = { ...stored, pdf: null };
    const e = await saveAcq(pageId, data, client);
    if (!e) onSaved(data); else setErr(e);
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* PDF slot */}
      <div style={{ ...glass, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Offer deliverable (PDF)</span>
          {pdf
            ? <a href={pdf.url} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, textDecoration: 'none' }}>📄 {pdf.name} ↗</a>
            : <span style={{ color: 'rgba(240,232,212,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>No PDF uploaded yet.</span>}
          {err && <span style={{ color: '#f87171', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>{err}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Uploading…' : pdf ? 'Replace PDF' : 'Upload PDF'}
            <input type="file" accept="application/pdf" disabled={busy} style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
          </label>
          {pdf && <button onClick={removePdf} disabled={busy} style={btnGhost}>Remove</button>}
        </div>
      </div>
      {/* Notes / paste */}
      <DocEditor pageId={pageId} defaultText={defaultText} stored={stored} onSaved={onSaved} client={client} />
    </div>
  );
}

// ── Links editor (Personal SOPs, Important Links) ────────────────────────────
function LinksEditor({ pageId, stored, onSaved, client }: {
  pageId: string; stored: AcqData | undefined; onSaved: (d: AcqData) => void; client?: string;
}) {
  const seed: AcqLinkItem[] = (ACQ_DEFAULT_LINKS[pageId] || []).map((d, i) => ({ id: `seed${i}`, ...d }));
  const [rows, setRows] = useState<AcqLinkItem[]>(stored?.items ?? seed);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const setRow = (id: string, patch: Partial<AcqLinkItem>) => { setRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x)); setDirty(true); setSaved(false); };
  const add = () => { setRows((r) => [...r, { id: newId(), label: '', url: '' }]); setDirty(true); setSaved(false); };
  const remove = (id: string) => { setRows((r) => r.filter((x) => x.id !== id)); setDirty(true); setSaved(false); };
  const save = async () => {
    setSaving(true); setErr('');
    const clean = rows.filter((r) => r.label.trim() || r.url.trim());
    const data: AcqData = { items: clean };
    const e = await saveAcq(pageId, data, client);
    setSaving(false);
    if (!e) { onSaved(data); setRows(clean.length ? clean : rows); setDirty(false); setSaved(true); } else setErr(e);
  };

  return (
    <div style={glass}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && <p style={{ color: 'rgba(240,232,212,0.45)', fontFamily: "'DM Sans', sans-serif", fontSize: 13, margin: '2px 0' }}>Add your first link below.</p>}
        {rows.map((row) => (
          <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={row.label} onChange={(e) => setRow(row.id, { label: e.target.value })} placeholder="Label" style={{ ...input, flex: '0 0 34%' }} />
            <input value={row.url} onChange={(e) => setRow(row.id, { url: e.target.value })} placeholder="https://…" style={{ ...input, flex: 1 }} />
            {row.url.trim() && <a href={row.url} target="_blank" rel="noopener noreferrer" title="Open" style={{ color: GOLD, textDecoration: 'none', fontSize: 14, flexShrink: 0 }}>↗</a>}
            <button onClick={() => remove(row.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.4)', fontSize: 16, flexShrink: 0, padding: '0 4px' }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
        <button onClick={add} style={btnGhost}>+ Add link</button>
        <button onClick={save} disabled={!dirty || saving} style={{ ...btnGold, opacity: (!dirty || saving) ? 0.5 : 1, cursor: (!dirty || saving) ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ color: '#4ade80', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Saved ✓</span>}
        {err && <span style={errText}>{err}</span>}
      </div>
    </div>
  );
}

// ── Cash tracker editor ──────────────────────────────────────────────────────
function CashEditor({ pageId, stored, onSaved, client }: {
  pageId: string; stored: AcqData | undefined; onSaved: (d: AcqData) => void; client?: string;
}) {
  const seed: AcqCashRow[] = ACQ_DEFAULT_CASH.map((d, i) => ({ id: `seed${i}`, ...d }));
  const [rows, setRows] = useState<AcqCashRow[]>(stored?.rows ?? seed);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const setCell = (id: string, patch: Partial<AcqCashRow>) => { setRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x)); setDirty(true); setSaved(false); };
  const add = () => { setRows((r) => [...r, { id: newId(), month: `Month ${r.length}`, cash: '', range: '' }]); setDirty(true); setSaved(false); };
  const remove = (id: string) => { setRows((r) => r.filter((x) => x.id !== id)); setDirty(true); setSaved(false); };
  const save = async () => {
    setSaving(true); setErr('');
    const data: AcqData = { rows };
    const e = await saveAcq(pageId, data, client);
    setSaving(false);
    if (!e) { onSaved(data); setDirty(false); setSaved(true); } else setErr(e);
  };

  const total = rows.reduce((s, r) => s + (parseFloat(String(r.cash).replace(/[^0-9.-]/g, '')) || 0), 0);
  const th: React.CSSProperties = { ...label, textAlign: 'left', padding: '0 4px 8px' };

  return (
    <div style={glass}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '26%' }}>Month</th>
              <th style={{ ...th, width: '30%' }}>Cash Collected</th>
              <th style={{ ...th, width: '34%' }}>Date Range</th>
              <th style={{ ...th, width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: '3px 4px' }}><input value={row.month} onChange={(e) => setCell(row.id, { month: e.target.value })} style={input} /></td>
                <td style={{ padding: '3px 4px' }}><input value={row.cash} onChange={(e) => setCell(row.id, { cash: e.target.value })} placeholder="$0" style={input} /></td>
                <td style={{ padding: '3px 4px' }}><input value={row.range} onChange={(e) => setCell(row.id, { range: e.target.value })} placeholder="e.g. 1–31 Jan" style={input} /></td>
                <td style={{ padding: '3px 4px', textAlign: 'center' }}><button onClick={() => remove(row.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.4)', fontSize: 15 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={add} style={btnGhost}>+ Add month</button>
        <button onClick={save} disabled={!dirty || saving} style={{ ...btnGold, opacity: (!dirty || saving) ? 0.5 : 1, cursor: (!dirty || saving) ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ color: '#4ade80', fontFamily: "'DM Sans', sans-serif", fontSize: 12 }}>Saved ✓</span>}
        {err && <span style={errText}>{err}</span>}
        <span style={{ marginLeft: 'auto', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: 'rgba(240,232,212,0.7)' }}>
          Total: <strong style={{ color: GOLD }}>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
        </span>
      </div>
    </div>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
export function EditablePage({ kind, page, stored, onSaved, client }: {
  kind: AcqEditKind; page: AcqPage; stored: AcqData | undefined; onSaved: (d: AcqData) => void; client?: string;
}) {
  if (kind === 'links') return <LinksEditor pageId={page.id} stored={stored} onSaved={onSaved} client={client} />;
  if (kind === 'cash') return <CashEditor pageId={page.id} stored={stored} onSaved={onSaved} client={client} />;
  if (kind === 'product') return <ProductEditor pageId={page.id} defaultText={page.body} stored={stored} onSaved={onSaved} client={client} />;
  return <DocEditor pageId={page.id} defaultText={page.body} stored={stored} onSaved={onSaved} client={client} />;
}

// ── Admin-managed GLOBAL content (shown to every acquisition client) ──────────

// Read-only render of admin-authored content (text + SOP links + PDFs).
export function AdminContentView({ data }: { data: AcqAdminData | undefined }) {
  const text = (data?.text ?? '').trim();
  const links = (data?.links ?? []).filter((l) => l.url.trim() || l.label.trim());
  const files = data?.files ?? [];
  if (!text && links.length === 0 && files.length === 0) return null;
  return (
    <div style={{ ...glass, marginBottom: '1.25rem' }}>
      {text && <Markdown content={text} />}
      {(links.length > 0 || files.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: text ? 12 : 0 }}>
          {links.map((l) => l.url.trim()
            ? <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" style={pill}>{l.label.trim() || l.url} ↗</a>
            : <span key={l.id} style={{ ...pill, opacity: 0.6 }}>{l.label}</span>)}
          {files.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" style={pill}>📄 {f.name} ↗</a>)}
        </div>
      )}
    </div>
  );
}

// Admin editor: text + SOP links + PDF uploads for one page, saved globally.
export function AdminSectionEditor({ pageId, data, onSaved }: {
  pageId: string; data: AcqAdminData | undefined; onSaved: (d: AcqAdminData) => void;
}) {
  const [text, setText] = useState(data?.text ?? '');
  const [links, setLinks] = useState<AcqLinkItem[]>(data?.links ?? []);
  const [files, setFiles] = useState<AcqFile[]>(data?.files ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const touch = () => { setDirty(true); setSaved(false); };

  const setLink = (id: string, patch: Partial<AcqLinkItem>) => { setLinks((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x)); touch(); };
  const addLink = () => { setLinks((r) => [...r, { id: newId(), label: '', url: '' }]); touch(); };
  const rmLink = (id: string) => { setLinks((r) => r.filter((x) => x.id !== id)); touch(); };
  const rmFile = (id: string) => { setFiles((r) => r.filter((x) => x.id !== id)); touch(); };

  const upload = async (file: File) => {
    setUploading(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('pageId', pageId);
      const r = await fetch('/api/admin/acquisition/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Upload failed'); return; }
      setFiles((f) => [...f, { id: newId(), name: j.name, url: j.url }]); touch();
    } finally { setUploading(false); }
  };
  const save = async () => {
    setSaving(true); setErr('');
    const cleanLinks = links.filter((l) => l.label.trim() || l.url.trim());
    const payload: AcqAdminData = { text, links: cleanLinks, files };
    const e = await saveAdmin(pageId, payload);
    setSaving(false);
    if (!e) { setLinks(cleanLinks); onSaved(payload); setDirty(false); setSaved(true); } else setErr(e);
  };

  return (
    <div style={{ ...glass, border: '1px dashed rgba(201,164,85,0.45)', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={adminBadge}>ADMIN</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(240,232,212,0.6)' }}>Section content — visible to all Acquisition clients</span>
      </div>

      <div style={label}>Text (Markdown)</div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); touch(); }} rows={6}
        placeholder="Optional notes / SOP write-up — Markdown supported…"
        style={{ ...input, minHeight: 120, resize: 'vertical', marginTop: 6, lineHeight: 1.6 }} />

      <div style={{ ...label, marginTop: 18 }}>Links</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {links.map((row) => (
          <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={row.label} onChange={(e) => setLink(row.id, { label: e.target.value })} placeholder="Label" style={{ ...input, flex: '0 0 34%' }} />
            <input value={row.url} onChange={(e) => setLink(row.id, { url: e.target.value })} placeholder="https://…" style={{ ...input, flex: 1 }} />
            <button onClick={() => rmLink(row.id)} title="Remove" style={xBtn}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={addLink} style={{ ...btnGhost, marginTop: 8 }}>+ Add link</button>

      <div style={{ ...label, marginTop: 18 }}>PDFs</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {files.map((f) => (
          <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: GOLD, fontFamily: "'DM Sans', sans-serif", fontSize: 13, textDecoration: 'none', flex: 1 }}>📄 {f.name} ↗</a>
            <button onClick={() => rmFile(f.id)} title="Remove" style={xBtn}>✕</button>
          </div>
        ))}
      </div>
      <label style={{ ...btnGhost, marginTop: 8, display: 'inline-block', opacity: uploading ? 0.6 : 1 }}>
        {uploading ? 'Uploading…' : '+ Upload PDF'}
        <input type="file" accept="application/pdf" disabled={uploading} style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
      </label>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18 }}>
        <button onClick={save} disabled={!dirty || saving} style={{ ...btnGold, opacity: (!dirty || saving) ? 0.5 : 1, cursor: (!dirty || saving) ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save section'}</button>
        {saved && <span style={okText}>Saved ✓</span>}
        {err && <span style={errText}>{err}</span>}
      </div>
    </div>
  );
}
