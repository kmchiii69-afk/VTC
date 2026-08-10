import { db } from '@/lib/kv';

// Per-bot conversation logging + semantic memory. Every function is
// non-throwing: if the tables don't exist yet (SQL not run) or the embedding
// provider isn't configured, the bots keep working — logging/recall just no-op.

export type BotId = 'csm' | 'advisor' | 'content' | 'salesbot' | 'crmbot';

const TABLES: Record<BotId, { conv: string; msg: string; mem: string }> = {
  csm: { conv: 'csm_conversations', msg: 'csm_messages', mem: 'csm_memory' },
  advisor: { conv: 'advisor_conversations', msg: 'advisor_messages', mem: 'advisor_memory' },
  content: { conv: 'content_conversations', msg: 'content_messages', mem: 'content_memory' },
  salesbot: { conv: 'salesbot_conversations', msg: 'salesbot_messages', mem: 'salesbot_memory' },
  crmbot: { conv: 'crmbot_conversations', msg: 'crmbot_messages', mem: 'crmbot_memory' },
};

export async function startConversation(bot: BotId, userEmail: string | null): Promise<string | null> {
  try {
    const { data } = await db()
      .from(TABLES[bot].conv)
      .insert({ user_email: userEmail })
      .select('id')
      .single();
    return (data?.id as string) ?? null;
  } catch {
    return null;
  }
}

export async function logMessage(
  bot: BotId,
  conversationId: string | null,
  userEmail: string | null,
  role: 'user' | 'assistant',
  content: string,
  toolsUsed?: string[],
  meta?: Record<string, unknown> | null
): Promise<void> {
  if (!conversationId) return;
  try {
    await db().from(TABLES[bot].msg).insert({
      conversation_id: conversationId,
      user_email: userEmail,
      role,
      content,
      tools_used: toolsUsed?.length ? toolsUsed : null,
      // Structured render data (e.g. the content bot's SOP/module link buttons)
      // so a returning user sees the same buttons, not just the bare text.
      meta: meta && Object.keys(meta).length ? meta : null,
    });
    await db().from(TABLES[bot].conv).update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  } catch {
    /* non-fatal */
  }
}

export interface ConversationHistory {
  id: string;
  messages: { role: 'user' | 'assistant'; content: string; meta?: Record<string, unknown> | null }[];
}

// Load a user's most-recent conversation thread so a returning user picks up
// exactly where they left off. Scoped to their email, so each person only ever
// sees their own history.
export async function getLatestConversation(
  bot: BotId,
  userEmail: string | null
): Promise<ConversationHistory | null> {
  if (!userEmail) return null;
  try {
    const { data: conv } = await db()
      .from(TABLES[bot].conv)
      .select('id')
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conv?.id) return null;

    const { data: msgs } = await db()
      .from(TABLES[bot].msg)
      .select('role, content, meta')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    return {
      id: conv.id as string,
      messages: (msgs ?? []).map((m: { role: string; content: string; meta?: Record<string, unknown> | null }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        meta: m.meta ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export interface ConversationSummary { id: string; title: string; updatedAt: string; }

// List a user's conversation threads (most-recent first) for the chat sidebar.
// Title is derived from each thread's first user message (no title column
// needed). Threads with no user message yet are omitted.
export async function listConversations(bot: BotId, userEmail: string | null): Promise<ConversationSummary[]> {
  if (!userEmail) return [];
  try {
    const { data: convs } = await db()
      .from(TABLES[bot].conv)
      .select('id, updated_at')
      .eq('user_email', userEmail)
      .order('updated_at', { ascending: false })
      .limit(80);
    const ids = (convs ?? []).map((c: { id: string }) => c.id);
    if (!ids.length) return [];
    const { data: msgs } = await db()
      .from(TABLES[bot].msg)
      .select('conversation_id, content')
      .in('conversation_id', ids)
      .eq('role', 'user')
      .order('created_at', { ascending: true });
    const firstByConv: Record<string, string> = {};
    for (const m of (msgs ?? []) as { conversation_id: string; content: string }[]) {
      if (!firstByConv[m.conversation_id]) firstByConv[m.conversation_id] = m.content;
    }
    return (convs ?? [])
      .filter((c: { id: string }) => firstByConv[c.id])
      .map((c: { id: string; updated_at: string }) => ({
        id: c.id,
        updatedAt: c.updated_at,
        title: firstByConv[c.id].replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat',
      }));
  } catch {
    return [];
  }
}

// Load one specific thread's messages — scoped to the owner so a user can only
// open their own conversations.
export async function getConversation(bot: BotId, userEmail: string | null, id: string): Promise<ConversationHistory | null> {
  if (!userEmail || !id) return null;
  try {
    const { data: conv } = await db()
      .from(TABLES[bot].conv)
      .select('id')
      .eq('id', id)
      .eq('user_email', userEmail)
      .maybeSingle();
    if (!conv?.id) return null;
    const { data: msgs } = await db()
      .from(TABLES[bot].msg)
      .select('role, content, meta')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    return {
      id,
      messages: (msgs ?? []).map((m: { role: string; content: string; meta?: Record<string, unknown> | null }) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        meta: m.meta ?? null,
      })),
    };
  } catch {
    return null;
  }
}

// Delete one of the user's own threads (messages + conversation row).
export async function deleteConversation(bot: BotId, userEmail: string | null, id: string): Promise<boolean> {
  if (!userEmail || !id) return false;
  try {
    const { data: conv } = await db()
      .from(TABLES[bot].conv)
      .select('id')
      .eq('id', id)
      .eq('user_email', userEmail)
      .maybeSingle();
    if (!conv?.id) return false;
    await db().from(TABLES[bot].msg).delete().eq('conversation_id', id);
    await db().from(TABLES[bot].conv).delete().eq('id', id).eq('user_email', userEmail);
    return true;
  } catch {
    return false;
  }
}

export async function saveMemory(
  bot: BotId,
  content: string,
  scope?: string | null,
  sourceConversationId?: string | null
): Promise<void> {
  try {
    await db().from(TABLES[bot].mem).insert({
      content,
      scope: scope ?? null,
      source_conversation_id: sourceConversationId ?? null,
    });
  } catch {
    /* non-fatal */
  }
}

export interface RecalledMemory { content: string; scope: string | null; }

// Recall by recency + lightweight topic match: pull the most recent memories,
// then rank by word overlap with the query (so on-topic notes float up). No
// external embedding service — simple, dependency-free.
export async function recallMemories(bot: BotId, queryText: string, k = 6): Promise<RecalledMemory[]> {
  try {
    const { data } = await db()
      .from(TABLES[bot].mem)
      .select('content, scope, created_at')
      .order('created_at', { ascending: false })
      .limit(60);
    const rows = (data ?? []) as (RecalledMemory & { created_at: string })[];
    if (rows.length <= k) return rows.map(({ content, scope }) => ({ content, scope }));

    const terms = new Set(
      queryText.toLowerCase().split(/[^a-z0-9@.]+/).filter((w) => w.length > 2)
    );
    const scored = rows.map((r, i) => {
      const hay = `${r.content} ${r.scope ?? ''}`.toLowerCase();
      let overlap = 0;
      for (const t of terms) if (hay.includes(t)) overlap++;
      // recency tiebreaker: newer rows (lower i) get a small boost
      return { r, score: overlap * 10 - i };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(({ r }) => ({ content: r.content, scope: r.scope }));
  } catch {
    return [];
  }
}
