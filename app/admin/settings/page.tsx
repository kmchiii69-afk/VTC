'use client';

import { useEffect, useState } from 'react';
import { THEME as T } from '@/lib/theme';
import { AdminNav } from '@/components/ui/admin-nav';

// Owner stage/SLA editor — the "roadmap" lever. Edit the hours each stage is
// allowed before it flags at-risk/overdue across every board.

interface Stage { key: string; label: string; owner: string; actor: string; }

export default function SettingsPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) throw new Error('Owner only.'); return r.json(); })
      .then((d) => { setStages(d.stages ?? []); setHours(d.slaHours ?? {}); })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true); setErr(null); setSaved(false);
    try {
      const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slaHours: hours }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setHours(d.slaHours); setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  const input: React.CSSProperties = { width: 90, height: 34, padding: '0 12px', borderRadius: 999, fontSize: 13, background: 'rgba(0,0,0,0.28)', border: `1px solid ${T.border}`, color: T.ink, textAlign: 'right' };
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12 };

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <AdminNav />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px,5vw,48px) clamp(20px,5vw,32px)' }}>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accentSoft, marginBottom: 10 }}>VTC · Owner</div>
        <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, marginBottom: 6 }}>Stage SLAs</h1>
        <p style={{ color: T.inkDim, marginBottom: 24, lineHeight: 1.6 }}>How many hours each stage gets before it flags at-risk (last 25%) then overdue. Drives the SLA badges on every board.</p>

        {err && <p style={{ color: T.accent, marginBottom: 16 }}>{err}</p>}
        {loading && <p style={{ color: T.inkDim }}>Loading…</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((s) => (
            <div key={s.key} style={row}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: T.inkDim }}>{s.actor === 'client' ? 'client step' : s.owner}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min={1} value={hours[s.key] ?? ''} onChange={(e) => setHours((h) => ({ ...h, [s.key]: Number(e.target.value) }))} style={input} />
                <span style={{ fontSize: 12.5, color: T.inkDim, width: 40 }}>hours</span>
              </div>
            </div>
          ))}
        </div>

        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
            <button disabled={busy} onClick={save} style={{ padding: '10px 22px', borderRadius: 999, border: 'none', background: T.accent, color: T.accentInk, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Save SLAs</button>
            {saved && <span style={{ color: T.ok, fontSize: 13 }}>Saved ✓</span>}
          </div>
        )}
      </div>
    </div>
  );
}
