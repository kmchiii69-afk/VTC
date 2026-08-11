'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@vercel/analytics';
import { WavesBackground } from '@/components/ui/waves-shader';

function MeshGradientWrapper() {
  return (
    <div className="!fixed inset-0 w-full h-full" style={{ pointerEvents: 'none' }} aria-hidden>
      <WavesBackground className="h-full w-full" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hadError, setHadError] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [submitted, setSubmitted] = useState(false); // signup request sent → awaiting approval
  const emailRef = useRef<HTMLInputElement>(null);

  // New clients (role 'user' with no onboarded_at) go through onboarding first;
  // everyone else lands on /select. Returns false if not signed in.
  const routeAfterAuth = async (): Promise<boolean> => {
    try {
      const me = await fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null));
      if (!me) return false;
      if (me.role === 'admin') { router.push('/select'); return true; }
      const ob = await fetch('/api/me/onboarding', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
      if (!ob || !ob.onboardedAt) { router.push('/onboarding'); return true; }
      // Everyone who's onboarded lands on the content select screen.
      router.push('/select');
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    emailRef.current?.focus();
    routeAfterAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flashError = (msg: string, clearPass = true) => {
    setErrorMsg(msg);
    setError(true);
    setHadError(true);
    if (clearPass) setPassword('');
    setTimeout(() => { setError(false); setErrorMsg(''); }, 1800);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError(false);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        track('login', { email: email.trim() });
        await routeAfterAuth();
      } else {
        const data = await res.json().catch(() => ({}));
        flashError(data.error || 'Invalid credentials');
      }
    } catch {
      flashError('Connection error', false);
    }
    setLoading(false);
  };

  const handleSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password || loading) return;
    if (password.length < 8) { flashError('Password must be at least 8 characters', false); return; }
    setLoading(true);
    setError(false);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      if (res.ok) {
        setSubmitted(true);
        setPassword('');
      } else {
        const data = await res.json().catch(() => ({}));
        flashError(data.error || 'Could not submit request');
      }
    } catch {
      flashError('Connection error', false);
    }
    setLoading(false);
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError(false);
    setErrorMsg('');
    setPassword('');
    setSubmitted(false);
  };

  const box: React.CSSProperties = {
    width: 280,
    height: 44,
    background: error ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
    borderRadius: 10,
    padding: '0 16px',
    fontSize: '13px',
    color: '#f0e8d4',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.02em',
    transition: 'border-color 0.2s, background 0.2s',
    animation: error ? 'shake 0.4s ease' : 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <Suspense fallback={null}><MeshGradientWrapper /></Suspense>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 60%, rgba(0,0,0,0.2) 100%)',
      }} />

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}80%{transform:translateX(4px)}
        }
        .ba-input::placeholder { color: rgba(240,232,212,0.18); }
        .ba-input:focus {
          border-color: rgba(183,93,105,0.28) !important;
          background: rgba(183,93,105,0.02) !important;
        }
      `}</style>

      <div className="fade-up" style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 0, padding: '2rem',
      }}>
        <p style={{
          fontSize: '11px', letterSpacing: '0.45em', textTransform: 'uppercase',
          color: 'rgba(183,93,105,0.6)', fontWeight: 400, marginBottom: '2.5rem',
        }}>
          VTC
        </p>

        {submitted ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 300 }}>
            <p style={{ fontSize: 14, color: '#f0e8d4', textAlign: 'center', lineHeight: 1.5 }}>
              Request submitted.
            </p>
            <p style={{ fontSize: 12, color: 'rgba(240,232,212,0.55)', textAlign: 'center', lineHeight: 1.6 }}>
              You&apos;ll be able to sign in once an admin approves your account.
            </p>
            <button
              type="button"
              onClick={() => switchMode('login')}
              style={{
                marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(183,93,105,0.7)', fontSize: 12, letterSpacing: '0.1em',
              }}
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
        <form onSubmit={mode === 'signup' ? handleSignup : handleSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {mode === 'signup' && (
            <input
              className="ba-input"
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(false); }}
              autoComplete="name"
              disabled={loading}
              style={box}
            />
          )}
          <input
            ref={emailRef}
            className="ba-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(false); }}
            autoComplete="email"
            disabled={loading}
            style={box}
          />
          <div style={{ position: 'relative', width: 280 }}>
            <input
              className="ba-input"
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
              style={{ ...box, width: '100%', paddingRight: hadError ? 38 : 16 }}
            />
            {hadError && (
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: showPass ? 'rgba(183,93,105,0.7)' : 'rgba(240,232,212,0.25)',
                  fontSize: 14, lineHeight: 1, transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(183,93,105,0.7)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = showPass ? 'rgba(183,93,105,0.7)' : 'rgba(240,232,212,0.25)')}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            )}
          </div>

          {/* Arrow submit */}
          <button
            type="submit"
            disabled={loading || !email || !password || (mode === 'signup' && !name.trim())}
            style={{
              marginTop: 6,
              background: 'none',
              border: 'none',
              color: loading ? 'rgba(183,93,105,0.25)' : 'rgba(183,93,105,0.7)',
              fontSize: 22, lineHeight: 1,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.2s',
              padding: '8px',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.color = '#B75D69';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(183,93,105,0.7)';
            }}
          >
            {loading ? '·' : '→'}
          </button>
        </form>
        )}

        <div style={{ height: 18, display: 'flex', alignItems: 'center', marginTop: 10 }}>
          {errorMsg && (
            <span style={{ fontSize: '12px', color: '#ef4444', letterSpacing: '0.04em' }}>
              {errorMsg}
            </span>
          )}
        </div>

        {!submitted && (
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            style={{
              marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(183,93,105,0.6)', fontSize: 12, letterSpacing: '0.05em',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#B75D69')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(183,93,105,0.6)')}
          >
            {mode === 'login' ? 'Request access' : '← Back to sign in'}
          </button>
        )}

        <p style={{
          marginTop: 14, fontSize: '11px', letterSpacing: '0.15em',
          textTransform: 'uppercase', color: 'rgba(90,82,72,0.8)',
        }}>
          {mode === 'signup' ? 'Approval Required' : 'Licensed Members Only'}
        </p>
      </div>
    </div>
  );
}
