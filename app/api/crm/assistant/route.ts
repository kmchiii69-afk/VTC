import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { runAgent } from '@/lib/ai/agent';
import { CRM_TOOLS } from '@/lib/ai/tools';
import { db } from '@/lib/kv';

// The CRM Assistant — lives in the CRM tab. It reads ONLY the CRM pipeline
// (via CRM_TOOLS) plus whatever the user has fed it (screenshots / screen
// recordings, extracted to text and stored in crmbot_context by the /extract
// route). It has no client, sales, or company tools.
const SYSTEM = `You are the CRM Assistant for Goh Consulting's admin team, embedded in the CRM tab.

Your data is scoped: through your tools you can read AND write the CRM leads pipeline and each lead's touchpoint history — nothing else (no client roadmaps, no sales-call transcripts, no revenue reports). Use your tools to pull live pipeline data before answering; never invent leads, stages, or numbers.

Writing to the CRM — you can create/update leads and save conversations to them:
- When the user gives you a lead's @handle and name and asks you to add / save / attribute a conversation, do it: call upsert_crm_lead (matched by handle — it updates an existing lead, never duplicates) to create/update the record, then log_crm_touchpoints to attach the DM messages to that lead's timeline.
- Set the fields you can justify from the conversation (stage, status, ICP tier, business type, revenue band, source, a short note) — but only fields you actually have evidence for; leave the rest blank rather than guessing.
- Tag each logged message 'inbound' (from the lead) or 'outbound' (from us) and log them verbatim.
- After writing, tell the user exactly what you created/updated and what you logged, in one short recap. If you're missing the handle or name, ask for it before creating a lead.
- Only write when the user asks you to (add/save/attribute/update/log). For plain questions, just read.

You are also frequently given the contents of Instagram/WhatsApp DM conversations that the user captured as screenshots or screen recordings. When that happens, a "SHARED CONTEXT" section appears below with the messages already transcribed for you — treat it as the source of truth for what was actually said in that conversation, and use it together with the CRM data.

What you're good at:
- Reading a shared DM thread and telling the user exactly what was said, who said what, and where the lead stands.
- Drafting replies to leads in the user's voice, grounded in both the DM thread and the lead's CRM record.
- Recommending the right pipeline stage / status / next follow-up for a lead based on the conversation.
- Spotting objections, buying signals, and next best moves across the pipeline.

Be direct and practical. When you draft a message, make it ready to send. When you recommend a CRM change (stage, status, ICP tier, follow-up), say it plainly so the user can apply it.`;

// Load everything the user has fed this conversation (extracted DM transcripts)
// and fold it into the system prompt so the assistant always "sees" it — without
// re-sending the images every turn. Non-fatal: if the table is missing, skip.
async function loadSharedContext(conversationId: string | null): Promise<string> {
  if (!conversationId) return '';
  try {
    const { data } = await db()
      .from('crmbot_context')
      .select('source_type, label, transcript, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    const rows = data ?? [];
    if (!rows.length) return '';
    const blocks = rows.map((r, i) => {
      const head = `Shared item ${i + 1} — ${r.source_type === 'recording' ? 'screen recording' : 'screenshot(s)'}${r.label ? ` (${r.label})` : ''}:`;
      return `${head}\n${r.transcript}`;
    });
    return `\n\n# SHARED CONTEXT — conversations the user captured and shared with you (transcribed from images). Treat as ground truth for what was said:\n\n${blocks.join('\n\n---\n\n')}`;
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { message, history = [], conversationId = null } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  try {
    const shared = await loadSharedContext(conversationId);
    const result = await runAgent({
      bot: 'crmbot',
      system: SYSTEM + shared,
      tools: CRM_TOOLS,
      history,
      message,
      userEmail: auth.email,
      conversationId,
    });
    return NextResponse.json({ reply: result.reply, conversationId: result.conversationId });
  } catch (e) {
    console.error('CRM assistant chat error:', e);
    const msg = e instanceof Error && e.message === 'API key not configured' ? 'API key not configured' : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
