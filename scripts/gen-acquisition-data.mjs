// One-off generator: bakes the client's Notion "Acquisition Dashboard" export
// (a nested wiki of sales SOPs / frameworks) into a committed TS data file so it
// ships with the app — the source folder lives outside the repo and is NOT
// present at build time on Vercel.
//
// Run locally after any content change:  node scripts/gen-acquisition-data.mjs
// Source dir is passed as argv[2] (defaults to the desktop export).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SRC = process.argv[2] || 'C:/Users/fasih/OneDrive/Desktop/Acquisition Roadmap';
const OUT = path.join(REPO, 'lib', 'acquisition-data.ts');
const PUBDIR = path.join(REPO, 'public', 'acquisition');

const HASH = /([0-9a-f]{32})\.(md|csv)/i;
const idFromName = (name) => (name.match(HASH) || [])[1] || null;

// ── link helpers ────────────────────────────────────────────────────────────
// A markdown link whose target is another exported page (…hash.md / …hash.csv).
const internalLinkRe = /\[([^\]]*)\]\(([^)]*(?:%20)?[0-9a-f]{32}\.(?:md|csv)[^)]*)\)/i;
const fullInternalLineRe = /^\[([^\]]*)\]\(([^)]*[0-9a-f]{32}\.(?:md|csv)[^)]*)\)$/i;
const targetId = (url) => (decodeURIComponent(url).match(HASH) || [])[1] || null;

const isBlank = (l) => l.trim() === '';
const isHr = (l) => /^---+$/.test(l.trim());
const isHeading = (l) => /^#{2,3}\s+/.test(l.trim());
const headingText = (l) => l.trim().replace(/^#{2,3}\s+/, '').replace(/\*\*/g, '').trim();

// Strip Notion callout/icon HTML the markdown renderer can't handle; keep inner text.
function preClean(raw) {
  return raw
    .split('\n')
    .filter((l) => !/^<\/?aside>\s*$/i.test(l.trim()))
    .map((l) => l.replace(/<img[^>]*\/?>/gi, '').replace(/<\/?[a-z][^>]*>/gi, ''))
    .join('\n');
}

const images = new Set();

// External links we surface as a click-to-open popup pill instead of a raw URL.
const EMBEDDABLE = [{ re: /miro\.com/i, label: 'Miro' }];
const embedLabel = (url) => (EMBEDDABLE.find((e) => e.re.test(url))?.label ?? null);

// Inline processing for body lines: drop inline internal links to their label,
// rewrite local image paths, linkify standalone bare URLs.
function processInline(line) {
  // standalone bare URL → markdown link
  if (/^https?:\/\/\S+$/.test(line.trim())) {
    const u = line.trim();
    return `[${u}](${u})`;
  }
  let out = line;
  // local image → /acquisition/<file>
  out = out.replace(/!\[([^\]]*)\]\(([^)]+\.(?:png|jpe?g|gif|webp|svg))\)/gi, (m, alt, src) => {
    if (/^https?:\/\//i.test(src)) return m;
    const file = decodeURIComponent(src);
    images.add(file);
    return `![${alt}](/acquisition/${encodeURIComponent(file)})`;
  });
  // inline internal link → plain label
  out = out.replace(new RegExp(internalLinkRe.source, 'gi'), (m, label) => label.trim());
  return out;
}

function parsePage(id, name, raw) {
  const cleaned = preClean(raw);
  const lines = cleaned.split('\n');
  let title = name.replace(HASH, '').trim();
  // first H1 wins for the title
  const h1 = lines.find((l) => /^#\s+/.test(l.trim()));
  if (h1) title = h1.trim().replace(/^#\s+/, '').trim();

  const groups = []; // { heading, links: [{label,id}] }
  const embeds = []; // { label, url } — embeddable external links (open in popup)
  const groupFor = (heading) => {
    let g = groups.find((x) => x.heading === heading);
    if (!g) { g = { heading, links: [] }; groups.push(g); }
    return g;
  };

  const body = [];
  let collecting = true;      // skip decorative blank/hr while gathering link lists
  let currentHeading = null;

  const nextRealIsLink = (i) => {
    let j = i + 1;
    while (j < lines.length && (isBlank(lines[j]) || isHr(lines[j]))) j++;
    return j < lines.length && fullInternalLineRe.test(lines[j].trim());
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^#\s+/.test(t)) continue; // H1 handled as title

    if (collecting && (isBlank(line) || isHr(line))) continue;

    if (isHeading(line)) {
      if (nextRealIsLink(i)) { currentHeading = headingText(line); collecting = true; continue; }
      collecting = false; currentHeading = null; body.push(line); continue;
    }

    if (fullInternalLineRe.test(t)) {
      const [, label, url] = t.match(fullInternalLineRe);
      const tid = targetId(url);
      if (tid) { groupFor(currentHeading).links.push({ label: label.trim(), id: tid }); collecting = true; continue; }
    }

    collecting = false;
    // Standalone embeddable link (e.g. a Miro board) → popup pill, not raw text.
    const bare = t;
    if (/^https?:\/\/\S+$/.test(bare)) {
      const lbl = embedLabel(bare);
      if (lbl) { embeds.push({ label: lbl, url: bare }); continue; }
    }
    body.push(processInline(line));
  }

  const bodyStr = body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { id, title, body: bodyStr, groups, embeds };
}

function csvToMarkdownTable(csv) {
  const rows = csv.replace(/\r/g, '').split('\n').filter((r) => r.trim() !== '').map((r) => r.split(','));
  if (!rows.length) return '';
  const head = rows[0];
  const sep = head.map(() => '---');
  const line = (r) => `| ${r.map((c) => (c.trim() || ' ')).join(' | ')} |`;
  return [line(head), line(sep), ...rows.slice(1).map(line)].join('\n');
}

// ── build ───────────────────────────────────────────────────────────────────
const files = fs.readdirSync(SRC);
const pages = {};
let rootId = null;

for (const f of files) {
  const id = idFromName(f);
  if (!id) continue;
  const abs = path.join(SRC, f);
  if (f.toLowerCase().endsWith('.md')) {
    const raw = fs.readFileSync(abs, 'utf8');
    const page = parsePage(id, f, raw);
    pages[id] = page;
    if (/^Acquisition Dashboard/i.test(f)) rootId = id;
  } else if (f.toLowerCase().endsWith('.csv') && !/_all\.csv$/i.test(f)) {
    const raw = fs.readFileSync(abs, 'utf8');
    pages[id] = { id, title: f.replace(HASH, '').trim(), body: csvToMarkdownTable(raw), groups: [], embeds: [] };
  }
}

if (!rootId) throw new Error('Could not find the "Acquisition Dashboard" root page in ' + SRC);

// Copy referenced images.
fs.mkdirSync(PUBDIR, { recursive: true });
for (const img of images) {
  const from = path.join(SRC, img);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(PUBDIR, img));
  else console.warn('missing image:', img);
}

// Prune pages unreachable from root so we don't ship stray notes.
const reachable = new Set();
const walk = (id) => {
  if (!id || reachable.has(id) || !pages[id]) return;
  reachable.add(id);
  for (const g of pages[id].groups) for (const l of g.links) walk(l.id);
};
walk(rootId);
const kept = {};
for (const id of reachable) kept[id] = pages[id];

const banner = `// AUTO-GENERATED by scripts/gen-acquisition-data.mjs — do not edit by hand.\n// Baked from the client's Notion "Acquisition Dashboard" export. Regenerate with:\n//   node scripts/gen-acquisition-data.mjs\n\n`;
const types = `export interface AcqLink { label: string; id: string }
export interface AcqGroup { heading: string | null; links: AcqLink[] }
export interface AcqEmbed { label: string; url: string }
export interface AcqPage { id: string; title: string; body: string; groups: AcqGroup[]; embeds: AcqEmbed[] }

`;
const out = `${banner}${types}export const ACQ_ROOT_ID = ${JSON.stringify(rootId)};

export const ACQ_PAGES: Record<string, AcqPage> = ${JSON.stringify(kept, null, 2)};

export function getAcqPage(id: string): AcqPage | null {
  return ACQ_PAGES[id] ?? null;
}
`;
fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT}: ${Object.keys(kept).length} pages, ${images.size} images. root=${rootId}`);
