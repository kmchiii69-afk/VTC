import { NextResponse } from 'next/server';
import { db } from '@/lib/kv';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

// ManyChat basic webhooks do not sign requests — no signature verification needed.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' });
  }

  const {
    first_name,
    last_name,
    ig_handle,
    whatsapp_phone,
    messenger_user_id,
  } = body as {
    first_name?: string;
    last_name?: string;
    ig_handle?: string;
    whatsapp_phone?: string;
    messenger_user_id?: string;
    [key: string]: unknown;
  };

  const igHandle = ig_handle?.trim() || null;
  const name = [first_name, last_name].filter(Boolean).join(' ').trim() || null;
  const whatsapp = (whatsapp_phone as string)?.trim() || null;
  const hasWhatsapp = !!whatsapp_phone;
  const manychatId = (messenger_user_id as string)?.trim() || null;
  const now = new Date().toISOString();

  // Store manychat subscriber ID in notes so we can push back via ManyChat API.
  // Format: "[mc:{id}]" at the start — parseable later without a schema change.
  const mcNote = manychatId ? `[mc:${manychatId}]` : null;

  // Build the record to upsert (only columns that exist in crm_leads).
  const record = {
    ig_handle: igHandle,
    name,
    whatsapp,
    has_whatsapp: hasWhatsapp,
    source: 'ig_dm' as const,
    stage: 'new' as const,
    updated_at: now,
    ...(mcNote ? { notes: mcNote } : {}),
  };

  try {
    let data: { id: string } | null = null;
    let error: { message: string } | null = null;

    if (igHandle) {
      // Upsert on ig_handle (unique key when present).
      const result = await db()
        .from('crm_leads')
        .upsert(record, { onConflict: 'ig_handle' })
        .select('id')
        .maybeSingle();
      data = result.data as { id: string } | null;
      error = result.error as { message: string } | null;
    } else {
      // No ig_handle — always insert a new row (no reliable dedup key).
      const result = await db()
        .from('crm_leads')
        .insert(record)
        .select('id')
        .maybeSingle();
      data = result.data as { id: string } | null;
      error = result.error as { message: string } | null;
    }

    if (error) {
      console.error('[manychat] supabase error:', error.message);
      // Return 200 so ManyChat does not retry — log the failure instead.
      return NextResponse.json({ ok: false, error: error.message });
    }

    // Mirror into Close (fire-and-forget — the cron sweep is the net).
    queueCloseSync(data?.id, 'manychat');
    queueAlowareSync(data?.id, 'manychat');
    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[manychat] unexpected error:', message);
    return NextResponse.json({ ok: false, error: message });
  }
}
