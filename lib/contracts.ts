import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '@/lib/kv';
import { contractTierLabel } from '@/lib/client-tags';

// Native contract signing. Templates + signed PDFs live in a PRIVATE Supabase
// Storage bucket (contracts are sensitive); we hand out short-lived signed URLs
// for viewing rather than public links. Audit data is kept in contract_signatures.

const BUCKET = 'contracts';
const MAX_BYTES = 25 * 1024 * 1024;

const norm = (e: string) => e.toLowerCase().trim();

async function ensureBucket(): Promise<void> {
  const { error } = await db().storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
  if (error && !/exist/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
}

// Short-lived signed URL for viewing a private object (default 1 hour).
export async function signedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await db().storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/* ─── Templates ───────────────────────────────────────────────────────────── */

export interface ContractTemplate {
  tier: string;
  label: string;
  storage_path: string;
  version: number;
}

export async function getTemplates(): Promise<ContractTemplate[]> {
  try {
    const { data } = await db().from('contract_templates').select('tier, label, storage_path, version');
    return (data ?? []) as ContractTemplate[];
  } catch {
    return [];
  }
}

export async function getTemplate(tier: string): Promise<ContractTemplate | null> {
  const { data } = await db().from('contract_templates').select('tier, label, storage_path, version').eq('tier', tier).maybeSingle();
  return (data as ContractTemplate) ?? null;
}

// Admin: upload (or replace) a tier's template PDF; bumps the version.
export async function uploadTemplate(tier: string, label: string, bytes: Uint8Array): Promise<ContractTemplate> {
  await ensureBucket();
  const existing = await getTemplate(tier);
  const version = (existing?.version ?? 0) + 1;
  const path = `templates/${tier}-v${version}-${Date.now()}.pdf`;
  const { error: upErr } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const row = { tier, label: label || contractTierLabel(tier), storage_path: path, version, updated_at: new Date().toISOString() };
  const { error } = await db().from('contract_templates').upsert(row, { onConflict: 'tier' });
  if (error) throw error;
  return { tier, label: row.label, storage_path: path, version };
}

/* ─── Signatures ──────────────────────────────────────────────────────────── */

export interface SignatureRecord {
  id: string;
  tier: string;
  template_version: number;
  signer_name: string;
  signed_path: string;
  doc_sha256: string;
  signed_at: string;
}

// The client's most recent signature (if any).
export async function getLatestSignature(email: string): Promise<SignatureRecord | null> {
  const { data } = await db()
    .from('contract_signatures')
    .select('id, tier, template_version, signer_name, signed_path, doc_sha256, signed_at')
    .eq('client_email', norm(email))
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SignatureRecord) ?? null;
}

export const SIGN_CONSENT =
  'I agree to sign this contract electronically. I understand my electronic signature is the legal equivalent of a handwritten signature and that I intend to be bound by this agreement (ESIGN Act / UETA).';

// Stamp the signature + audit block onto the template PDF, store it, and record
// the signing event. Returns the new signature row + a viewing URL.
export async function signContract(opts: {
  email: string;
  tier: string;
  signerName: string;
  signaturePng: string; // data URL (image/png) from the canvas
  ip: string | null;
  userAgent: string | null;
}): Promise<{ record: SignatureRecord; viewUrl: string | null }> {
  const tmpl = await getTemplate(opts.tier);
  if (!tmpl) throw new Error('No contract template uploaded for this tier yet.');

  // Pull the template bytes.
  const { data: blob, error: dlErr } = await db().storage.from(BUCKET).download(tmpl.storage_path);
  if (dlErr || !blob) throw new Error('Could not load the contract template.');
  const templateBytes = new Uint8Array(await blob.arrayBuffer());

  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Append a dedicated signature page (avoids overlapping existing content).
  const page = pdf.addPage([612, 792]); // US Letter
  const margin = 56;
  let y = 792 - margin;
  const gold = rgb(0.79, 0.64, 0.33);
  const dark = rgb(0.12, 0.12, 0.12);
  const grey = rgb(0.4, 0.4, 0.4);

  page.drawText('ELECTRONIC SIGNATURE', { x: margin, y, size: 16, font: bold, color: dark });
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: gold });
  y -= 36;

  // Signature image.
  try {
    const b64 = opts.signaturePng.split(',')[1] || '';
    const png = await pdf.embedPng(Uint8Array.from(Buffer.from(b64, 'base64')));
    const w = 240;
    const h = (png.height / png.width) * w;
    page.drawImage(png, { x: margin, y: y - h, width: w, height: Math.min(h, 90) });
    y -= Math.min(h, 90) + 8;
  } catch { /* signature image optional — text record still stands */ }

  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.8, color: grey });
  y -= 16;
  page.drawText(`Signed by: ${opts.signerName}`, { x: margin, y, size: 11, font: bold, color: dark });
  y -= 22;

  const signedAt = new Date().toISOString();
  const lines = [
    `Signed electronically on: ${signedAt}`,
    `Contract: ${contractTierLabel(opts.tier) || tmpl.label} (template v${tmpl.version})`,
    `Signer email: ${norm(opts.email)}`,
    opts.ip ? `IP address: ${opts.ip}` : '',
    opts.userAgent ? `Device: ${opts.userAgent.slice(0, 90)}` : '',
  ].filter(Boolean);
  for (const ln of lines) {
    page.drawText(ln, { x: margin, y, size: 9, font, color: grey });
    y -= 14;
  }
  y -= 8;
  // Consent statement (wrapped).
  const consent = SIGN_CONSENT;
  const maxWidth = 612 - margin * 2;
  const words = consent.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, 8) > maxWidth) { page.drawText(line, { x: margin, y, size: 8, font, color: grey }); y -= 12; line = w; }
    else line = test;
  }
  if (line) page.drawText(line, { x: margin, y, size: 8, font, color: grey });

  const signedBytes = await pdf.save();
  const sha256 = createHash('sha256').update(signedBytes).digest('hex');

  // Stamp the hash on the page footer (tamper-evidence anchor).
  page.drawText(`Document SHA-256: ${sha256}`, { x: margin, y: 28, size: 6.5, font, color: grey });

  const finalBytes = await pdf.save();
  const finalHash = createHash('sha256').update(finalBytes).digest('hex');

  await ensureBucket();
  const emailKey = norm(opts.email).replace(/[^a-zA-Z0-9._-]/g, '_');
  const signedPath = `signed/${emailKey}/${Date.now()}-${opts.tier}.pdf`;
  const { error: upErr } = await db().storage.from(BUCKET).upload(signedPath, finalBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Could not store the signed contract: ${upErr.message}`);

  const { data: row, error } = await db()
    .from('contract_signatures')
    .insert({
      client_email: norm(opts.email),
      tier: opts.tier,
      template_version: tmpl.version,
      signer_name: opts.signerName,
      signed_path: signedPath,
      doc_sha256: finalHash,
      ip: opts.ip,
      user_agent: opts.userAgent,
      consent,
    })
    .select('id, tier, template_version, signer_name, signed_path, doc_sha256, signed_at')
    .single();
  if (error) throw error;

  const viewUrl = await signedUrl(signedPath, 60 * 60 * 24 * 7); // 7-day link (for Discord / immediate view)
  return { record: row as SignatureRecord, viewUrl };
}
