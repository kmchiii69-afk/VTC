import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth';
import { getClientJourney, getClientSummary, setClientSummary } from '@/lib/csm';
import { contractTierLabel } from '@/lib/client-tags';

export const maxDuration = 45;

type Params = { params: Promise<{ email: string }> };

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

const SYSTEM = `You are a Client Success analyst at a content/branding coaching agency. Given one client's data, write a tight journey summary for the success team to read at a glance.

Output these sections IN THIS ORDER. Each section's header MUST be on its own line in ALL CAPS exactly as written, followed by 1–2 plain sentences (no bullets, no markdown):
WHO THEY ARE
PROGRESS
ENGAGEMENT
WINS
RED FLAGS
FOCUS NEXT

Rules:
- WHO THEY ARE: their background/goal from forms/profile.
- PROGRESS: onboarding status, current roadmap phase + overall roadmap %, modules done.
- ENGAGEMENT: logins/recency, check-in sentiment, any stalling.
- WINS: notable wins, or "None yet."
- RED FLAGS: risks, blockers, inactivity, negative sentiment, or "None."
- FOCUS NEXT: the single most important thing the team should drive.
Be specific and use the actual numbers. Keep each section to 1–2 sentences. Plain text only.`;

function journeyToContext(j: Awaited<ReturnType<typeof getClientJourney>>): string {
  const p = j.profile;
  const open = j.actionItems.filter((a) => a.status === 'open');
  const lines: string[] = [];
  lines.push(`Client: ${p?.name || 'Unknown'} (${p?.email || ''})`);
  if (p?.contract_tier) lines.push(`Contract: ${contractTierLabel(p.contract_tier)}`);
  if (p?.tags?.length) lines.push(`Tags: ${p.tags.join(', ')}`);
  if (p?.revenue_goal) lines.push(`Revenue goal: ${p.revenue_goal} (current ${p.revenue_current ?? 0})`);
  lines.push(`Onboarding: ${j.onboarding.completed}/${j.onboarding.total} steps ${j.onboarding.onboardedAt ? '(completed)' : '(in progress)'}`);
  lines.push(`Roadmap: ${j.roadmap.completed}/${j.roadmap.total} items done`);
  lines.push(`Phases: ${j.roadmap.phases.map((ph) => `${ph.title} ${ph.completed}/${ph.total}`).join('; ')}`);
  lines.push(`Modules completed: ${j.modules.completed}`);
  if (j.progress?.momentum) lines.push(`Momentum (from check-ins): ${j.progress.momentum}`);
  if (j.progress?.narrative) lines.push(`Progress narrative: ${j.progress.narrative}`);
  if (j.progress?.admin_notes) lines.push(`Admin notes / red flags: ${j.progress.admin_notes}`);
  lines.push(`Open action items (${open.length}): ${open.slice(0, 8).map((a) => a.text).join(' | ') || 'none'}`);
  lines.push(`Check-ins (${j.checkins.length}): ${j.checkins.slice(0, 6).map((c) => `${c.title || 'call'}${c.sentiment ? ` [${c.sentiment}]` : ''}`).join(' | ') || 'none'}`);
  if (j.wins?.length) lines.push(`Wins: ${j.wins.slice(0, 6).map((w) => w.content).join(' | ')}`);
  const recent = j.events.slice(0, 15).map((e) => e.title || e.event_type).join(', ');
  if (recent) lines.push(`Recent activity: ${recent}`);
  lines.push(`Last activity: ${j.summary.lastEventAt || '—'}; total logged events: ${j.summary.total}`);
  if (j.forms) lines.push(`\nIntake form responses:\n${j.forms.slice(0, 3000)}`);
  return lines.join('\n');
}

// Cached summary (fast, no AI call).
export async function GET(_req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email } = await params;
  const s = await getClientSummary(decodeURIComponent(email));
  return NextResponse.json(s ?? { summary: null, generatedAt: null });
}

// Regenerate from the full journey and cache it.
export async function POST(_req: NextRequest, { params }: Params) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 503 });

  const { email } = await params;
  const e = decodeURIComponent(email);
  try {
    const j = await getClientJourney(e);
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: journeyToContext(j) }],
    });
    const summary = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!summary) return NextResponse.json({ error: 'Empty summary' }, { status: 500 });
    const generatedAt = await setClientSummary(e, summary);
    return NextResponse.json({ summary, generatedAt });
  } catch (err) {
    console.error('client summary error:', err);
    return NextResponse.json({ error: 'Summary generation failed' }, { status: 500 });
  }
}
