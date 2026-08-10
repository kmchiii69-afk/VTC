// Best-effort "download this file" link for a resource URL.
//
// Attached resources are links to whatever the team pasted in — a Google Doc, a
// Drive file, a Canva design, a raw PDF. Each provider exposes its file under a
// different export path, so map the ones we know and return null for the rest;
// callers show a plain "open in a new tab" link instead of a Download button
// that wouldn't actually download anything.
export function toDownloadUrl(raw: string): string | null {
  const url = (raw || '').trim();
  if (!url) return null;

  // Google Docs / Sheets / Slides → PDF export (works on any link-shared doc).
  // Slides uses /export/pdf; Docs and Sheets use /export?format=pdf.
  const gdoc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]+)/i);
  if (gdoc) {
    const kind = gdoc[1].toLowerCase();
    const base = `https://docs.google.com/${kind}/d/${gdoc[2]}`;
    return kind === 'presentation' ? `${base}/export/pdf` : `${base}/export?format=pdf`;
  }

  // Google Drive file (/file/d/<id>/view or ?id=<id>) → direct download.
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/([A-Za-z0-9_-]+)|[^?]*\?(?:[^#]*&)?id=([A-Za-z0-9_-]+))/i);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1] || drive[2]}`;

  // Dropbox share links serve the preview page unless dl=1.
  if (/dropbox\.com\//i.test(url)) {
    if (/[?&]dl=1(&|$)/.test(url)) return url;
    const stripped = url.replace(/[?&]dl=0(&|$)/, (_m, tail) => (tail === '&' ? '?' : '')).replace(/\?$/, '');
    return stripped + (stripped.includes('?') ? '&' : '?') + 'dl=1';
  }

  // Anything that already points at a file downloads as-is.
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|zip|txt|md|png|jpe?g|gif|svg|mp4|mp3)(\?|#|$)/i.test(url)) return url;

  // Canva, Notion, Figma, … have no public download URL — the source page is
  // where the user downloads from.
  return null;
}
