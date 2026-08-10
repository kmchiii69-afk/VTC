'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UserProfile {
  email: string;
  name: string;
  avatar: string;
  role?: string;
  activity_level?: string;
}

function ActionBtn({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', padding: '11px 16px',
        background: danger
          ? (hov ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)')
          : (hov ? 'rgba(201,164,85,0.1)' : 'rgba(255,255,255,0.03)'),
        border: `1px solid ${danger
          ? (hov ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.12)')
          : (hov ? 'rgba(201,164,85,0.3)' : 'rgba(255,255,255,0.08)')}`,
        borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        color: danger ? 'rgba(239,68,68,0.7)' : 'rgba(240,232,212,0.6)',
        fontFamily: "'DM Sans', sans-serif", fontSize: 13,
        textAlign: 'left', transition: 'all 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  very_active: 'Very Active', active: 'Active', moderate: 'Moderate',
  low: 'Low Activity', inactive: 'Inactive', '': '',
};

const panelInput: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: 'rgba(240,232,212,0.85)',
  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
};

export function ProfileButton({ offsetTop = 26 }: { offsetTop?: number }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'view' | 'edit' | 'password'>('view');
  const [name, setName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hovered, setHovered] = useState(false);
  const [prog, setProg] = useState<{ total: number; phase: number; phaseLabel: string } | null>(null);
  const [acqAdmin, setAcqAdmin] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) { setUser(d); setName(d.name || ''); setAvatarPreview(d.avatar || ''); }
      })
      .catch(() => {});

    // Acquisition-admin link: shown to non-admin members holding the acq_admin tag.
    fetch('/api/me/features')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (Array.isArray(d?.features) && d.features.includes('acq_admin')) setAcqAdmin(true); })
      .catch(() => {});

    // Coaching check-in progress (count + current roadmap phase). Empty for
    // users with no recorded check-ins (e.g. admins) — the card won't render.
    fetch('/api/me/progress')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setProg({
          total: d.counts?.total ?? 0,
          phase: d.progress?.current_phase ?? 0,
          phaseLabel: d.progress?.current_phase_label ?? '',
        });
      })
      .catch(() => {});
  }, []);

  const initials = user?.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '?';

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg('Images only'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        setAvatarPreview(canvas.toDataURL('image/jpeg', 0.82));
        setMsg('');
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setSaving(true); setMsg('');
    const res = await fetch('/api/auth/update-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar: avatarPreview }),
    });
    if (res.ok) {
      const d = await res.json();
      setUser((prev) => prev ? { ...prev, name: d.name, avatar: d.avatar } : prev);
      setMsg('Saved');
      setTimeout(() => { setMsg(''); setTab('view'); }, 1200);
    } else { setMsg('Failed'); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { setMsg('Passwords do not match'); return; }
    if (newPw.length < 8) { setMsg('Min 8 characters'); return; }
    setSaving(true); setMsg('');
    const res = await fetch('/api/auth/update-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    });
    if (res.ok) {
      setMsg('Password updated');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setMsg(''); setTab('view'); }, 1200);
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || 'Failed');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  const resetPanel = () => { setTab('view'); setMsg(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); };

  if (!user) return null;

  return (
    <>
      {/* Minimal profile trigger */}
      <button
        onClick={() => { setOpen(true); resetPanel(); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed', top: offsetTop, right: 28, zIndex: 60,
          width: 46, height: 46, borderRadius: '50%',
          background: avatarPreview ? '#0a0806' : 'radial-gradient(circle at 32% 28%, rgba(201,164,85,0.24), rgba(201,164,85,0.05))',
          border: 'none', padding: 0, cursor: 'pointer', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: hovered
            ? '0 0 0 1.5px rgba(201,164,85,0.9), 0 0 0 5px rgba(201,164,85,0.18), 0 0 22px rgba(201,164,85,0.4), 0 8px 22px rgba(0,0,0,0.5)'
            : '0 0 0 1.5px rgba(201,164,85,0.55), 0 0 0 4px rgba(201,164,85,0.1), 0 6px 18px rgba(0,0,0,0.45)',
          transform: hovered ? 'translateY(-1px)' : 'none',
          transition: 'box-shadow 0.28s ease, transform 0.28s ease',
        }}
      >
        {avatarPreview
          ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13.5px', fontWeight: 600, color: '#e8d39a', letterSpacing: '0.04em' }}>{initials}</span>
        }
      </button>

      {/* Panel backdrop + drawer */}
      {open && (
        <div onClick={() => { setOpen(false); resetPanel(); }} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 310, height: '100%',
            background: '#0a0806',
            borderLeft: '1px solid rgba(201,164,85,0.1)',
            display: 'flex', flexDirection: 'column',
            padding: '28px 22px', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.45)' }}>Profile</span>
              <button onClick={() => { setOpen(false); resetPanel(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,232,212,0.55)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
            </div>

            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div
                onClick={() => tab === 'edit' && fileRef.current?.click()}
                style={{
                  width: 68, height: 68, borderRadius: '50%',
                  background: avatarPreview ? 'transparent' : 'rgba(201,164,85,0.1)',
                  border: '1.5px solid rgba(201,164,85,0.22)',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: tab === 'edit' ? 'pointer' : 'default',
                }}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 600, color: 'rgba(201,164,85,0.75)' }}>{initials}</span>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />

              {tab === 'view' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, color: 'rgba(240,232,212,0.85)' }}>{user.name || 'Member'}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(240,232,212,0.55)', marginTop: 3 }}>{user.email}</div>
                  {user.activity_level && ACTIVITY_LABELS[user.activity_level] && (
                    <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 12px', borderRadius: 20, background: 'rgba(201,164,85,0.07)', border: '1px solid rgba(201,164,85,0.14)', fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)' }}>
                      {ACTIVITY_LABELS[user.activity_level]}
                    </div>
                  )}
                </div>
              )}
              {tab === 'edit' && (
                <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: 'rgba(201,164,85,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Change Photo
                </button>
              )}
            </div>

            {/* View */}
            {tab === 'view' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {/* Coaching check-in progress: current phase + count (members only) */}
                {prog && (prog.total > 0 || prog.phase > 0) && (
                  <div style={{
                    border: '1px solid rgba(201,164,85,0.14)', borderRadius: 12,
                    background: 'rgba(201,164,85,0.04)', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 4,
                  }}>
                    {prog.phase > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>Current Phase</span>
                        <span style={{ fontSize: 12, color: 'rgba(240,232,212,0.85)', fontFamily: "'DM Sans', sans-serif", textAlign: 'right' }}>Phase {prog.phase} · {prog.phaseLabel}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif" }}>Check-ins</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#c9a455', fontFamily: "'DM Sans', sans-serif" }}>{prog.total}</span>
                    </div>
                  </div>
                )}
                {/* Quick navigation — /portal is admin-only now; clients use /select + /hub. */}
                {user.role === 'admin' && (
                  <>
                    <ActionBtn onClick={() => { setOpen(false); router.push('/portal'); }}>My Dashboard (admin)</ActionBtn>
                    <ActionBtn onClick={() => { setOpen(false); router.push('/admin'); }}>Admin Panel</ActionBtn>
                  </>
                )}
                {/* Acq-admins (non-admin members with the acq_admin tag) get their own
                    read-only client panel — admins reach the same clients via /admin. */}
                {user.role !== 'admin' && acqAdmin && (
                  <ActionBtn onClick={() => { setOpen(false); router.push('/acquisition-admin'); }}>Acquisition Clients</ActionBtn>
                )}
                <ActionBtn onClick={() => setTab('edit')}>Edit Profile</ActionBtn>
                <ActionBtn onClick={() => setTab('password')}>Change Password</ActionBtn>
                <div style={{ flex: 1 }} />
                <ActionBtn onClick={handleLogout} danger>Sign Out</ActionBtn>
              </div>
            )}

            {/* Edit */}
            {tab === 'edit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <input style={panelInput} placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
                {msg && <span style={{ fontSize: 12, color: msg === 'Saved' ? '#4ade80' : '#ef4444' }}>{msg}</span>}
                <ActionBtn onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</ActionBtn>
                <ActionBtn onClick={() => { setTab('view'); setMsg(''); }}>Cancel</ActionBtn>
              </div>
            )}

            {/* Password */}
            {tab === 'password' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                <input type="password" style={panelInput} placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                <input type="password" style={panelInput} placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <input type="password" style={panelInput} placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                {msg && <span style={{ fontSize: 12, color: msg === 'Password updated' ? '#4ade80' : '#ef4444' }}>{msg}</span>}
                <ActionBtn onClick={handleChangePassword} disabled={saving}>{saving ? 'Updating…' : 'Update Password'}</ActionBtn>
                <ActionBtn onClick={() => { setTab('view'); setMsg(''); }}>Cancel</ActionBtn>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
