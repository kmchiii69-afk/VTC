// Dry run: shows which of the sales-manager's Fathom calls WOULD import vs get
// filtered, using the exact same rules as the live sync. Reads only — no DB writes.
import { readFileSync } from 'node:fs';

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const KEY = env.FATHOM_SALES_API_KEY;
if (!KEY) { console.log('FATHOM_SALES_API_KEY not set'); process.exit(1); }

// Mirror lib/sales-call.ts
const TITLE_RE = /sales huddle|huddle|executives? call|team call|team meeting|group call|mastermind|content x|content call|aidan cordes|ugc|cm team|coaching call|onboarding|training|fulfill?ment|q&a|q\+a|100k|drills|round robin|\bsop\b/i;
const EXCLUDED = ['soowei@gohconsulting.com', 'lazzartopalovic@gmail.com'].map((e) => e.toLowerCase());

const monthsBack = 4;
const after = new Date(); after.setMonth(after.getMonth() - monthsBack);
const createdAfter = after.toISOString();

async function getAll() {
  const all = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const p = new URLSearchParams({ limit: '25', created_after: createdAfter });
    if (cursor) p.set('cursor', cursor);
    const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${p}`, { headers: { 'X-Api-Key': KEY } });
    if (!res.ok) { console.log('HTTP', res.status, (await res.text()).slice(0, 200)); break; }
    const d = await res.json();
    const items = d.items ?? d.data ?? d.meetings ?? [];
    all.push(...items);
    if (!d.next_cursor) break;
    cursor = d.next_cursor;
  }
  return all;
}

const items = await getAll();
const imported = [], filtered = [];
for (const m of items) {
  const title = m.meeting_title ?? m.title ?? '(untitled)';
  const invitees = m.calendar_invitees ?? m.attendees ?? m.participants ?? [];
  const emails = (Array.isArray(invitees) ? invitees : []).map((a) => (a?.email || '').toLowerCase()).filter(Boolean);
  const count = Array.isArray(invitees) ? invitees.length : 0;
  let reason = null;
  if (TITLE_RE.test(title)) reason = 'internal title';
  else { const bad = emails.find((e) => EXCLUDED.includes(e)); if (bad) reason = `invitee ${bad}`; else if (count > 6) reason = `group (${count} attendees)`; }
  if (reason) filtered.push({ title, reason }); else imported.push({ title, emails });
}

console.log(`\nFetched ${items.length} meetings from the last ${monthsBack} months.\n`);
console.log(`=== WOULD IMPORT (${imported.length}) ===`);
for (const r of imported) console.log(`  ✅ ${r.title}`);
console.log(`\n=== FILTERED OUT (${filtered.length}) ===`);
for (const r of filtered) console.log(`  🚫 ${r.title}   [${r.reason}]`);
