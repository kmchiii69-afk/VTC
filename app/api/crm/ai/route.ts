import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import Anthropic from '@anthropic-ai/sdk';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_2 });

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { lead_id } = await req.json().catch(() => ({}));
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 });

  const [leadRes, tpRes] = await Promise.all([
    db().from('crm_leads').select('*').eq('id', lead_id).single(),
    db().from('crm_touchpoints').select('*').eq('lead_id', lead_id).order('created_at', { ascending: true }),
  ]);

  const lead = leadRes.data;
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const touchpoints = tpRes.data ?? [];

  const tpText = touchpoints.length === 0
    ? 'No touchpoints logged yet.'
    : touchpoints.map((t: { created_at: string; direction: string; channel: string; content: string }) =>
        `[${new Date(t.created_at).toLocaleDateString()} | ${t.direction} | ${t.channel}] ${t.content}`
      ).join('\n');

  const prompt = `You are a sales coach helping close high-ticket consulting clients ($5K program).

LEAD PROFILE:
- Handle/Name: ${lead.ig_handle || lead.name || 'Unknown'}
- WhatsApp: ${lead.whatsapp || 'None'} (has WA: ${lead.has_whatsapp})
- Source: ${lead.source || 'Unknown'}
- ICP Tier: ${lead.icp_tier || 'Unscored'}
- Status: ${lead.status || 'Unset'}
- Revenue: ${lead.revenue || 'Unknown'}
- Business: ${lead.business || 'Unknown'}
- Stage: ${lead.stage}
- Notes: ${lead.notes || 'None'}

TOUCHPOINT HISTORY (oldest first):
${tpText}

Write:
1. A 2-3 sentence summary of where this lead is in the journey and the key thing you know about them.
2. The single highest-leverage next move to advance this lead toward a booked call or close.

Format your response as JSON:
{"summary": "...", "next_move": "..."}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text.trim();
  let parsed: { summary: string; next_move: string } = { summary: '', next_move: '' };
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {
    parsed = { summary: raw, next_move: '' };
  }

  // Save back to lead
  await db().from('crm_leads').update({
    ai_summary: parsed.summary,
    ai_next_move: parsed.next_move,
    updated_at: new Date().toISOString(),
  }).eq('id', lead_id);

  return NextResponse.json(parsed);
}
