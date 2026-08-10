import React from 'react';

// Lightweight markdown renderer for admin-authored resource content. Supports
// the subset we actually use: #/##/### headings, **bold**, [links](url),
// `code`, bullet/numbered lists, > blockquotes, --- rules, GFM | tables |, and
// paragraphs. Content is admin-authored (trusted), rendered to JSX (no raw HTML).

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';

// Inline: ![alt](url) image, **bold**, [text](url), `code`.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(!\[([^\]]*)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      // eslint-disable-next-line @next/next/no-img-element
      nodes.push(<img key={`${keyBase}-img${i}`} src={m[3]} alt={m[2]} style={{ maxWidth: '100%', borderRadius: 10, verticalAlign: 'middle' }} />);
    } else if (m[4]) {
      nodes.push(<strong key={`${keyBase}-b${i}`} style={{ color: cream, fontWeight: 700 }}>{m[5]}</strong>);
    } else if (m[6]) {
      nodes.push(
        <a key={`${keyBase}-a${i}`} href={m[8]} target="_blank" rel="noopener noreferrer" style={{ color: G, textDecoration: 'underline', textUnderlineOffset: 3 }}>{m[7]}</a>
      );
    } else if (m[9]) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} style={{ background: 'rgba(201,164,85,0.12)', padding: '1px 6px', borderRadius: 5, fontSize: '0.88em', color: cream }}>{m[10]}</code>
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Table({ rows, k }: { rows: string[][]; k: string }) {
  const [head, ...body] = rows;
  return (
    <div style={{ overflowX: 'auto', margin: '14px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: `1px solid rgba(201,164,85,0.3)`, color: G, fontWeight: 600, whiteSpace: 'nowrap' }}>{renderInline(c, `${k}-th${i}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: cream, verticalAlign: 'top' }}>{renderInline(c, `${k}-td${ri}-${ci}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const splitRow = (line: string) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

// ── Indent-aware (nestable) lists ────────────────────────────────────────────
// Notion exports nest bullets/numbers with leading spaces (4 per level). We
// preserve that hierarchy instead of flattening it into one level.
interface ListNode { ordered: boolean; text: string; children: ListNode[] }

const listLine = (l: string) => /^([-*]|\d+\.)\s+/.test(l.trim());

function parseListLine(l: string): { indent: number; ordered: boolean; text: string } {
  let indent = 0;
  for (const ch of l) { if (ch === ' ') indent++; else if (ch === '\t') indent += 4; else break; }
  const t = l.trim();
  return { indent, ordered: /^\d+\.\s+/.test(t), text: t.replace(/^([-*]|\d+\.)\s+/, '') };
}

function buildListLevel(rows: { indent: number; ordered: boolean; text: string }[], i: number, indent: number): { items: ListNode[]; i: number } {
  const items: ListNode[] = [];
  while (i < rows.length && rows[i].indent >= indent) {
    const cur = rows[i];
    const node: ListNode = { ordered: cur.ordered, text: cur.text, children: [] };
    i++;
    if (i < rows.length && rows[i].indent > cur.indent) {
      const r = buildListLevel(rows, i, rows[i].indent);
      node.children = r.items; i = r.i;
    }
    items.push(node);
  }
  return { items, i };
}

function renderList(items: ListNode[], keyBase: string, depth: number): React.ReactNode {
  const Tag = items[0]?.ordered ? 'ol' : 'ul';
  return (
    <Tag key={keyBase} style={{ margin: depth ? '3px 0' : '8px 0', paddingLeft: 22, color: sub, lineHeight: 1.7, fontSize: 14.5 }}>
      {items.map((it, ii) => (
        <li key={ii} style={{ margin: '4px 0' }}>
          {renderInline(it.text, `${keyBase}-${ii}`)}
          {it.children.length > 0 && renderList(it.children, `${keyBase}-${ii}c`, depth + 1)}
        </li>
      ))}
    </Tag>
  );
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    const text = buf.join(' ').trim();
    if (text) blocks.push(<p key={`p${key++}`} style={{ color: sub, lineHeight: 1.7, margin: '10px 0', fontSize: 14.5 }}>{renderInline(text, `p${key}`)}</p>);
    buf.length = 0;
  };

  let para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — end paragraph.
    if (!trimmed) { flushParagraph(para); i++; continue; }

    // Headings.
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushParagraph(para);
      const level = h[1].length;
      const size = level === 1 ? 24 : level === 2 ? 18 : 15.5;
      const mt = level === 1 ? 0 : 22;
      blocks.push(
        <div key={`h${key++}`} style={{ color: cream, fontWeight: 700, fontSize: size, margin: `${mt}px 0 6px`, letterSpacing: level === 1 ? '-0.01em' : 0 }}>{renderInline(h[2], `h${key}`)}</div>
      );
      i++; continue;
    }

    // Standalone image line → centered, responsive figure (alt becomes a caption).
    const imgBlock = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
    if (imgBlock) {
      flushParagraph(para);
      blocks.push(
        <figure key={`fig${key++}`} style={{ margin: '16px 0', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgBlock[2]} alt={imgBlock[1]} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid rgba(201,164,85,0.15)' }} />
          {imgBlock[1] && <figcaption style={{ color: sub, fontSize: 12.5, marginTop: 6, fontStyle: 'italic' }}>{imgBlock[1]}</figcaption>}
        </figure>
      );
      i++; continue;
    }

    // Horizontal rule.
    if (/^---+$/.test(trimmed)) {
      flushParagraph(para);
      blocks.push(<hr key={`hr${key++}`} style={{ border: 0, borderTop: '1px solid rgba(201,164,85,0.18)', margin: '20px 0' }} />);
      i++; continue;
    }

    // Table (a row of pipes followed by a separator row of dashes).
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      flushParagraph(para);
      const rows: string[][] = [splitRow(trimmed)];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      blocks.push(<Table key={`t${key++}`} rows={rows} k={`t${key}`} />);
      continue;
    }

    // Blockquote (consecutive > lines).
    if (trimmed.startsWith('>')) {
      flushParagraph(para);
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`q${key++}`} style={{ borderLeft: `3px solid ${G}`, paddingLeft: 14, margin: '12px 0', color: sub, fontStyle: 'italic', lineHeight: 1.65 }}>
          {quote.filter(Boolean).map((q, qi) => <div key={qi} style={{ margin: '4px 0' }}>{renderInline(q, `q${key}-${qi}`)}</div>)}
        </blockquote>
      );
      continue;
    }

    // Lists — bullet or ordered, with nesting preserved via indentation.
    if (listLine(trimmed)) {
      flushParagraph(para);
      const raw: string[] = [];
      while (i < lines.length && listLine(lines[i])) { raw.push(lines[i]); i++; }
      const rows = raw.map(parseListLine);
      const base = Math.min(...rows.map((r) => r.indent));
      const { items } = buildListLevel(rows, 0, base);
      blocks.push(renderList(items, `l${key++}`, 0));
      continue;
    }

    // Default — accumulate into a paragraph.
    para.push(trimmed);
    i++;
  }
  flushParagraph(para);

  return <div>{blocks}</div>;
}
