import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// Q&A about a specific call recording. The user can paste the call's summary /
// notes as `context`; the assistant answers questions grounded in that text.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message, history = [], context = '', title = '' } = (await req.json().catch(() => ({}))) as {
    message: string; history: ChatMessage[]; context: string; title: string;
  };
  if (!message?.trim()) return NextResponse.json({ error: 'No message provided' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  const systemPrompt = `You are a sharp, friendly study assistant helping a Goh Consulting member understand a coaching call recording${title ? ` titled "${title}"` : ''}.

The member is watching the recording and wants to dig deeper. Answer their questions clearly and concisely in plain conversational language — no markdown, no bullet symbols, short paragraphs.

${context.trim()
  ? `Here is the call's summary / notes the member provided. Ground your answers in this material; quote or reference specific points from it when relevant:\n\n"""\n${context.trim().slice(0, 12000)}\n"""`
  : `The member has not pasted a summary. Answer from general coaching/business knowledge, and if a question needs specifics from the call, gently suggest they paste the call summary so you can be precise.`}

Rules: be genuinely helpful and specific. If the answer isn't in the provided summary, say what you can and note that it wasn't covered in the notes they shared. Never invent details about what was said on the call.`;

  try {
    const client = new Anthropic({ apiKey });
    const messages: Anthropic.MessageParam[] = [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    const answer = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ answer });
  } catch (err) {
    console.error('Recording ask error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
