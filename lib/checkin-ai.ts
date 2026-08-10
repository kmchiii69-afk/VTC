import Anthropic from '@anthropic-ai/sdk';
import { MODULES_CONTEXT, ROADMAP_CONTEXT, SOOWEI_VOICE } from '@/lib/coaching-context';
import type { NormalizedCall } from '@/lib/checkin-matching';
import type { ClientProgress } from '@/lib/checkins';

// Sonnet for extraction quality (the chat assistant uses Haiku for speed).
const MODEL = 'claude-sonnet-4-6';
// Calls run 80–90 min (~75k chars); analyze the whole transcript so the stored
// summary/blockers/wins never miss the tail. Well within Sonnet's context window.
const MAX_TRANSCRIPT_CHARS = 200_000;

export interface CallExtraction {
  summary_bullets: string[];
  action_steps: string[];
  queries_answered: string[];
  wins: string[];
  blockers: string[];
  sentiment: string;
  red_flags: string[];
  roadmap_updates: string[];
}

export interface ProgressUpdate {
  narrative: string;          // client-safe, SooWei voice
  open_action_items: string[]; // outstanding next steps after this call
  wins: string[];             // cumulative highlights
  momentum: string;           // e.g. "improving" | "steady" | "stalling"
  admin_notes: string;        // red flags / sensitive — ADMIN ONLY
  current_phase: number;      // 1–5 program phase the client is currently in (0 = unknown)
}

export interface CheckInAnalysis {
  call: CallExtraction;
  progress: ProgressUpdate;
}

const EMPTY: CheckInAnalysis = {
  call: {
    summary_bullets: [],
    action_steps: [],
    queries_answered: [],
    wins: [],
    blockers: [],
    sentiment: '',
    red_flags: [],
    roadmap_updates: [],
  },
  progress: {
    narrative: '',
    open_action_items: [],
    wins: [],
    momentum: '',
    admin_notes: '',
    current_phase: 0,
  },
};

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : String(x))).filter(Boolean);
}

function buildSystemPrompt(): string {
  return `You are an analyst for Goh Consulting's coaching program. You read a coaching
check-in call transcript and produce a structured progress update for the client.

You output TWO things:
1. An objective extraction of what happened on THIS call.
2. An updated rolling profile for the client that MERGES this call with their prior progress.

${SOOWEI_VOICE}

The "narrative" field is shown to the CLIENT, so it must be encouraging, second-person, and
contain NO sensitive concerns. The "admin_notes" and "red_flags" fields are shown ONLY to
admins/coaches — put churn risk, disengagement, payment issues, frustration, or any concern
there, never in the narrative.

Map progress against this program when relevant:
ROADMAP:
${ROADMAP_CONTEXT}

MODULES:
${MODULES_CONTEXT}

Respond with VALID JSON ONLY, no markdown, matching exactly this shape:
{
  "call": {
    "summary_bullets": ["short factual bullet of what happened", "..."],
    "action_steps": ["concrete next step the client was given", "..."],
    "queries_answered": ["question the client raised and the gist of the answer", "..."],
    "wins": ["concrete win or progress mentioned", "..."],
    "blockers": ["what is blocking the client", "..."],
    "sentiment": "one short phrase, e.g. motivated / frustrated / neutral",
    "red_flags": ["ADMIN-ONLY concern, empty array if none", "..."],
    "roadmap_updates": ["e.g. 'Now in Phase 2', 'Completed Module 27', 'Blocked on offer'", "..."]
  },
  "progress": {
    "narrative": "client-facing rolling summary of where they are and what's improving, in SooWei's voice, plain prose, no markdown",
    "open_action_items": ["outstanding next steps after this call, merged with prior open items", "..."],
    "wins": ["cumulative highlights across calls", "..."],
    "momentum": "improving | steady | stalling",
    "admin_notes": "ADMIN-ONLY rolling notes incl. any red flags / risks, plain prose",
    "current_phase": 3
  }
}

For "current_phase", output a single integer 1–5 for the ROADMAP phase the client is
currently working in (1 = Foundation of Content, 2 = Mastering Camera Presence,
3 = Brand Positioning + Content Messaging, 4 = TOF Masterclass, 5 = MOF Masterclass).
Judge it from where their actual work and blockers sit, carrying the prior phase forward
if this call doesn't move them. Use 0 only if genuinely indeterminable.`;
}

function buildUserPrompt(args: {
  call: NormalizedCall;
  clientName: string;
  existing: ClientProgress | null;
}): string {
  const { call, clientName, existing } = args;
  const transcript = call.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const prior = existing
    ? `PRIOR PROGRESS (to merge with):
narrative: ${existing.narrative || '(none)'}
open_action_items: ${JSON.stringify(existing.open_action_items ?? [])}
wins: ${JSON.stringify(existing.wins ?? [])}
momentum: ${existing.momentum || '(none)'}
admin_notes: ${existing.admin_notes || '(none)'}`
    : 'PRIOR PROGRESS: none (this is the first recorded check-in).';

  return `CLIENT: ${clientName || 'Unknown'}
CALL TITLE: ${call.title || '(untitled)'}
CALL DATE: ${call.callDate || '(unknown)'}

${prior}

${call.summary ? `FATHOM SUMMARY:\n${call.summary}\n` : ''}${
    call.actionItems.length ? `FATHOM ACTION ITEMS:\n${call.actionItems.join('\n')}\n` : ''
  }
TRANSCRIPT:
${transcript || '(no transcript provided)'}`;
}

export async function analyzeCheckIn(args: {
  call: NormalizedCall;
  clientName: string;
  existing: ClientProgress | null;
}): Promise<CheckInAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(args) }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
  let parsed: { call?: Partial<CallExtraction>; progress?: Partial<ProgressUpdate> };
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Fall back to Fathom's own summary/action items so the call is still useful.
    return {
      ...EMPTY,
      call: {
        ...EMPTY.call,
        summary_bullets: args.call.summary ? [args.call.summary] : [],
        action_steps: args.call.actionItems,
      },
    };
  }

  return {
    call: {
      summary_bullets: strArray(parsed.call?.summary_bullets),
      action_steps: strArray(parsed.call?.action_steps),
      queries_answered: strArray(parsed.call?.queries_answered),
      wins: strArray(parsed.call?.wins),
      blockers: strArray(parsed.call?.blockers),
      sentiment: typeof parsed.call?.sentiment === 'string' ? parsed.call.sentiment : '',
      red_flags: strArray(parsed.call?.red_flags),
      roadmap_updates: strArray(parsed.call?.roadmap_updates),
    },
    progress: {
      narrative: typeof parsed.progress?.narrative === 'string' ? parsed.progress.narrative : '',
      open_action_items: strArray(parsed.progress?.open_action_items),
      wins: strArray(parsed.progress?.wins),
      momentum: typeof parsed.progress?.momentum === 'string' ? parsed.progress.momentum : '',
      admin_notes: typeof parsed.progress?.admin_notes === 'string' ? parsed.progress.admin_notes : '',
      current_phase: clampPhase(parsed.progress?.current_phase),
    },
  };
}

function clampPhase(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
}
