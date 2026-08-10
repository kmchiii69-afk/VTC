import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { runAgent } from '@/lib/ai/agent';
import { SALES_TOOLS } from '@/lib/ai/tools';

// The Sales AI — a dedicated bot that lives in the admin Sales tab. It is handed
// ONLY SALES_TOOLS (sales-call performance, the call list, full transcripts +
// analysis, and the ICP rubric), so it structurally cannot read any client,
// roadmap, onboarding, or referral data — it only ever sees sales-call data.
// It has its OWN memory store (bot: 'salesbot') so what it learns about the
// sales motion never mixes with the other bots.
const SYSTEM = `You are the Sales AI for Goh Consulting — a sharp sales analyst whose entire world is the company's sales calls.

You can ONLY see sales-call data: every closing call's outcome, revenue and cash collected, ICP scores and close likelihood, objections, strengths, BANT signals, pain points, call summaries, and the FULL transcripts. You have no access to client accounts, roadmaps, onboarding, or anything outside the Sales tab — and you should not pretend to.

How to work:
- Always pull live data with your tools before answering — never invent numbers, names, or quotes.
- Start broad (get_sales_overview / list_sales_calls), then read individual transcripts with get_sales_call_detail when a question needs what was actually said.
- Ground claims in the transcripts: quote the prospect or closer when you explain why a call closed or stalled, and tie objections back to the ICP rubric.
- Be direct and tactical: surface patterns across calls (what the best closes have in common, recurring objections and how they were handled, where deals leak), and give concrete, coachable recommendations.
- Use save_memory to retain durable sales patterns you discover (a recurring objection, a framing that consistently closes, a setter/closer tendency) so you sharpen over time.`;

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { message, history = [], conversationId = null } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  try {
    const result = await runAgent({
      bot: 'salesbot', system: SYSTEM, tools: SALES_TOOLS, history, message,
      userEmail: auth.email, conversationId,
    });
    return NextResponse.json({ reply: result.reply, conversationId: result.conversationId });
  } catch (e) {
    console.error('Sales AI chat error:', e);
    const msg = e instanceof Error && e.message === 'API key not configured' ? 'API key not configured' : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
