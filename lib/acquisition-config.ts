// Client-safe config for the per-client EDITABLE pages of the Acquisition
// Dashboard. The page bodies themselves are baked (lib/acquisition-data.ts);
// the pages listed here additionally let each client store their own content
// (persisted in the `acquisition_content` table). Ids are the stable Notion
// page ids from the export.

export type AcqEditKind = 'doc' | 'product' | 'links' | 'cash';

export const ACQ_EDITABLE: Record<string, AcqEditKind> = {
  '38f7eccd40c080a8b255e65ccbd4c19d': 'links',   // Personal SOP’s
  '38f7eccd40c080bf8e68edffa582c2e1': 'links',   // Important Links
  '38f7eccd40c080daa49bf4020cd8d165': 'cash',    // Cash Tracker
  '7237eccd40c083229d4101c81ed23bc7': 'doc',     // Your Lifestory
  '09e7eccd40c08334b71f8174942b607b': 'doc',     // Product Market Fit
  '7727eccd40c0821d85a301a4b065bfde': 'doc',     // Offer Positioning
  '92c7eccd40c0824c9ec78162bac7c4d2': 'product', // The Product
};

export function acqEditKind(id: string): AcqEditKind | null {
  return ACQ_EDITABLE[id] ?? null;
}

// Stored data shapes (all fields optional so a partial row is always valid).
export interface AcqLinkItem { id: string; label: string; url: string }
export interface AcqCashRow { id: string; month: string; cash: string; range: string }
export interface AcqDocData { text?: string }
export interface AcqProductData { text?: string; pdf?: { url: string; name: string } | null }
export interface AcqLinksData { items?: AcqLinkItem[] }
export interface AcqCashData { rows?: AcqCashRow[] }
export type AcqData = AcqDocData & AcqProductData & AcqLinksData & AcqCashData;

// ── Admin-managed GLOBAL content ─────────────────────────────────────────────
// Separate from the per-client data above: admins fill in the "Building" /
// reference pages (text + SOP links + PDFs) and it shows for EVERY acquisition
// client. Keyed by page id in the `acquisition_admin_content` table.
export interface AcqFile { id: string; name: string; url: string }
export interface AcqAdminData {
  text?: string;              // markdown, rendered for everyone
  links?: AcqLinkItem[];      // SOP / resource links
  files?: AcqFile[];          // uploaded PDFs
}

// Admins can add global content to any real page that is NOT a per-client
// editable page (those hold each client's own content instead).
export function acqAdminEditable(pageId: string): boolean {
  return !acqEditKind(pageId);
}

// Seed content used the first time a client opens a page (before they save).
export const ACQ_DEFAULT_LINKS: Record<string, { label: string; url: string }[]> = {
  '38f7eccd40c080bf8e68edffa582c2e1': [ // Important Links
    { label: 'Tracking Dashboard', url: '' },
    { label: 'Instagram', url: '' },
    { label: 'Youtube', url: '' },
  ],
  '38f7eccd40c080a8b255e65ccbd4c19d': [], // Personal SOP’s — start empty
};

export const ACQ_DEFAULT_CASH: { month: string; cash: string; range: string }[] = [
  { month: 'Month 0', cash: '', range: '' },
  { month: 'Month 1', cash: '', range: '' },
  { month: 'Month 2', cash: '', range: '' },
  { month: 'Month 3', cash: '', range: '' },
];
