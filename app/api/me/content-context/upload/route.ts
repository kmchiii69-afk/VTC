import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { clearOfferUpload, setOfferUpload } from '@/lib/ai/client-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

// A client uploads their offer PDF; we extract the text and store it as their
// content context so the scripting bot tailors reviews to their offer/ICP.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  let text = '';
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buf);
    text = (data.text || '').trim();
  } catch {
    return NextResponse.json({ error: 'Could not read that PDF — try another file.' }, { status: 400 });
  }
  if (text.length < 30) return NextResponse.json({ error: "Couldn't extract text from that PDF (is it a scan/image?)." }, { status: 400 });

  await setOfferUpload(user.email, text);
  return NextResponse.json({ ok: true, chars: text.length });
}

// Take it back. The upload was one-way — a client who sent the wrong PDF was
// stuck with it as their bot context, since nothing else clears the text.
export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ok = await clearOfferUpload(user.email);
  if (!ok) return NextResponse.json({ error: 'Could not remove that document — try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
