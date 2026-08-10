'use client';

/* Reusable international phone input used on every funnel application. A
 * searchable country-code dropdown (flag + dial code) sits beside a national-
 * number field, and the component emits a clean E.164 string (+<code><digits>)
 * — exactly the format Calendly accepts — so leads never have to type the +
 * or country code themselves. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizePhone } from '@/lib/contact-format';

type C = { n: string; c: string; d: string };

/* [name, ISO2, dial code] — popular markets pinned first, then alphabetical. */
const RAW: [string, string, string][] = [
  ['United States', 'US', '1'], ['United Kingdom', 'GB', '44'], ['Canada', 'CA', '1'], ['Australia', 'AU', '61'],
  ['Afghanistan', 'AF', '93'], ['Albania', 'AL', '355'], ['Algeria', 'DZ', '213'], ['Andorra', 'AD', '376'],
  ['Angola', 'AO', '244'], ['Argentina', 'AR', '54'], ['Armenia', 'AM', '374'], ['Aruba', 'AW', '297'],
  ['Austria', 'AT', '43'], ['Azerbaijan', 'AZ', '994'], ['Bahamas', 'BS', '1242'], ['Bahrain', 'BH', '973'],
  ['Bangladesh', 'BD', '880'], ['Barbados', 'BB', '1246'], ['Belarus', 'BY', '375'], ['Belgium', 'BE', '32'],
  ['Belize', 'BZ', '501'], ['Benin', 'BJ', '229'], ['Bermuda', 'BM', '1441'], ['Bhutan', 'BT', '975'],
  ['Bolivia', 'BO', '591'], ['Bosnia and Herzegovina', 'BA', '387'], ['Botswana', 'BW', '267'], ['Brazil', 'BR', '55'],
  ['Brunei', 'BN', '673'], ['Bulgaria', 'BG', '359'], ['Burkina Faso', 'BF', '226'], ['Burundi', 'BI', '257'],
  ['Cambodia', 'KH', '855'], ['Cameroon', 'CM', '237'], ['Cape Verde', 'CV', '238'], ['Cayman Islands', 'KY', '1345'],
  ['Chad', 'TD', '235'], ['Chile', 'CL', '56'], ['China', 'CN', '86'], ['Colombia', 'CO', '57'],
  ['Congo (DRC)', 'CD', '243'], ['Congo (Republic)', 'CG', '242'], ['Costa Rica', 'CR', '506'], ["Côte d'Ivoire", 'CI', '225'],
  ['Croatia', 'HR', '385'], ['Cuba', 'CU', '53'], ['Cyprus', 'CY', '357'], ['Czechia', 'CZ', '420'],
  ['Denmark', 'DK', '45'], ['Dominican Republic', 'DO', '1809'], ['Ecuador', 'EC', '593'], ['Egypt', 'EG', '20'],
  ['El Salvador', 'SV', '503'], ['Estonia', 'EE', '372'], ['Ethiopia', 'ET', '251'], ['Fiji', 'FJ', '679'],
  ['Finland', 'FI', '358'], ['France', 'FR', '33'], ['Gabon', 'GA', '241'], ['Gambia', 'GM', '220'],
  ['Georgia', 'GE', '995'], ['Germany', 'DE', '49'], ['Ghana', 'GH', '233'], ['Greece', 'GR', '30'],
  ['Greenland', 'GL', '299'], ['Guatemala', 'GT', '502'], ['Guinea', 'GN', '224'], ['Guyana', 'GY', '592'],
  ['Haiti', 'HT', '509'], ['Honduras', 'HN', '504'], ['Hong Kong', 'HK', '852'], ['Hungary', 'HU', '36'],
  ['Iceland', 'IS', '354'], ['India', 'IN', '91'], ['Indonesia', 'ID', '62'], ['Iran', 'IR', '98'],
  ['Iraq', 'IQ', '964'], ['Ireland', 'IE', '353'], ['Israel', 'IL', '972'], ['Italy', 'IT', '39'],
  ['Jamaica', 'JM', '1876'], ['Japan', 'JP', '81'], ['Jordan', 'JO', '962'], ['Kazakhstan', 'KZ', '7'],
  ['Kenya', 'KE', '254'], ['Kuwait', 'KW', '965'], ['Kyrgyzstan', 'KG', '996'], ['Laos', 'LA', '856'],
  ['Latvia', 'LV', '371'], ['Lebanon', 'LB', '961'], ['Libya', 'LY', '218'], ['Liechtenstein', 'LI', '423'],
  ['Lithuania', 'LT', '370'], ['Luxembourg', 'LU', '352'], ['Macau', 'MO', '853'], ['Madagascar', 'MG', '261'],
  ['Malawi', 'MW', '265'], ['Malaysia', 'MY', '60'], ['Maldives', 'MV', '960'], ['Mali', 'ML', '223'],
  ['Malta', 'MT', '356'], ['Mauritius', 'MU', '230'], ['Mexico', 'MX', '52'], ['Moldova', 'MD', '373'],
  ['Monaco', 'MC', '377'], ['Mongolia', 'MN', '976'], ['Montenegro', 'ME', '382'], ['Morocco', 'MA', '212'],
  ['Mozambique', 'MZ', '258'], ['Myanmar', 'MM', '95'], ['Namibia', 'NA', '264'], ['Nepal', 'NP', '977'],
  ['Netherlands', 'NL', '31'], ['New Zealand', 'NZ', '64'], ['Nicaragua', 'NI', '505'], ['Niger', 'NE', '227'],
  ['Nigeria', 'NG', '234'], ['North Macedonia', 'MK', '389'], ['Norway', 'NO', '47'], ['Oman', 'OM', '968'],
  ['Pakistan', 'PK', '92'], ['Palestine', 'PS', '970'], ['Panama', 'PA', '507'], ['Papua New Guinea', 'PG', '675'],
  ['Paraguay', 'PY', '595'], ['Peru', 'PE', '51'], ['Philippines', 'PH', '63'], ['Poland', 'PL', '48'],
  ['Portugal', 'PT', '351'], ['Puerto Rico', 'PR', '1787'], ['Qatar', 'QA', '974'], ['Romania', 'RO', '40'],
  ['Russia', 'RU', '7'], ['Rwanda', 'RW', '250'], ['Saudi Arabia', 'SA', '966'], ['Senegal', 'SN', '221'],
  ['Serbia', 'RS', '381'], ['Seychelles', 'SC', '248'], ['Sierra Leone', 'SL', '232'], ['Singapore', 'SG', '65'],
  ['Slovakia', 'SK', '421'], ['Slovenia', 'SI', '386'], ['Somalia', 'SO', '252'], ['South Africa', 'ZA', '27'],
  ['South Korea', 'KR', '82'], ['South Sudan', 'SS', '211'], ['Spain', 'ES', '34'], ['Sri Lanka', 'LK', '94'],
  ['Sudan', 'SD', '249'], ['Sweden', 'SE', '46'], ['Switzerland', 'CH', '41'], ['Syria', 'SY', '963'],
  ['Taiwan', 'TW', '886'], ['Tajikistan', 'TJ', '992'], ['Tanzania', 'TZ', '255'], ['Thailand', 'TH', '66'],
  ['Togo', 'TG', '228'], ['Trinidad and Tobago', 'TT', '1868'], ['Tunisia', 'TN', '216'], ['Turkey', 'TR', '90'],
  ['Turkmenistan', 'TM', '993'], ['Uganda', 'UG', '256'], ['Ukraine', 'UA', '380'], ['United Arab Emirates', 'AE', '971'],
  ['Uruguay', 'UY', '598'], ['Uzbekistan', 'UZ', '998'], ['Venezuela', 'VE', '58'], ['Vietnam', 'VN', '84'],
  ['Yemen', 'YE', '967'], ['Zambia', 'ZM', '260'], ['Zimbabwe', 'ZW', '263'],
];
const COUNTRIES: C[] = RAW.map(([n, c, d]) => ({ n, c, d }));
const BY_LEN = [...COUNTRIES].sort((a, b) => b.d.length - a.d.length);
const DEFAULT = COUNTRIES[0];

function flag(iso: string) {
  try { return iso.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))); }
  catch { return ''; }
}

/** Split an existing E.164 value back into { country, national } so the field
 *  restores correctly (e.g. navigating back to the phone step). */
function parse(value: string): { country: C; national: string } | null {
  const norm = normalizePhone(value || '');
  if (!norm.startsWith('+')) return null;
  const digits = norm.slice(1);
  const match = BY_LEN.find((c) => digits.startsWith(c.d));
  if (!match) return null;
  return { country: match, national: digits.slice(match.d.length) };
}

export default function PhoneField({
  value, onChange, fontFamily = 'Inter, sans-serif', autoFocus, onEnter, invalid,
}: {
  value: string;
  onChange: (e164: string) => void;
  fontFamily?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  invalid?: boolean;
}) {
  const parsed = useMemo(() => parse(value), []); // initial value only
  const [country, setCountry] = useState<C>(parsed?.country ?? DEFAULT);
  const [national, setNational] = useState<string>(parsed?.national ?? '');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) setTimeout(() => numRef.current?.focus({ preventScroll: true }), 80);
  }, [autoFocus]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function emit(c: C, nat: string) { onChange(nat ? `+${c.d}${nat}` : ''); }
  function pickCountry(c: C) { setCountry(c); setOpen(false); setQ(''); emit(c, national); setTimeout(() => numRef.current?.focus(), 0); }
  function onNat(v: string) { const d = v.replace(/\D/g, ''); setNational(d); emit(country, d); }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return COUNTRIES;
    return COUNTRIES.filter((c) => c.n.toLowerCase().includes(s) || c.d.includes(s.replace('+', '')) || c.c.toLowerCase() === s);
  }, [q]);

  const border = invalid ? 'rgba(224,85,85,0.85)' : 'rgba(255,255,255,0.1)';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button" onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            background: '#0d0d0d', border: `1.5px solid ${border}`, borderRadius: 12,
            padding: '13px 14px', color: '#fff', fontFamily, fontSize: 16, cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{flag(country.c)}</span>
          <span>+{country.d}</span>
          <span style={{ color: '#666', fontSize: 12 }}>▾</span>
        </button>
        <input
          ref={numRef}
          type="tel" inputMode="tel" autoComplete="tel-national"
          value={national} onChange={(e) => onNat(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
          placeholder="Phone number"
          style={{
            flex: 1, minWidth: 0, background: '#0d0d0d', border: `1.5px solid ${border}`,
            borderRadius: 12, padding: '13px 18px', color: '#fff', fontSize: 16, fontFamily, outline: 'none',
          }}
        />
      </div>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, right: 0,
          background: '#0d0d0d', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 12,
          overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country…"
            style={{
              width: '100%', background: '#111', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)',
              padding: '12px 16px', color: '#fff', fontSize: 14, fontFamily, outline: 'none',
            }}
          />
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map((c) => (
              <button
                key={c.c + c.d} type="button" onClick={() => pickCountry(c)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  background: c.c === country.c && c.d === country.d ? 'rgba(245,230,163,0.08)' : 'transparent',
                  border: 'none', padding: '10px 16px', color: '#ddd', fontFamily, fontSize: 14, cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{flag(c.c)}</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.n}</span>
                <span style={{ color: '#888' }}>+{c.d}</span>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ padding: '14px 16px', color: '#666', fontFamily, fontSize: 13 }}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
