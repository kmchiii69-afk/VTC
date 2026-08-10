import { db } from '@/lib/kv';
import { saveMemory } from '@/lib/ai/memory';

// Team-shared Content Brain (the /select content bot's structured knowledge).
// Reconstructs the same ContentBrain shape the /select UI uses, and mirrors new
// items into content_memory so the content bot recalls them in chat.

export type BrainKind = 'hook' | 'idea' | 'objection' | 'mechanic';

const TABLE = 'content_brain';

interface Row {
  kind: string;
  text: string;
  data: Record<string, unknown> | null;
  count: number;
  created_at: string;
  updated_at: string;
}

export interface ContentBrain {
  hooks: { text: string; concept?: string; ts: number }[];
  ideas: { title: string; hook: string; concept: string; format: string; overall: number; why: string; ts: number }[];
  objections: { text: string; category: string; count: number; last_seen: number }[];
  mechanics: string[];
}

const ms = (iso: string) => Date.parse(iso) || Date.now();

export async function getBrain(): Promise<ContentBrain> {
  try {
    const { data } = await db().from(TABLE).select('*').order('created_at', { ascending: false });
    const rows = (data ?? []) as Row[];
    return {
      hooks: rows.filter((r) => r.kind === 'hook').map((r) => ({ text: r.text, concept: (r.data?.concept as string) || undefined, ts: ms(r.created_at) })),
      ideas: rows.filter((r) => r.kind === 'idea').map((r) => ({
        title: r.text,
        hook: (r.data?.hook as string) || '',
        concept: (r.data?.concept as string) || '',
        format: (r.data?.format as string) || '',
        overall: (r.data?.overall as number) || 0,
        why: (r.data?.why as string) || '',
        ts: ms(r.created_at),
      })),
      objections: rows.filter((r) => r.kind === 'objection').map((r) => ({ text: r.text, category: (r.data?.category as string) || 'other', count: r.count, last_seen: ms(r.updated_at) })).sort((a, b) => b.count - a.count),
      mechanics: rows.filter((r) => r.kind === 'mechanic').map((r) => r.text),
    };
  } catch {
    return { hooks: [], ideas: [], objections: [], mechanics: [] };
  }
}

function memoryText(kind: BrainKind, text: string, data: Record<string, unknown> | null | undefined): string {
  switch (kind) {
    case 'hook': return `Approved content hook: "${text}"${data?.concept ? ` (concept: ${data.concept})` : ''}`;
    case 'idea': return `Approved content idea "${text}": hook "${(data?.hook as string) || ''}"${data?.overall ? ` (${data.overall}/5)` : ''}`;
    case 'objection': return `Recurring sales objection${data?.category ? ` (${data.category})` : ''}: "${text}"`;
    case 'mechanic': return `Proven content mechanic: ${text}`;
  }
}

// Add or update a brain item. Objections increment a frequency count; everything
// else dedupes case-insensitively by text. New items are mirrored into the
// content bot's memory. Non-throwing.
export async function upsertBrainItem(
  kind: BrainKind,
  text: string,
  data: Record<string, unknown> | null,
  incrementCount = false
): Promise<void> {
  const t = text.trim();
  if (!t) return;
  try {
    const { data: existing } = await db().from(TABLE).select('id, count').eq('kind', kind).ilike('text', t).maybeSingle();
    if (existing) {
      await db().from(TABLE).update({
        data,
        count: incrementCount ? (existing.count || 1) + 1 : existing.count,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      return; // not new — don't re-mirror to memory
    }
    await db().from(TABLE).insert({ kind, text: t, data, count: 1 });
    await saveMemory('content', memoryText(kind, t, data), kind);
  } catch {
    /* non-fatal */
  }
}

export async function deleteBrainItem(kind: BrainKind, text: string): Promise<void> {
  try {
    await db().from(TABLE).delete().eq('kind', kind).ilike('text', text.trim());
  } catch {
    /* non-fatal */
  }
}
