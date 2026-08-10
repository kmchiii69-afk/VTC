import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { updateBetaResource, deleteBetaResource, type BetaResourceKind } from '@/lib/ba-beta';

export const runtime = 'nodejs';

const KINDS: BetaResourceKind[] = ['link', 'note'];

type Params = { params: Promise<{ id: string }> };

// Turn any thrown value into a JSON error response with its real message, and
// log it server-side. Without this, an error thrown outside the inner logic
// (auth, param parsing, a runtime/serialization fault) escapes as Next's HTML
// 500 page, which hides the actual cause behind a generic "Action failed".
function fail(where: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[ba-beta/resources/[id]] ${where}:`, e);
  return NextResponse.json({ error: msg || 'Failed' }, { status: 500 });
}

// Admin: edit / reorder a resource pill.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthUser();
    if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    await updateBetaResource(id, {
      title: typeof b.title === 'string' ? b.title.trim() : undefined,
      kind: KINDS.includes(b.kind) ? b.kind : undefined,
      url: typeof b.url === 'string' ? b.url.trim() : undefined,
      body: typeof b.body === 'string' ? b.body : undefined,
      inline: typeof b.inline === 'boolean' ? b.inline : undefined,
      sort_order: typeof b.sort_order === 'number' ? b.sort_order : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail('PATCH', e);
  }
}

// Admin: delete a resource pill.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthUser();
    if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await deleteBetaResource(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail('DELETE', e);
  }
}
