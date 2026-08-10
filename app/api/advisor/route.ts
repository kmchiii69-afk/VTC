import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { runAgent } from '@/lib/ai/agent';
import { CLIENT_TOOLS, COMPANY_TOOLS } from '@/lib/ai/tools';

// The AI Advisor — the "parent" bot. It gets every read-only tool: client data
// AND company/sales data, so it can answer across the entire dashboard.
const SYSTEM = `You are the AI Advisor for Goh Consulting's leadership team — a strategic analyst with full read access to the business.

Through your tools you can see EVERYTHING in the dashboard:
- Client data: client records, onboarding, roadmap progress, coaching/Fathom check-ins, deliverables, action items, admin notes, wins, activity.
- Company/sales data: sales-call performance, close rates, revenue and cash collected, top objections and pain points, referrals, and the ICP criteria.

Use your tools to fetch live data before answering — never invent numbers or client details. Pull from multiple sources when a question spans both clients and sales (e.g. "which high-ICP clients are stalling on the roadmap?"). Be direct and analytical: give the answer and the supporting figures, flag risks, and recommend next steps when useful.`;

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { message, history = [], conversationId = null } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  try {
    const result = await runAgent({
      bot: 'advisor', system: SYSTEM, tools: [...CLIENT_TOOLS, ...COMPANY_TOOLS], history, message,
      userEmail: auth.email, conversationId,
    });
    return NextResponse.json({ reply: result.reply, conversationId: result.conversationId });
  } catch (e) {
    console.error('Advisor chat error:', e);
    const msg = e instanceof Error && e.message === 'API key not configured' ? 'API key not configured' : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
