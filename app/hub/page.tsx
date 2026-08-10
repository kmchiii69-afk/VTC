'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { track } from '@vercel/analytics';
import { RECORDING_CATEGORIES, RECORDING_CATEGORY_IDS, CHECKIN_CATEGORY, recordingCategory, type Recording } from '@/lib/recordings';
import { RecordingsPlayer } from '@/components/ui/recording-item';
import { BreakdownsSection } from '@/components/ui/breakdowns-section';
import { SkeletonList } from '@/components/ui/loaders';
import { PageTour } from '@/components/ui/page-tour';
import type { TourStep } from '@/components/onboarding/onboarding-tour';

const HUB_TOUR: TourStep[] = [
  { title: 'Your member hub', body: "Quick orientation — this is your jumping-off point." },
  { target: 'hub-nav', title: 'Pick a section', body: 'Open your modules or browse call recordings by category right from here.' },
];

// A section is a recording-category id, 'group-calls' (the calls submenu),
// 'breakdowns', or null for the top-level menu. The hub pulls the exact same
// recordings as the portal from /api/recordings.
type Section = string | null;

// Intermediate menu: "Group Calls" expands to the individual call categories.
const GROUP_CALLS = 'group-calls';

// Sections that get their own shareable /hub?s=<section> URL. Program Modules is
// excluded — it has its own dedicated /modules page.
const VALID_SECTIONS: string[] = [GROUP_CALLS, 'breakdowns', CHECKIN_CATEGORY.id, ...RECORDING_CATEGORY_IDS];

interface UserProfile {
  email: string;
  name: string;
  avatar: string;
  role: string;
  activity_level: string;
  discord_id: string;
}

function NavItem({ label, count, onClick, disabled }: {
  label: string; count: string; onClick?: () => void; disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={disabled}
      style={{
        background: 'none', border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'baseline', gap: 16,
        padding: '8px 20px',
        transition: 'opacity 0.2s',
        opacity: disabled ? 0.18 : hovered ? 1 : 0.6,
      }}
    >
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 'clamp(2.4rem, 5.5vw, 4rem)',
        fontWeight: 300,
        color: hovered ? '#f0e8d4' : 'rgba(240,232,212,0.85)',
        letterSpacing: '-0.01em', lineHeight: 1,
        transition: 'color 0.2s',
      }}>
        {label}
      </span>
      {count && (
        <span style={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px', fontWeight: 400,
          color: hovered ? 'rgba(201,164,85,0.7)' : 'rgba(201,164,85,0.3)',
          transition: 'color 0.2s', paddingBottom: 6,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function ProfileCircle({ user, onOpen }: { user: UserProfile | null; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || '?';

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed', top: 26, right: 28, zIndex: 20,
        width: 44, height: 44, borderRadius: '50%',
        background: user?.avatar ? 'transparent' : 'rgba(201,164,85,0.07)',
        border: `1px solid ${hovered ? 'rgba(201,164,85,0.55)' : 'rgba(201,164,85,0.25)'}`,
        cursor: 'pointer', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.25s, opacity 0.25s, background 0.25s',
        opacity: hovered ? 1 : 0.75,
        padding: 0,
      }}
    >
      {user?.avatar ? (
        <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '13px', fontWeight: 600,
          color: 'rgba(201,164,85,0.9)', letterSpacing: '0.04em',
        }}>
          {initials}
        </span>
      )}
    </button>
  );
}

function ProfilePanel({
  user,
  onClose,
  onLogout,
  onProfileSaved,
}: {
  user: UserProfile;
  onClose: () => void;
  onLogout: () => void;
  onProfileSaved: (updated: Partial<UserProfile>) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'view' | 'edit' | 'password'>('view');
  const [name, setName] = useState(user.name || '');
  const [avatarPreview, setAvatarPreview] = useState(user.avatar || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const activityLabel: Record<string, string> = {
    very_active: 'Very Active',
    active: 'Active',
    moderate: 'Moderate',
    low: 'Low Activity',
    inactive: 'Inactive',
    '': 'Not set',
  };

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
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar: avatarPreview }),
      });
      if (res.ok) {
        const data = await res.json();
        onProfileSaved({ name: data.name, avatar: data.avatar });
        setMsg('Saved');
        setTimeout(() => { setMsg(''); setTab('view'); }, 1200);
      } else {
        setMsg('Failed to save');
      }
    } catch { setMsg('Error saving'); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { setMsg('Passwords do not match'); return; }
    if (newPw.length < 8) { setMsg('Min 8 characters'); return; }
    setSaving(true); setMsg('');
    try {
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
    } catch { setMsg('Error'); }
    setSaving(false);
  };

  const panelInput: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: '#f0e8d4',
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 320, height: '100%',
          background: '#0a0806',
          borderLeft: '1px solid rgba(201,164,85,0.12)',
          display: 'flex', flexDirection: 'column',
          padding: '28px 24px',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '10px', letterSpacing: '0.3em',
            textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)',
          }}>Profile</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(240,232,212,0.55)', fontSize: 18, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: avatarPreview ? 'transparent' : 'rgba(201,164,85,0.12)',
            border: '1.5px solid rgba(201,164,85,0.25)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: tab === 'edit' ? 'pointer' : 'default',
          }}
            onClick={() => tab === 'edit' && fileRef.current?.click()}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 600,
                color: 'rgba(201,164,85,0.8)',
              }}>
                {(name || user.email).slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          {tab === 'edit' && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              <button onClick={() => fileRef.current?.click()} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                color: 'rgba(201,164,85,0.5)', letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                Change Photo
              </button>
            </>
          )}
          {tab === 'view' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 20, fontWeight: 300, color: '#f0e8d4',
                }}>
                  {user.name || 'Member'}
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12, color: 'rgba(240,232,212,0.56)', marginTop: 4,
                }}>
                  {user.email}
                </div>
              </div>
              {user.activity_level && (
                <div style={{
                  padding: '4px 12px', borderRadius: 20,
                  background: 'rgba(201,164,85,0.08)',
                  border: '1px solid rgba(201,164,85,0.15)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10, letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(201,164,85,0.6)',
                }}>
                  {activityLabel[user.activity_level] || user.activity_level}
                </div>
              )}
            </>
          )}
        </div>

        {/* Tabs */}
        {tab === 'view' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {/* Quick navigation. /portal is admin-only now — clients use /select. */}
            {user.role === 'admin' && (
              <>
                <ActionBtn onClick={() => { onClose(); router.push('/portal'); }}>My Dashboard (admin)</ActionBtn>
                <ActionBtn onClick={() => { onClose(); router.push('/admin'); }}>Admin Panel</ActionBtn>
              </>
            )}
            <ActionBtn onClick={() => setTab('edit')}>Edit Profile</ActionBtn>
            <ActionBtn onClick={() => setTab('password')}>Change Password</ActionBtn>
            <div style={{ flex: 1 }} />
            <ActionBtn onClick={onLogout} danger>Sign Out</ActionBtn>
          </div>
        )}

        {tab === 'edit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            <input
              style={panelInput}
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {msg && <span style={{ fontSize: 12, color: msg === 'Saved' ? '#4ade80' : '#ef4444' }}>{msg}</span>}
            <ActionBtn onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </ActionBtn>
            <ActionBtn onClick={() => { setTab('view'); setMsg(''); }}>Cancel</ActionBtn>
          </div>
        )}

        {tab === 'password' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <input type="password" placeholder="Current password" value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)} style={panelInput} />
            <input type="password" placeholder="New password" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} style={panelInput} />
            <input type="password" placeholder="Confirm new password" value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)} style={panelInput} />
            {msg && <span style={{ fontSize: 12, color: msg === 'Password updated' ? '#4ade80' : '#ef4444' }}>{msg}</span>}
            <ActionBtn onClick={handleChangePassword} disabled={saving}>
              {saving ? 'Updating…' : 'Update Password'}
            </ActionBtn>
            <ActionBtn onClick={() => { setTab('view'); setMsg(''); }}>Cancel</ActionBtn>
          </div>
        )}
      </div>
    </div>
  );
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


export default function HubPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [section, setSection] = useState<Section>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [checkins, setCheckins] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<string[]>([]);
  const [deepRecId, setDeepRecId] = useState<string | null>(null); // from /hub?rec=<id>
  const recResolved = useRef(false);

  // Each section has its own URL (/hub?s=<section>). Navigating pushes a history
  // entry so the browser back button walks back through the menu and links are
  // shareable. setSectionUrl is the single entry point for all section changes.
  const setSectionUrl = (sec: Section) => {
    setSection(sec);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', sec ? `/hub?s=${encodeURIComponent(sec)}` : '/hub');
    }
  };
  // Sync section from the URL on first load and on back/forward navigation.
  useEffect(() => {
    const sync = () => {
      const s = new URLSearchParams(window.location.search).get('s');
      setSection(s && VALID_SECTIONS.includes(s) ? s : null);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setUser(data);
          setTimeout(() => setVisible(true), 80);
          track('hub_visit', {
            email: data.email,
            name: data.name || '',
            activity_level: data.activity_level || '',
            discord_id: data.discord_id || '',
            role: data.role || '',
          });
        } else router.push('/');
      })
      .catch(() => router.push('/'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Same recordings as the portal — single source of truth at /api/recordings.
  // Admins manage (add/edit/delete) recordings here in /hub.
  const loadRecordings = () => {
    fetch('/api/recordings')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRecordings(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  const deleteRecording = async (id: string) => {
    await fetch(`/api/recordings/${id}`, { method: 'DELETE' }).catch(() => {});
    loadRecordings();
  };
  useEffect(() => {
    loadRecordings();
    // The client's own private 1-1 check-in calls (separate source from the group
    // recordings). Scoped server-side to the session email.
    fetch('/api/me/checkins', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCheckins(Array.isArray(d) ? d : []))
      .catch(() => {});
    // Feature access (unlocks the Modules tile when granted).
    fetch('/api/me/features', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.features)) setFeatures(d.features); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: /hub?rec=<id> opens that recording's group-call category with the
  // recording preselected. Resolved once, after recordings load.
  useEffect(() => {
    if (recResolved.current || !recordings.length) return;
    const rec = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('rec') : null;
    if (!rec) { recResolved.current = true; return; }
    const found = recordings.find((r) => r.id === rec);
    if (found && RECORDING_CATEGORY_IDS.includes(found.category)) {
      setSection(found.category);
      setDeepRecId(rec);
    }
    recResolved.current = true;
  }, [recordings]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  if (!user) return null;

  const isCheckins = section === CHECKIN_CATEGORY.id;
  const isCallCat = !!section && RECORDING_CATEGORY_IDS.includes(section);
  // Menu views (top level + the Group Calls submenu) center vertically on screen;
  // content views (recording lists) sit at the top and scroll.
  const isMenu = !section || section === GROUP_CALLS;
  const recordingsFor = (catId: string) =>
    (catId === CHECKIN_CATEGORY.id ? checkins : recordings).filter((r) => r.category === catId);
  const selectedCat = section ? recordingCategory(section) : null;
  const selectedItems = section ? recordingsFor(section) : [];
  // Back goes up ONE level: a call category or the guest-mastermind breakdowns
  // (both now live under Group Calls) → the Group Calls submenu; anything else
  // (submenu / check-ins) → the top menu.
  const goUp = () => setSectionUrl(isCallCat || section === 'breakdowns' ? GROUP_CALLS : null);

  return (
    <main style={{
      position: 'relative', width: '100vw', height: '100vh',
      overflow: 'hidden', background: '#050403',
    }}>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <MeshBg speed={0.2} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)',
      }} />

      {/* Cinematic transition overlay */}
      {/* Profile circle */}
      <ProfileCircle user={user} onOpen={() => setProfileOpen(true)} />

      {/* Profile panel */}
      {profileOpen && (
        <ProfilePanel
          user={user}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
          onProfileSaved={(u) => setUser((prev) => prev ? { ...prev, ...u } : prev)}
        />
      )}

      {/* Back / Menu */}
      <button
        onClick={() => section ? goUp() : router.push('/select')}
        style={{
          position: 'fixed', top: 28, left: 32, zIndex: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(201,164,85,0.5)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
          fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'color 0.2s', padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >
        {section ? '← Back' : '← Menu'}
      </button>

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 2,
        height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isMenu ? 'center' : 'flex-start',
        overflowY: isMenu ? 'hidden' : 'auto',
        padding: isMenu ? 0 : '96px 24px 72px',
        opacity: visible ? 1 : 0,
        animation: visible ? 'fadeUp 0.55s ease forwards' : 'none',
      }}>

        {section && section !== GROUP_CALLS && <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '10px', letterSpacing: '0.3em',
          textTransform: 'uppercase', fontWeight: 700,
          color: 'rgba(201,164,85,0.4)',
          marginBottom: 32, flexShrink: 0,
          width: '100%', maxWidth: 920, marginLeft: 'auto', marginRight: 'auto',
          textAlign: 'left',
        }}>
          {section === 'breakdowns' ? 'Exclusive Guest Masterminds' : isCheckins ? `${CHECKIN_CATEGORY.name} · Private` : selectedCat ? `${selectedCat.day} · ${selectedCat.name} · ${selectedCat.coach}` : 'Member Portal'}
        </p>}

        {!section ? (
          <div data-tour="hub-nav" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <NavItem
              label="Program Modules"
              count=""
              disabled={!(user.role === 'admin' || features.includes('modules'))}
              onClick={(user.role === 'admin' || features.includes('modules'))
                ? () => { track('hub_nav', { section: 'Modules', email: user.email || '', activity_level: user.activity_level || '' }); router.push('/modules'); }
                : undefined}
            />
            <NavItem
              label="Group Calls"
              count={String(recordings.filter((r) => RECORDING_CATEGORY_IDS.includes(r.category)).length)}
              onClick={() => { track('hub_nav', { section: 'Group Calls', email: user?.email || '', activity_level: user?.activity_level || '' }); setSectionUrl(GROUP_CALLS); }}
            />
            {checkins.length > 0 && (
              <NavItem
                label={CHECKIN_CATEGORY.name}
                count={String(checkins.length)}
                onClick={() => { track('hub_nav', { section: CHECKIN_CATEGORY.name, email: user?.email || '', activity_level: user?.activity_level || '' }); setSectionUrl(CHECKIN_CATEGORY.id); }}
              />
            )}
          </div>
        ) : section === GROUP_CALLS ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '10px', letterSpacing: '0.3em',
              textTransform: 'uppercase', fontWeight: 700,
              color: 'rgba(201,164,85,0.4)',
              margin: '0 0 24px', paddingLeft: 20,
            }}>
              Group Calls
            </p>
            {RECORDING_CATEGORIES.map((c) => (
              <NavItem
                key={c.id}
                label={c.name}
                count={String(recordingsFor(c.id).length)}
                onClick={() => { track('hub_nav', { section: c.name, email: user?.email || '', activity_level: user?.activity_level || '' }); setSectionUrl(c.id); }}
              />
            ))}
            {/* Fourth heading under Group Calls: the guest-mastermind breakdowns. */}
            <NavItem
              label="Exclusive Guest Masterminds"
              count=""
              onClick={() => { track('hub_nav', { section: 'Exclusive Guest Masterminds', email: user?.email || '', activity_level: user?.activity_level || '' }); setSectionUrl('breakdowns'); }}
            />
          </div>
        ) : section === 'breakdowns' ? (
          <BreakdownsSection isAdmin={user.role === 'admin'} />
        ) : (
          <div style={{ width: '100%', maxWidth: 1180 }}>
            {loading ? (
              <SkeletonList rows={3} />
            ) : (
              <RecordingsPlayer
                recordings={selectedItems}
                // Check-ins are managed in the CSM board, never edited here — render
                // them read-only even for admins (no add/edit/delete controls).
                isAdmin={isCheckins ? false : user.role === 'admin'}
                onDelete={isCheckins ? undefined : deleteRecording}
                onChanged={isCheckins ? undefined : loadRecordings}
                title={selectedCat?.name ?? 'Recordings'}
                blurb={selectedCat?.blurb}
                onBack={goUp}
                backLabel={isCallCat ? 'Group Calls' : 'Menu'}
                hideSummary={isCheckins}
                initialId={deepRecId ?? undefined}
              />
            )}
          </div>
        )}
      </div>

      <PageTour id="hub" steps={HUB_TOUR} />
    </main>
  );
}
