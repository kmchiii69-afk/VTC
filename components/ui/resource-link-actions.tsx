'use client';

import { Download } from 'lucide-react';
import { toDownloadUrl } from '@/lib/download-url';

const actionLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, textDecoration: 'none',
  color: 'rgba(201,164,85,0.8)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
  border: '1px solid rgba(201,164,85,0.25)', borderRadius: 8, padding: '5px 10px',
};

// Header actions for an attached document: "Download" when the provider exposes
// a real file URL (see toDownloadUrl), plus a link to the source — the fallback
// for providers like Canva that keep downloads behind their own UI.
export function ResourceLinkActions({ url, title }: { url: string; title: string }) {
  const dl = toDownloadUrl(url);
  return (
    <>
      {dl && (
        <a href={dl} download target="_blank" rel="noopener noreferrer" title={`Download ${title}`} style={actionLink}>
          <Download size={13} /> Download
        </a>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...actionLink, border: 'none', padding: '5px 2px', color: 'rgba(201,164,85,0.7)' }}
      >
        Open ↗
      </a>
    </>
  );
}
