import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { processSalesCall } from '@/lib/sales-call';

async function verifySignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = req.headers.get('x-fathom-signature') ?? req.headers.get('webhook-signature') ?? '';
  if (!sig) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const normalized = sig.replace(/^sha256=/, '');
    const sigBuf = Buffer.from(normalized, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!await verifySignature(req, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const { report_id } = await processSalesCall(payload);
    return NextResponse.json({ success: true, report_id });
  } catch (err) {
    console.error('Fathom webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
