import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getBrain, upsertBrainItem, deleteBrainItem, type BrainKind } from '@/lib/ai/content-brain';

const KINDS: BrainKind[] = ['hook', 'idea', 'objection', 'mechanic'];

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await getBrain());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { kind, text, data = null, incrementCount = false } = await req.json();
  if (!KINDS.includes(kind) || !text?.trim()) return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
  await upsertBrainItem(kind, text, data, !!incrementCount);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { kind, text } = await req.json();
  if (!KINDS.includes(kind) || !text?.trim()) return NextResponse.json({ error: 'Invalid item' }, { status: 400 });
  await deleteBrainItem(kind, text);
  return NextResponse.json({ ok: true });
}
