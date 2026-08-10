import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { runAgent } from '@/lib/ai/agent';
import { CLIENT_TOOLS } from '@/lib/ai/tools';

// The Client Success bot. It is given CLIENT_TOOLS only — it has no tool that
// can read sales, revenue, referral, or any company-wide data, so it cannot
// access anything beyond individual client journeys.
const SYSTEM = `You are the Client Success assistant for Goh Consulting's internal team.

You help the team understand any client's journey. Through your tools you can see ONLY client data: client records, onboarding progress, roadmap progress, coaching/Fathom check-in calls, deliverables, action items, admin notes, wins, and activity timeline.

You have NO access to company sales figures, revenue, cash collected, referrals, ICP/sales-call data, or anything outside an individual client's journey. If asked about those, say it's outside your scope and that the team should use the AI Advisor instead.

Always use your tools to fetch live data before answering — never invent client details. Be concise and specific, refer to clients by name, and surface red flags or stalled progress when relevant.`;

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { message, history = [], conversationId = null } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 });

  try {
    const result = await runAgent({
      bot: 'csm', system: SYSTEM, tools: CLIENT_TOOLS, history, message,
      userEmail: auth.email, conversationId,
    });
    return NextResponse.json({ reply: result.reply, conversationId: result.conversationId });
  } catch (e) {
    console.error('CSM chat error:', e);
    const msg = e instanceof Error && e.message === 'API key not configured' ? 'API key not configured' : 'Something went wrong';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
