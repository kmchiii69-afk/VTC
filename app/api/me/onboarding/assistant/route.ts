import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { ONBOARDING_WELCOME, ONBOARDING_CALL_STEP_ID } from '@/lib/onboarding-data';
import {
  CREATIVE_ONBOARDING_WELCOME, onboardingVariantFor, stepsForVariant,
  type OnboardingVariant,
} from '@/lib/onboarding-variant';

// Lightweight, client-facing onboarding FAQ assistant. It is NOT a tool-using
// agent — it just answers questions about the onboarding flow using the step
// data as its knowledge base (what each step is, why it matters, what's next).
// Returns { reply }. Mirrors the { message, history } contract of AiChat.

export const maxDuration = 30;

// The knowledge base is the caller's OWN onboarding — a Creative Specialist has a
// single form step and no CSM call, so the standard "finish line" framing would
// be flatly wrong for them.
function buildSystem(variant: OnboardingVariant): string {
  const stepDefs = stepsForVariant(variant);
  const steps = stepDefs.map((s, i) => {
    const parts = [`${i + 1}. ${s.title}`];
    if (s.subtitle) parts.push(`   ${s.subtitle}`);
    if (s.body) parts.push(`   ${s.body.replace(/\n+/g, ' ')}`);
    if (s.requiresUpload) parts.push('   (requires uploading a PDF to continue)');
    if (s.contracts) parts.push('   (requires selecting & signing a contract to continue)');
    return parts.join('\n');
  }).join('\n\n');

  const callIdx = stepDefs.findIndex((s) => s.id === ONBOARDING_CALL_STEP_ID);
  const finishLine = callIdx >= 0
    ? `The onboarding is completed one step at a time, in order — each step unlocks the next. The finish line is the final step (#${callIdx + 1}, "${stepDefs[callIdx].title}") — booking the call with their Client Success Manager. Always frame progress as moving toward that CSM onboarding call.`
    : `This member is a Creative Specialist: their onboarding is a SINGLE step — submitting the Creative Specialist onboarding form. There is no contract, no module unlock and no CSM onboarding call in their flow. Once the form is in, they go straight to their Creative Specialist roadmap. Never tell them about steps that aren't listed below.`;

  const welcome = variant === 'creative' ? CREATIVE_ONBOARDING_WELCOME.body : ONBOARDING_WELCOME.body;

  return `You are the Brand Architect onboarding assistant — a warm, concise guide embedded in the onboarding wizard. New clients ask you questions about the onboarding process and you help them get through it confidently.

ABOUT ONBOARDING
${welcome}

${finishLine}

THE STEPS (in order)
${steps}

HOW TO ANSWER
- Be encouraging and brief (2-5 sentences, or a short list). This is a chat, not an essay.
- Explain what a step is, WHY it matters, and what to do next when asked.
- If asked "what's after X" or "what do I do now", name the next step and the action.
- If they seem stuck, reassure them and point to the exact action (e.g. "upload your PDF", "click Open & sign").
- Only answer about onboarding, the program, and getting set up. If asked something unrelated, gently steer back to onboarding and suggest they ask their CSM on the onboarding call.
- Never invent links, prices, or policies that aren't in the step descriptions. If unsure, tell them their CSM will cover it on the call.
- Plain text only — no markdown headers. Short paragraphs or simple dashes for lists.`;
}

interface InMsg { role: 'user' | 'assistant'; content: string; }

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });
  const history: InMsg[] = Array.isArray(body?.history) ? body.history : [];

  const profile = await getUser(user.email).catch(() => null);
  const variant = onboardingVariantFor(profile?.features);

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: buildSystem(variant),
      messages,
    });
    const reply =
      res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim() ||
      'Sorry — try asking that a different way.';
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Onboarding assistant error:', err);
    return NextResponse.json({ error: 'Assistant unavailable, try again.' }, { status: 500 });
  }
}
