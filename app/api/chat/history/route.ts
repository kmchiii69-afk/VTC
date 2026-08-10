import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getLatestConversation } from '@/lib/ai/memory';

// Returns the signed-in user's most recent /select (content bot) chat thread so
// the conversation persists across visits. Scoped to their own email.
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ conversationId: null, messages: [] });

  const conv = await getLatestConversation('content', auth.email);
  // Flatten each message's stored render data (SOP/module link buttons) up to
  // the top level so the client restores them exactly as first rendered.
  const messages = (conv?.messages ?? []).map((m) => {
    const meta = (m.meta ?? {}) as { sops?: unknown[]; modules?: unknown[]; resources?: unknown[]; recordings?: unknown[] };
    return {
      role: m.role,
      content: m.content,
      sops: Array.isArray(meta.sops) ? meta.sops : [],
      modules: Array.isArray(meta.modules) ? meta.modules : [],
      resources: Array.isArray(meta.resources) ? meta.resources : [],
      recordings: Array.isArray(meta.recordings) ? meta.recordings : [],
    };
  });
  return NextResponse.json({
    conversationId: conv?.id ?? null,
    messages,
  });
}
