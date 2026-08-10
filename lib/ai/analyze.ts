import Anthropic from '@anthropic-ai/sdk';

// maxRetries: the SDK auto-retries transient failures (429 rate-limit, 500/503,
// and 529 "overloaded") with exponential backoff. Bumped from the default 2 to 5
// so a busy API doesn't strand a sales-call analysis. timeout is generous because
// long closing transcripts (2-3h calls) can take 30-60s to analyze.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY_2 || process.env.ANTHROPIC_API_KEY,
  maxRetries: 5,
  timeout: 120_000,
});

// Extract the JSON object from a model response. Throws a DESCRIPTIVE error (not a
// bare JSON.parse SyntaxError) so callers can log why an analysis failed. Detects
// the two real-world failure modes: a truncated response (hit max_tokens mid-JSON)
// and a response with no JSON at all.
function parseJsonResponse<T>(text: string, stopReason: string | null): T {
  if (stopReason === 'max_tokens') {
    throw new Error('AI response truncated (hit max_tokens) — increase max_tokens');
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (e) {
    throw new Error(`AI response was not valid JSON: ${(e as Error).message}`);
  }
}

export interface IcpAnalysis {
  icp_score: number;
  pain_points: string[];
  call_summary: string;
  next_step: string;
  strengths: string[];
  objections: string[];
  budget_signals: string;
  authority_signals: string;
  need_signals: string;
  timeline_signals: string;
  reasoning: string;
}

export interface ClosingAnalysis extends IcpAnalysis {
  close_likelihood: number;
  close_outcome: string;
  // Judged independently of close_outcome: did this prospect turn out not to be
  // qualified (couldn't afford it, no business/offer to scale, wrong fit)? Asked
  // as its own question because the model otherwise defaults a showed-up-but-
  // unqualified call to 'no_close' and the DQ never gets counted.
  disqualified?: boolean;
  dq_reason?: string;
  commitment_level: string;
  deal_value_signals: string;
  blockers: string[];
  close_strategy: string;
  follow_up_actions: string[];
  what_would_have_closed: string;
  setter_notes: string;
  // Money figures extracted ONLY when explicitly stated on the call; 0 otherwise.
  // These are AI-estimated and meant to be overridable by an admin.
  cash_collected: number;
  revenue: number;
  // true when this isn't a genuine sales/closing call with an external prospect
  // (internal/team/coaching/onboarding call). Callers skip these so they never
  // land on the Sales Calls dashboard.
  is_internal_call: boolean;
  // The prospect/lead's name as spoken in the transcript. Used to fill the call's
  // lead_name when Fathom didn't provide an external attendee ('' if unclear).
  prospect_name: string;
}

export const CALL_OUTCOMES = ['closed', 'no_close', 'dq', 'no_show'] as const;

/**
 * The outcome to store on the call row.
 *
 * `close_outcome` alone under-reports DQs: asked to pick one enum value for a call
 * where an unqualified prospect still got pitched, the model reliably answers
 * 'no_close'. `disqualified` is asked as its own yes/no question, so an
 * unqualified prospect lands in the DQ bucket even when the enum said no-close.
 */
export function resolveCallOutcome(
  a: Pick<ClosingAnalysis, 'close_outcome'> & { disqualified?: boolean },
): string {
  const stated = String(a.close_outcome ?? '').toLowerCase().trim();
  if (stated === 'closed') return 'closed';   // a sale is a sale
  if (stated === 'no_show') return 'no_show'; // nobody to qualify
  if (a.disqualified === true) return 'dq';
  return (CALL_OUTCOMES as readonly string[]).includes(stated) ? stated : 'unknown';
}

export async function analyzeCall(
  transcript: string,
  icpCriteria: Record<string, unknown>
): Promise<IcpAnalysis> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an elite sales analyst AI. Analyze sales call transcripts and score prospects against the ICP.

ICP Criteria:
${JSON.stringify(icpCriteria, null, 2)}

Always respond with valid JSON only.`,
    messages: [{
      role: 'user',
      content: `Analyze this sales call and return ONLY a JSON object with this exact structure:
{
  "icp_score": <0-100>,
  "pain_points": ["..."],
  "call_summary": "2-3 sentence summary",
  "next_step": "specific recommended action",
  "strengths": ["reasons this is a good fit"],
  "objections": ["objections raised"],
  "budget_signals": "what was said about budget",
  "authority_signals": "is this person a decision maker",
  "need_signals": "how urgent is their need",
  "timeline_signals": "timeline signals given",
  "reasoning": "1-2 sentences explaining the score"
}

TRANSCRIPT:
${transcript}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJsonResponse<IcpAnalysis>(text, response.stop_reason);
}

export async function analyzeClosingCall(
  notes: string,
  icpCriteria: Record<string, unknown>,
  outcome?: string
): Promise<ClosingAnalysis> {
  // The ICP criteria can be either a structured object or, preferably, a prose
  // scoring rubric stored under `rubric` — embed that verbatim so the model scores
  // exactly to the rubric instead of a JSON dump.
  const rubric = (icpCriteria as { rubric?: unknown }).rubric;
  const icpText = typeof rubric === 'string' && rubric.trim()
    ? rubric
    : JSON.stringify(icpCriteria, null, 2);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    // 4096 (was 2048): the closing-call JSON has ~20 fields with several prose
    // sections + arrays; 2048 could truncate mid-object on a detailed call, which
    // broke JSON parsing and failed the analysis. Headroom prevents that.
    max_tokens: 4096,
    system: `You are an elite sales coach and analyst. You analyze sales closing call notes to give deep breakdowns on prospects, close attempts, and what drives wins or losses.

ICP LEAD SCORING RUBRIC — compute icp_score strictly by this rubric:
${icpText}

OUTCOME DEFINITIONS — these are accounting categories, not judgements. Apply them literally:
- "closed"   — they said yes and committed to buy (payment taken, deposit taken, or an explicit "I'm in / let's do it" with terms agreed).
- "dq"       — they SHOWED UP but were never actually buyable, so this was not a real close attempt. Use "dq" whenever any of these is true, EVEN IF the closer still pitched and the call ended in a "no":
    · they cannot afford it at all and there is no realistic path to the money (no income, no savings, no access to credit — not merely "it's a stretch" or "I need to move money around")
    · they don't have the business this is for — no offer, no audience, no clients, pre-revenue with nothing to scale
    · they're the wrong fit for what's sold (wanted done-for-you/an agency, wanted a different service, wanted a job, already has it, wrong industry/geography)
    · they're not the decision maker and the actual decision maker was never going to be involved
    · they came in for something else entirely, were confused about what the call was, or were a tyre-kicker with no intent to buy anything
- "no_close" — they WERE a real, qualified prospect who could have bought and simply didn't yet: needs to think, needs to talk to a spouse/partner, timing, comparing options, wants to start next month, ghosted the decision.
- "no_show"  — the prospect never joined / there is no prospect conversation in the notes at all.

The distinction that matters: "no_close" means a winnable deal was lost, "dq" means there was no deal to win. Do not default a disqualified prospect to "no_close" just because a pitch happened or because the notes read like a normal sales call — the DQ number is what tells the team their booking criteria are off, so it has to be accurate.

${outcome ? `Known outcome (the human who logged this call recorded it as this — trust it unless the notes flatly contradict it): ${outcome}` : ''}

Always respond with valid JSON only.`,
    messages: [{
      role: 'user',
      content: `Analyze these closing call notes and return ONLY a JSON object with this exact structure:
{
  "is_internal_call": <true ONLY if this is NOT a real sales call with an external prospect — i.e. an internal team/strategy meeting, a coaching/training/fulfillment call, an onboarding call, or a 1-1 between colleagues with no one being sold to. false if a salesperson is actively pitching/closing a prospect>,
  "prospect_name": "<the prospect/lead's full name as it appears in the transcript (the person being sold to, NOT the closer/salesperson). Empty string if you genuinely cannot tell.>",
  "icp_score": <0-100 TOTAL, computed strictly per the ICP scoring rubric above — sum the weighted factors; for factors genuinely not discussed, follow the rubric's missing-data rule>,
  "close_likelihood": <0-100, how closeable was this prospect given the conversation>,
  "close_outcome": "closed|no_close|dq|no_show",
  "disqualified": <true if the prospect turned out NOT to be qualified — see the OUTCOME DEFINITIONS above. Judge this on its own: a call can be both a lost sale AND a disqualification, and in that case this is true>,
  "dq_reason": "<if disqualified is true, the one specific reason (e.g. 'no offer or audience yet', 'couldn't afford the program', 'looking for done-for-you, not coaching'). Empty string otherwise>",
  "commitment_level": "high|medium|low — one phrase explanation",
  "pain_points": ["specific pains they mentioned"],
  "strengths": ["reasons they are a strong fit"],
  "objections": ["every objection raised verbatim or paraphrased"],
  "blockers": ["specific things blocking the close — cash, timing, comparison, etc"],
  "what_would_have_closed": "specific thing(s) that would have moved them to yes",
  "close_strategy": "recommended follow-up strategy",
  "follow_up_actions": ["specific action 1", "action 2"],
  "deal_value_signals": "what they said or implied about budget/willingness to invest",
  "budget_signals": "specific budget mentions",
  "authority_signals": "is this the decision maker",
  "need_signals": "urgency of their problem",
  "timeline_signals": "when they plan to make a decision",
  "setter_notes": "coaching for the setter who booked this call — what to improve",
  "cash_collected": <number — dollar amount of cash actually collected/paid on this call if explicitly stated (e.g. a deposit or full payment taken), else 0. Digits only, no symbols>,
  "revenue": <number — total deal/contract value if explicitly stated, else 0. Digits only, no symbols>,
  "call_summary": "2-3 sentence summary of the call",
  "next_step": "single most important next action",
  "reasoning": "explain the ICP score with the per-factor breakdown (budget, income, pain, opportunity cost, social proof) and note any factors that weren't discussed"
}

CALL NOTES:
${notes}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJsonResponse<ClosingAnalysis>(text, response.stop_reason);
}

export interface AdvisorContext {
  total_calls: number;
  closed_calls: number;
  close_rate: number;
  avg_icp_score: number;
  avg_close_likelihood: number;
  total_revenue: number;
  total_cash_collected: number;
  top_objections: string[];
  top_pain_points: string[];
  recent_calls: Array<{
    lead_name: string;
    call_date: string;
    outcome: string;
    icp_score: number;
    close_likelihood: number;
    call_summary: string;
    blockers: string[];
    what_would_have_closed: string;
    closer: string;
  }>;
  icp_criteria: Record<string, unknown>;
}

export async function getAdvisorResponse(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: AdvisorContext
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are an elite AI sales coach for Goh Consulting's Brand Architect program. You have deep knowledge of sales, closing, objection handling, and business growth.

You have access to real sales data from their team:

PIPELINE OVERVIEW:
- Total calls analyzed: ${context.total_calls}
- Closed deals: ${context.closed_calls} (${context.close_rate}% close rate)
- Average ICP score: ${context.avg_icp_score}/100
- Average close likelihood: ${context.avg_close_likelihood}/100
- Total revenue: $${context.total_revenue.toLocaleString()}
- Cash collected: $${context.total_cash_collected.toLocaleString()}

TOP OBJECTIONS ACROSS ALL CALLS:
${context.top_objections.map((o, i) => `${i + 1}. ${o}`).join('\n')}

TOP PAIN POINTS:
${context.top_pain_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

RECENT CALLS:
${context.recent_calls.map(c => `
- ${c.lead_name} (${c.call_date}) — ${c.outcome.toUpperCase()}, ICP: ${c.icp_score}, Close %: ${c.close_likelihood}
  Closer: ${c.closer}
  Summary: ${c.call_summary}
  Blockers: ${c.blockers?.join(', ') || 'none'}
  Would have closed: ${c.what_would_have_closed || 'n/a'}
`).join('')}

ICP CRITERIA:
${JSON.stringify(context.icp_criteria, null, 2)}

Be specific, actionable, and direct. Reference actual call data when relevant. Give coaching advice like a high-level sales consultant would.`,
    messages: [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
