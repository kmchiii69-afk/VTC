'use client';

import { useEffect, useRef, useState } from 'react';
import { THEME as T } from '@/lib/theme';

// Themed dropdown replacing native <select> so the option menu matches the app
// (the OS-rendered <select> popup can't be styled). Flat pill trigger + dark
// glass menu with rose hover.

export interface Opt { value: string; label: string }

export function Select({ value, options, onChange, placeholder, disabled, width, minWidth = 120, accentValue }: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
  minWidth?: number | string;
  accentValue?: string; // colour the trigger with the accent (e.g. health flag)
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const current = options.find((o) => o.value === value);
  const color = accentValue ?? T.ink;

  return (
    <div ref={ref} style={{ position: 'relative', width, minWidth, display: 'inline-block' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', height: 36, padding: '0 12px', borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'rgba(0,0,0,0.28)', border: `1px solid ${accentValue ? accentValue : T.border}`,
          color, fontSize: 13, fontWeight: accentValue ? 700 : 500, cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label ?? placeholder ?? 'Select…'}</span>
        <span style={{ color: T.accentSoft, fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: '100%', zIndex: 70,
          background: 'rgba(24,17,30,0.98)', border: `1px solid ${T.border}`, borderRadius: 12, padding: 6,
          maxHeight: 320, overflowY: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        }}>
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  padding: '9px 12px', borderRadius: 9, border: 'none', background: 'transparent',
                  color: sel ? T.accentSoft : T.ink, fontSize: 13, fontWeight: sel ? 700 : 500,
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234,205,194,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 12, flexShrink: 0, color: T.accentSoft }}>{sel ? '✓' : ''}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
