import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { SOPS } from '@/lib/sops-os-data';
import { getAuthUser } from '@/lib/auth';
import { getClientContextText, setOfferUpload, buildClientContext } from '@/lib/ai/client-context';
import { reelTranscribeConfigured, transcribeInstagramReel } from '@/lib/transcribe';

const CLIENT_CONTEXT_OVERRIDE = (ctx: string) => `\n\n---\nCREATOR CONTEXT — IMPORTANT: You are reviewing content for THIS specific creator, not SooWei. Score "ICP Resonance" against THEIR ideal client and "Brand Alignment" against THEIR brand/offer below — do NOT penalise content for not matching SooWei's ICP. If their context shows established authority, audience, or results, factor that credibility in. Their context:\n${ctx}`;

// SooWei's actual voice — every human-readable text field the bot returns must
// sound like this, not like an essay. Keeps "master_mechanics", "why", verdicts,
// notes etc. plain, punchy and actionable instead of clever/academic.
const SOOWEI_VOICE = `
SOOWEI'S VOICE — write EVERY human-readable text field (especially "master_mechanics", "label", "why", "restructure", "what_works", "what_to_fix", score notes, verdicts) the way SooWei actually talks on a group call. Non-negotiable:
- Direct and punchy. Short sentences. Say it plainly.
- Casual, like talking 1-1 to a mentee — contractions and rhetorical questions are fine. Never address the reader as "bro", "man", or "dude".
- NO academic phrasing, NO jargon, NO clever dualisms like "credible vulnerability, not arrogance". If SooWei wouldn't say it out loud, don't write it.
- Confident but grounded — back a claim with the mechanic or the result, not fancy words.
- Plain enough someone reads it once and goes and DOES it. Actionable beats impressive.
Bad (too clever): "Audacious claim + admitted uncertainty = credible vulnerability, not arrogance."
Good (SooWei): "He makes a bold claim then admits he's not 100% sure — that's exactly why you trust him instead of thinking he's chatting shit."
`.trim();

// Turn the optional manual stats into a prompt block. All fields optional —
// include only what the user gave us. Returns '' when nothing was provided.
function formatStats(stats?: Record<string, unknown>): string {
  if (!stats || typeof stats !== 'object') return '';
  const order: [string, string][] = [
    ['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'],
  ];
  const rows = order
    .map(([key, label]) => [label, stats[key]] as const)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  if (!rows.length) return '';
  return 'ACTUAL PERFORMANCE DATA (real results this content got — weight this HEAVILY, it beats any prediction):\n'
    + rows.map(([label, v]) => `- ${label}: ${v}`).join('\n');
}

export const maxDuration = 300; // Vercel Pro allows up to 300s

export type TaskType = 'analyze-reel' | 'analyze-yt' | 'review-script' | 'generate-ideas' | 'sales-intel';

// ─── YouTube transcript (TranscriptAPI) ──────────────────────────────────────

async function getYouTubeTranscript(url: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${encodeURIComponent(url)}&format=json&include_timestamp=false`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(45000) },
  );
  if (!res.ok) throw new Error(`YouTube transcript unavailable — the video may have captions disabled or be private.`);
  const data = await res.json() as { transcript?: { text: string }[] };
  if (!data.transcript?.length) throw new Error(`No transcript found for this YouTube video. Try pasting the script directly.`);
  return data.transcript.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
}

// ─── Social transcript (Supadata — Instagram, TikTok) ────────────────────────

// Supadata returns content either as a plain string (text=true) or an array of
// segments. Normalise both into one trimmed string.
function normalizeSupadataContent(content: unknown): string {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim();
  if (Array.isArray(content)) {
    return content
      .map((s) => (s && typeof s === 'object' && 'text' in s ? String((s as { text: string }).text) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

// Supadata's transcript endpoint is part-synchronous, part-async: short clips
// come back on the first call (HTTP 200), but anything it has to AI-transcribe
// (most Reels — Instagram serves no captions) returns HTTP 202 + a jobId that
// must be polled at /v1/transcript/{jobId}. The previous version only handled
// the 200 path, so every async reel failed with "No transcript found". We now
// poll the job to completion, which is also what keeps it quick — it returns the
// instant the job is done instead of hanging on one long request.
async function getSocialTranscript(url: string, apiKey: string, platform: string): Promise<string> {
  const unavailable = `${platform} transcript unavailable — the video may be private or unavailable. Try pasting the script directly.`;
  const empty = `No transcript found for this ${platform} video. Try pasting the script directly.`;

  // Instagram: prefer Apify (resolve the reel's media) + AssemblyAI (transcribe
  // it) — far more reliable than Supadata's IG transcription. Falls back to
  // Supadata below if it isn't configured or fails.
  if (platform === 'instagram' && reelTranscribeConfigured()) {
    try {
      return await transcribeInstagramReel(url);
    } catch (e) {
      console.error('[agent] apify+assemblyai failed, falling back to supadata:', (e as Error).message);
      // fall through to Supadata
    }
  }

  // Reels have no captions, so Supadata AI-transcribes the audio and holds the
  // connection while it does (reels are too short for its 202/job path, which is
  // for 20min+ videos). Some reels transcribe fine; others Supadata retries on
  // for ~2 min and then 500s. Keep the timeout generous so the slow-but-OK reels
  // still complete; the 500 path below handles the ones it genuinely can't do.
  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&text=true`,
    { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(150000) },
  ).catch((e) => {
    if ((e as Error).name === 'TimeoutError') {
      throw new Error(`${platform} transcription timed out — this reel is taking too long for the video service. Try again, or paste the script/caption text instead.`);
    }
    throw new Error(unavailable);
  });
  // 500 = Supadata failed to generate the transcript (their IG pipeline is
  // commonly the culprit). Tell the user plainly and point them to the paste path.
  if (res.status >= 500) {
    throw new Error(`${platform} transcription is temporarily unavailable (the video service is failing to process it). Paste the script/caption text instead and I'll analyze it instantly.`);
  }
  if (!res.ok) throw new Error(unavailable);

  const data = await res.json() as { content?: unknown; jobId?: string };

  // Synchronous result.
  if (data.content !== undefined) {
    const text = normalizeSupadataContent(data.content);
    if (!text) throw new Error(empty);
    return text;
  }

  // Asynchronous job — poll until completed/failed (≈90s budget, 2.5s interval).
  if (!data.jobId) throw new Error(empty);
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(
      `https://api.supadata.ai/v1/transcript/${data.jobId}`,
      { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(20000) },
    );
    if (!poll.ok) continue; // transient — keep polling until the deadline
    const job = await poll.json() as { status?: string; content?: unknown; error?: string };
    if (job.status === 'completed') {
      const text = normalizeSupadataContent(job.content);
      if (!text) throw new Error(empty);
      return text;
    }
    if (job.status === 'failed') throw new Error(unavailable);
    // 'queued' | 'active' → keep polling
  }
  throw new Error(`${platform} transcription is taking longer than usual. Try again, or paste the script directly.`);
}

// ─── Unified media transcriber ────────────────────────────────────────────────

async function transcribeMediaUrl(
  url: string,
  platform: 'youtube' | 'instagram' | 'tiktok',
  transcriptApiKey: string,
  supAdataKey: string,
): Promise<{ transcript: string; source: string }> {
  const NOT_SET = 'Auto-transcription for links isn’t enabled yet. Paste the script/caption text instead and I’ll analyze it directly.';
  if (platform === 'youtube') {
    if (!transcriptApiKey) throw new Error(NOT_SET);
    const transcript = await getYouTubeTranscript(url, transcriptApiKey);
    return { transcript, source: 'transcriptapi' };
  }
  if (!supAdataKey) throw new Error(NOT_SET);
  const transcript = await getSocialTranscript(url, supAdataKey, platform);
  return { transcript, source: 'supadata' };
}

// ─── URL Fetcher (for Fathom / web pages) ────────────────────────────────────

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s{3,}/g, '\n\n').trim().slice(0, 24000);
  } catch {
    return '';
  }
}

// ─── RAG Helpers ──────────────────────────────────────────────────────────────

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
}

function getRelevantSops(query: string, topN = 4) {
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!keywords.length) return SOPS.slice(0, topN);
  return SOPS
    .map((sop) => {
      const text = [sop.title, sop.sub, sop.div, sop.rule ?? '', ...(sop.pts ?? []), sop.script ?? ''].join(' ');
      return { sop, score: scoreText(text, keywords) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ sop }) => sop);
}

async function getRelevantTrainingDocs(query: string, topN = 2) {
  const { TRAINING_DOCS } = await import('@/lib/training-compiled');
  if (!TRAINING_DOCS.length) return [];
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!keywords.length) return TRAINING_DOCS.slice(0, topN);
  return TRAINING_DOCS
    .map((doc) => ({ doc, score: scoreText(doc.filename + ' ' + doc.content, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ doc }) => doc);
}

// ─── Conversational system prompt (short inputs / questions) ─────────────────

const SOOWEI_CHAT_SYSTEM = `
You are SooWei Goh's AI. Talk like SooWei talks on his group calls — casual, short, direct. Not like an AI.

FORMATTING RULES — non-negotiable:
- Maximum 3 sentences for most replies. If it's a simple question or short message, 1-2 sentences is enough.
- No paragraphs. No line breaks between thoughts. Just talk.
- No bullet points, no numbered lists, no headers, no markdown, no asterisks.
- Never use *asterisks* for emphasis. Never use "Here are X reasons..." Never use "Firstly/Additionally/Furthermore."
- If the input is short (one sentence, a quick thought), the response should be short too. Match the energy.

SooWei's voice: "yo", "sick", "fire", "you know what I mean", "cool cool cool", "that's the thing". Warm but cuts straight to the point. Real examples with real numbers. Never preachy. Never call the reader "bro", "man", or "dude".

How SooWei actually responds to "I will make content about just icing": "That's stage 3 right off the bat — all value, no personality. Who are you, why should I care about icing from you specifically? That's the question to answer first."

SooWei's 4-stage framework: Stage 1 Admirable (why should anyone care about you?) → Stage 2 Likable (are you a real person?) → Stage 3 Credible (proof, results) → Stage 4 Trustable (where money is made). Most people skip to stage 3. That's the problem.

SooWei runs Goh Consulting — personal branding and content for online coaches/consultants ($3K–$100K+/mo). DWY $12K/4mo → DFY $18K/6mo.

If you need one thing to give a real answer, ask one question. If you have enough, just answer short.
`.trim();

// ─── Task Prompts ─────────────────────────────────────────────────────────────

const BRAND_CONTEXT = `
SOOWEI GOH — WHO HE IS:
SooWei Goh, founder of Goh Consulting. Personal branding and content strategy for online coaches and consultants ($3K–$100K+/mo). Asian founder, 21 years old, built to $400K/mo. Offer: Brand Architect — DWY $12K/4mo → DFY $18K/6mo → backend renewals. He's built personal brands from scratch multiple times. He's studied Hormozi's team, Iman Gadzhi's head of content, paid $30K+ into mentorships — then distilled it and teaches it.

SCOPE:
- DOES: organic personal branding, short-form content (Instagram Reels, YouTube Shorts, long-form YouTube), content strategy, brand positioning, offer clarity, DM setting, sales process
- DOES NOT: paid ads, media buying — not part of Goh Consulting at all. Never mention ads.

SOOWEI'S ACTUAL 4-STAGE BRAND FRAMEWORK:
This is what everything runs through. Most people skip stages 1 and 2 — that's why they get views but no leads.

STAGE 1 — ADMIRABLE: Why would anyone care about you to begin with? What makes you different? It's not about being rich or successful — it's about having a specific stance, a specific story, something that creates an open loop. "95% of people wake up and report to a boss. You wake up whenever you want and work from a laptop. That alone is admirable to your ICP — but you're not showing it."

STAGE 2 — LIKABLE: Are you a real person or are you performing? Humor, real moments, actual personality. "If your close friends would describe you as funny and your content has zero humor — your audience feels that misalignment. They don't want to watch you because you cringe." Multi-dimensional brand: lifestyle, personality, real journey — not just expertise.

STAGE 3 — CREDIBLE: Client results, personal proof, insights nobody else has. But ONLY lands when stages 1 and 2 are working. "Most people start here and wonder why nobody cares. Nobody cared about you yet. You skipped stage 1 and 2." The best credibility content takes what's behind paywalls and puts it out free — forces people to watch because they can't find it anywhere else.

STAGE 4 — TRUSTABLE: Built over time. "Every piece of content either satisfies someone or completely fails them. There's no middle. When someone trusts you, they don't need a sales call — they DM you saying I have the money ready, send me the link."

THE #1 MISTAKE SOOWEI CALLS OUT:
"You only post value. All your content is tips, frameworks, how-tos. One-dimensional brand. You're getting views but no leads because people watch, learn, and leave — they never connect with you as a person. When you constantly think about how to get leads, your content is going to be shit. Your best content comes when you're not thinking about the outcome."

KEY PRINCIPLES:
- "When you try to relate to everyone, you connect with no one" — be specific, take a stance, don't be in the middle
- "Don't be in the middle. Lean into the extremes." — whatever makes you different, go 10x on it
- The buyer mirror: the #1 question to ask clients is what made them come to you and what was the specific content that pushed them to book. Everything in the brand builds from that answer.
- "Your unique mechanisms" — what you have that nobody else has. If views are low, the unique mechanisms aren't good enough.
- Top of funnel content ≠ conversion content. The piece that gets someone into your world is different from what makes them buy. You need both, intentionally.
- "Sales calls will die" — if your content and brand are strong enough, people arrive ready to buy. Objections on calls = brand hasn't done its job.

SOOWEI'S 6 SCORING CRITERIA (each rated 1–5) — BE STRICT:
Scores must be honest. Most content scores 2–3. A 4 means genuinely strong. A 5 is rare — reserved for content that is exceptional by any standard. Do not inflate. Harsh and accurate beats generous and useless.

1. View Potential — hook power. Does it stop a scroll? Can it realistically hit 100K+ views? If the hook is generic or weak: 1–2.
2. Pre-Selling Power — does it build desire, handle objections, or filter the ICP before a call? Pure value content with no positioning element: 1–2.
3. Proven Concept — is this a tested format or angle that has demonstrably worked before in this space?
4. ICP Resonance — CRITICAL, but judge it like SooWei would, NOT off a keyword list. His ICP is high-level operators doing $3K–$100K+/mo. Those people care about way more than "coaching tactics" — they care about time, systems, productivity, leverage, hiring, mindset, money. So a productivity or systems video CAN be dead-on ICP. Ask: would HIS specific audience, given who he is, actually value this? SooWei is established and credible — don't dock a script just because the surface topic is broad; dock it only if it's truly generic advice that speaks to no one in particular. If it clearly speaks to a high-level operator's real problems, score it high even if the topic isn't literally "coaching".
5. Intrigue & Payoff — does the hook create a compelling open loop AND does the content fully deliver on that promise?
6. Brand Alignment — fits SooWei's identity: young Asian founder, personal brand expert, $400K/mo consulting business, stage 1–4 framework, not just another marketing guru?

VOICE AND ANALYSIS RULES:
- All analysis must go through the 4-stage lens — identify which stage the content serves and whether it does it well
- Call out one-dimensional brands (pure value/tips only) directly — this is SooWei's most important teaching
- Never cite external names (Hormozi, Iman, etc.) — frame everything through SooWei's perspective
- Specificity over generality in every observation — "this hook works because it creates an open loop in 3 words" not "this is a good hook"
`.trim();

const TASK_INSTRUCTIONS: Record<TaskType, string> = {
  'analyze-reel': `
You are analyzing a piece of short-form content (reel, short, or script) to understand exactly why it works or doesn't work.

CRITICAL: Keep ALL text fields SHORT — one sentence max per field. This is non-negotiable. Max 6 highlights, max 3 replication_angles.

SCORING: Be harsh by default. Most content scores 2–3. A 4 means genuinely strong. A 5 is rare.

PERFORMANCE-WEIGHTED SCORING — read carefully:
- If ACTUAL PERFORMANCE DATA is provided, it OVERRIDES your prediction. Real results beat your guess about the hook.
- Content that demonstrably performed well (high views and/or strong engagement — likes+comments+shares+saves relative to views) CANNOT score low. Set overall_score to at least 4.0 and lift View Potential and Proven Concept to match what actually happened.
- If it clearly underperformed despite a strong-looking hook, score it honestly lower and say why in performance.summary.
- If NO performance data is given, score on predicted potential as usual and set performance.verdict to "unknown".

TRANSCRIPT HIGHLIGHTS (this replaces the old layer breakdown): break the transcript into its key moments IN ORDER. Each highlight's "quote" MUST be copied VERBATIM (exact words) from the transcript so the app can find and highlight it. For each, explain in plain SooWei language what that part does, why it's structured that way, and how to reuse it.

Return ONLY valid JSON (max 6 highlights, max 3 replication_angles):
{
  "hook": "exact opening line",
  "performance": { "summary": "one plain line on how it actually did, or 'No data provided'", "engagement_rate": "X% or 'n/a'", "verdict": "outlier | strong | average | underperformed | unknown" },
  "highlights": [
    { "quote": "verbatim span copied EXACTLY from the transcript", "label": "what this part is (e.g. Hook, Open loop, Proof, Close)", "why": "one plain sentence — why it works / why it's built this way", "restructure": "one plain sentence — how to reuse this in your own content" }
  ],
  "master_mechanics": ["mechanic 1 in plain SooWei words", "mechanic 2"],
  "underlying_pattern": "One plain sentence capturing why this worked",
  "replication_angles": [
    { "title": "Reel idea title", "hook": "Opening line" }
  ],
  "scores": { "view_potential": 0, "preselling_power": 0, "proven_concept": 0, "icp_resonance": 0, "intrigue_payoff": 0, "brand_alignment": 0 },
  "overall_score": 0.0
}
`,
  'review-script': `
You are SooWei's content quality gate. Your job is to review a script or idea before it reaches SooWei, and give an honest verdict.

Be brutally honest. Most scripts are not ready. A 3 means "real problems, rewrite needed." A 4 means genuinely strong. A 5 is exceptional and rare. Do not inflate scores to be encouraging — this is a quality gate, not a cheerleader.

JUDGE ICP LIKE SOOWEI WOULD, NOT OFF A KEYWORD LIST:
- SooWei is an established, credible founder. Don't dock a script just because the surface TOPIC isn't literally "coaching/consulting".
- His ICP — high-level operators doing $3K–$100K+/mo — genuinely care about time, systems, productivity, leverage, hiring, money, mindset. A productivity or systems script can be perfectly on-ICP. Ask: would HIS specific audience, given who he is, actually value this?
- Mark ICP Resonance low ONLY when the script is truly generic — speaks to no one in particular, any business could post it. If it clearly targets a high-level operator's real problems, score it high even if the topic is broad on the surface.
- Don't claim a script "doesn't target pain points" if it clearly does. Read what's actually there.
- If creator context is provided below, score against THAT creator's brand/ICP, not SooWei's.
Only scripts averaging 4+ should be sent to SooWei.

Return ONLY valid JSON in this exact structure:
{
  "scores": {
    "view_potential": { "score": 0, "note": "brief reason" },
    "preselling_power": { "score": 0, "note": "brief reason" },
    "proven_concept": { "score": 0, "note": "brief reason" },
    "icp_resonance": { "score": 0, "note": "brief reason" },
    "intrigue_payoff": { "score": 0, "note": "brief reason" },
    "brand_alignment": { "score": 0, "note": "brief reason" }
  },
  "overall": 0.0,
  "verdict": "send-to-soowei",
  "what_works": "What's genuinely strong about this script",
  "what_to_fix": "Specific, actionable fixes needed",
  "revised_hook": "A stronger version of the opening hook",
  "revised_close": "A stronger version of the closing line"
}

verdict must be one of: "send-to-soowei" (avg 4+), "needs-work" (avg 3–3.9), "reject" (avg below 3)
`,
  'generate-ideas': `
You are SooWei's AI ideation engine. Generate 4 content ideas rooted in his actual brand, framework, and ICP.

Every idea must speak directly to online coaches/consultants scaling $3K–$100K+/mo — not generic business advice. Apply the 4-stage lens: does this serve Admirable, Likable, Credible, or Trustable? A good batch has a mix. Score honestly — most ideas you generate should land at 3–3.5. An idea that genuinely earns a 4+ across the board is the goal, but don't inflate to get there.

Use any context provided (recent objections, topics, approved hooks from Content Brain) to guide the ideas.

Return ONLY valid JSON in this exact structure:
{
  "ideas": [
    {
      "title": "Short idea title",
      "concept": "2–3 sentences explaining the idea and angle",
      "hook": "The exact opening line to film",
      "format": "Reel / YouTube / Story / Carousel",
      "scores": {
        "view_potential": 0,
        "preselling_power": 0,
        "proven_concept": 0,
        "icp_resonance": 0,
        "intrigue_payoff": 0,
        "brand_alignment": 0
      },
      "overall": 0.0,
      "why_it_works": "The core mechanic that makes this idea strong"
    }
  ]
}
`,
  'analyze-yt': `
You are analyzing a long-form YouTube video (full video, not a Short or Reel) to extract everything strategically useful for SooWei's content operation.

Focus on structure, retention mechanics, and what can be repurposed into short-form. Be specific and tactical. Keep all text fields SHORT — one sentence max per field. This keeps the JSON compact and complete.

PERFORMANCE-WEIGHTED SCORING — read carefully:
- If ACTUAL PERFORMANCE DATA is provided, it OVERRIDES your prediction. Real results beat your guess.
- A video that demonstrably performed well (high views and/or strong engagement, especially an outlier vs a normal video) CANNOT score low. Set overall_score to at least 4.0 and lift View Potential and Proven Concept to match what actually happened.
- If it clearly underperformed, score honestly lower and say why in performance.summary.
- If NO performance data is given, score on predicted potential and set performance.verdict to "unknown".

TRANSCRIPT HIGHLIGHTS: pick the key moments of the transcript. Each highlight's "quote" MUST be copied VERBATIM from the transcript so the app can find and highlight it. Explain in plain SooWei language why each moment works and how to restructure it.

REEL CLIPS — you are a content strategist and clipping editor for a brand targeting coaches/business owners doing $30–50k/mo. Find clip-worthy moments using these 3 checks: (1) entertaining, (2) sparks emotion, (3) worth $5 (would someone pay $5 just for that insight). For each clip return: a timestamp range, an on-screen hook UNDER 10 words, a score ("3/3" if it passes all three, "2/3" if exactly two), which checks it passed, and one plain sentence on why it works or what to tweak. ONLY return clips scoring "3/3" or "2/3" — drop anything that fails. Max 4 clips.

Return ONLY valid JSON in this exact structure (max 3 structure items, max 5 highlights, max 4 reel_clips, max 3 best_moments):
{
  "title_hook": "Video title or opening line",
  "one_line_verdict": "One plain sentence: what makes this work or not work",
  "content_strategy_notes": "One plain sentence: what stage does this serve — admirable/likable/credible/trustable?",
  "performance": { "summary": "one plain line on how it actually did, or 'No data provided'", "engagement_rate": "X% or 'n/a'", "verdict": "outlier | strong | average | underperformed | unknown" },
  "structure": [
    {
      "section": "Section name",
      "timestamp_approx": "0:00–2:00",
      "what_happens": "One sentence",
      "retention_mechanic": "One sentence"
    }
  ],
  "highlights": [
    { "quote": "verbatim span copied EXACTLY from the transcript", "label": "what this moment is", "why": "one plain sentence — why it works", "restructure": "one plain sentence — how to reuse it" }
  ],
  "reel_clips": [
    {
      "hook": "on-screen first line, UNDER 10 words",
      "timestamp_range": "mm:ss–mm:ss",
      "score": "3/3 | 2/3",
      "checks_passed": ["entertaining", "sparks emotion", "worth $5"],
      "why": "one plain sentence on why it works or what to tweak"
    }
  ],
  "best_moments": [
    {
      "quote": "Exact quotable line",
      "why": "One sentence why it hits",
      "clip_potential": "high | medium | low"
    }
  ],
  "scores": {
    "view_potential": 0,
    "preselling_power": 0,
    "proven_concept": 0,
    "icp_resonance": 0,
    "intrigue_payoff": 0,
    "brand_alignment": 0
  },
  "overall_score": 0.0
}
`,
  'sales-intel': `
You are SooWei's sales intelligence system. Analyze a sales call transcript (from Fathom or pasted) and extract everything strategically useful.

The most important output is: was this a closer issue or a lead issue? And what content should be made to fix it?

Return ONLY valid JSON in this exact structure:
{
  "summary": "2–3 sentence summary of the call",
  "prospect_profile": {
    "revenue_level": "estimated monthly revenue",
    "main_problem": "their primary stated problem",
    "desired_outcome": "what they want to achieve"
  },
  "objections": [
    {
      "objection": "Exact objection or concern raised",
      "category": "price | trust | timing | comparison | other",
      "how_handled": "How the closer responded",
      "better_response": "How it should have been handled"
    }
  ],
  "verdict": "closer-issue",
  "verdict_reason": "Specific explanation of why — what the closer did or didn't do, or why the lead wasn't qualified enough",
  "close_likelihood": 0,
  "call_length_assessment": "Was the call the right length? Too long (low energy lead)? Too short (rushed)?",
  "content_angles": [
    {
      "angle": "Reel or YouTube idea that addresses this objection or pre-qualifies better",
      "format": "Reel / YouTube"
    }
  ],
  "action_items": {
    "closer_training": ["specific thing to train or fix"],
    "content_to_film": ["specific reel or video to make"],
    "process_changes": ["booking flow, follow-up, or pre-call asset changes"]
  }
}

verdict must be one of: "closer-issue" | "lead-issue" | "mixed"
close_likelihood is 1–10
`,
};

// ─── API Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { task, input, url, context, visuals, stats, saveContext } = (await req.json()) as {
      task: TaskType;
      input?: string;
      url?: string;
      context?: string;
      visuals?: string; // optional visual description for reel analysis
      stats?: Record<string, unknown>; // manual performance numbers (views/likes/comments/shares/saves)
      saveContext?: string; // client's pasted business context to persist before reviewing
    };

    if (!task) return NextResponse.json({ error: 'No task specified' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY_2 || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    // Per-client context so reviews are scored against the creator's own ICP/offer.
    const auth = await getAuthUser();
    const isAdmin = auth?.role === 'admin';

    // The client can paste their business/ICP context to personalise reviews — save
    // it (as their offer text) so it persists and is used on every future review.
    if (auth && typeof saveContext === 'string' && saveContext.trim()) {
      await setOfferUpload(auth.email, saveContext.trim());
      await buildClientContext(auth.email, true).catch(() => {});
    }

    let clientCtx = auth ? await getClientContextText(auth.email) : '';

    // Script review needs to be scored against the creator's OWN brand/ICP. If a
    // (non-admin) client hasn't given us any context yet, don't silently grade them
    // against SooWei's ICP — ask for context first, then they re-send.
    if (task === 'review-script' && auth && !isAdmin && !clientCtx.trim()) {
      return NextResponse.json({
        task,
        result: {
          _needs_context: true,
          _message: "Before I review this I need to know who it's for — otherwise I'd just be scoring it against SooWei's brand, not yours.\n\nReply with a quick rundown of your business:\n• Your offer (what you sell + price point)\n• Your ICP (who you're talking to)\n• Your positioning / what makes you different\n• Any proof or results you've got\n\nPaste that and I'll save it, then score every script against YOUR brand from now on.",
        },
      });
    }

    const transcriptApiKey = process.env.TRANSCRIPTAPI_KEY ?? '';
    const supAdataKey = process.env.SUPADATA_API_KEY ?? '';
    const trimmedUrl = url?.trim() ?? '';

    // ── URL handling with transcription ──────────────────────────────────────
    let urlContent = '';
    let transcriptionSource: string | null = null;
    // The clean transcript (no prefixes) — echoed back to the client so the UI can
    // render it with clickable highlights for analyze-reel / analyze-yt.
    let cleanTranscript = '';

    if (trimmedUrl) {
      const isYouTube = /youtube\.com|youtu\.be/.test(trimmedUrl);
      const isInstagram = /instagram\.com/.test(trimmedUrl);
      const isTikTok = /tiktok\.com/.test(trimmedUrl);
      const isMedia = isYouTube || isInstagram || isTikTok;

      if (isMedia) {
        const platform: 'youtube' | 'instagram' | 'tiktok' =
          isYouTube ? 'youtube' : isInstagram ? 'instagram' : 'tiktok';
        try {
          const { transcript: rawTranscript, source } = await transcribeMediaUrl(trimmedUrl, platform, transcriptApiKey, supAdataKey);
          // Netlify hard limit is 30s — analyze-yt capped tighter to cut generation time
          const transcriptLimit = task === 'analyze-yt' ? 5000 : 8000;
          const transcript = rawTranscript.slice(0, transcriptLimit);
          cleanTranscript = transcript;
          urlContent = `[AUTO-TRANSCRIBED FROM ${platform.toUpperCase()}]\n${transcript}`;
          transcriptionSource = source;
        } catch (e) {
          const msg = (e as Error).message;
          // Diagnostic for Vercel logs: which platform, whether the key was present
          // (boolean only — never logs the key), and the failure reason. A
          // timeout with keyPresent=false ⇒ the env var isn't reaching this deploy.
          console.error('[agent] transcription failed', {
            platform,
            transcriptApiKeyPresent: !!transcriptApiKey,
            supadataKeyPresent: !!supAdataKey,
            reason: msg,
          });
          return NextResponse.json({
            task,
            result: { _blocked: true, _message: msg },
          });
        }
      } else {
        // General URL fetch (Fathom, web pages, etc.)
        urlContent = await fetchUrlContent(trimmedUrl);
      }
    }

    // Combine input sources
    const parts = [input?.trim(), urlContent].filter(Boolean);
    if (visuals?.trim()) parts.push(`\nVISUAL CONTEXT: ${visuals.trim()}`);
    if (transcriptionSource) parts.push(`\n[Source: ${transcriptionSource}]`);
    const rawContent = parts.join('\n\n');

    // If the script/transcript was pasted (no media URL), that paste IS the
    // transcript we echo back for highlight rendering.
    if (!cleanTranscript && input?.trim()) cleanTranscript = input.trim();

    // Manual performance numbers, formatted for the prompt (empty if none given).
    const statsBlock = formatStats(stats);

    // ── Conversational fallback ───────────────────────────────────────────────
    // If content is too short to be a real script/transcript/idea, respond as
    // SooWei's AI rather than trying to "analyze" a 4-word message.
    const isAnalyzable =
      task === 'generate-ideas' ||
      rawContent.trim().length > 150;

    const client = new Anthropic({ apiKey });

    if (!isAnalyzable) {
      const ragQuery = `${rawContent.slice(0, 300)} ${context ?? ''}`;
      const relSops = getRelevantSops(ragQuery, 3);
      const relDocs = await getRelevantTrainingDocs(ragQuery, 1);
      const extraCtx = [
        relSops.length ? 'RELEVANT SOPs:\n' + relSops.map((s) => `${s.title}: ${s.sub}`).join('\n') : '',
        relDocs.length ? 'TRAINING CONTEXT:\n' + relDocs[0].content.slice(0, 800) : '',
      ].filter(Boolean).join('\n\n');

      const chatResponse = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: [SOOWEI_CHAT_SYSTEM, extraCtx ? '\n\n---\n' + extraCtx : '', clientCtx ? CLIENT_CONTEXT_OVERRIDE(clientCtx) : ''].join(''),
        messages: [{ role: 'user', content: rawContent || 'Hey' }],
      });
      const message = chatResponse.content[0].type === 'text' ? chatResponse.content[0].text : '';
      return NextResponse.json({ task: 'chat', result: { message } });
    }

    // RAG: pull relevant context
    // Analyze tasks skip SOPs + training docs — the media content itself is the input,
    // and reducing context cuts system prompt size to save tokens on cold-start heavy Netlify.
    const isAnalyzeTask = task === 'analyze-reel' || task === 'analyze-yt';
    const ragQuery = `${task} ${rawContent.slice(0, 500)} ${context ?? ''}`;
    const relevantSops = isAnalyzeTask ? [] : getRelevantSops(ragQuery);
    const relevantDocs = isAnalyzeTask ? [] : await getRelevantTrainingDocs(ragQuery);

    const sopContext = relevantSops.length
      ? relevantSops.map((s) => [
          `SOP ${s.badge} — ${s.title} [${s.div}]`,
          s.sub,
          s.rule ? `Rule: ${s.rule}` : '',
          ...(s.pts ?? []).slice(0, 2).map((p) => `• ${p}`),
        ].filter(Boolean).join('\n')).join('\n\n---\n\n')
      : '';

    const docContext = relevantDocs.length
      ? relevantDocs.map((d) => d.content.slice(0, 1500)).join('\n\n---\n\n')
      : '';

    const systemPrompt = [
      BRAND_CONTEXT,
      '\n\n---\n' + SOOWEI_VOICE,
      '\n\n---\nYOUR TASK:\n' + TASK_INSTRUCTIONS[task],
      sopContext ? '\n\n---\nRELEVANT SOPs:\n' + sopContext : '',
      docContext ? '\n\n---\nRELEVANT TRAINING DATA:\n' + docContext : '',
      clientCtx ? CLIENT_CONTEXT_OVERRIDE(clientCtx) : '',
    ].filter(Boolean).join('');

    const userMessage = [
      rawContent ? `CONTENT TO ANALYZE:\n${rawContent}` : 'Generate ideas based on the brand context.',
      statsBlock ? `\n${statsBlock}` : '',
      context ? `\nADDITIONAL CONTEXT: ${context}` : '',
    ].filter(Boolean).join('\n');

    // Haiku 4.5 is markedly faster than Sonnet for this structured JSON
    // extraction and was the model the analyzer used before — keeps reel/script
    // analysis quick. (Bump to 'claude-sonnet-4-6' if you want deeper analysis.)
    // Reel/YT bumped to fit the transcript highlights + clipping output.
    const model = 'claude-haiku-4-5-20251001';
    const maxTokens = task === 'analyze-yt' ? 4200 : task === 'analyze-reel' ? 2400 : 2048;

    // Instruct JSON-only and rely on the defensive parser below to extract the
    // object.
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt + '\n\nReturn ONLY the JSON object described above — no prose before or after it, no markdown code fences.',
      messages: [
        { role: 'user', content: userMessage },
      ],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const raw = rawText;

    let parsed: unknown;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const jsonStr = start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim();

      function tryParse(s: string): unknown {
        // Pass 1: strip control chars + literal newlines/tabs
        let c = s
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .replace(/\r\n/g, ' ').replace(/\r/g, ' ')
          .replace(/\n/g, ' ').replace(/\t/g, ' ');
        // Pass 2: fix lone backslashes not forming valid JSON escape sequences
        c = c.replace(/\\([^"\\/bfnrtu0-9])/g, '\\\\$1');
        // Pass 3: strip any accidental markdown fences
        c = c.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
        return JSON.parse(c);
      }

      try {
        parsed = tryParse(jsonStr);
      } catch (e1) {
        // Last resort: extract only the outer JSON object boundaries again and retry
        const m = jsonStr.match(/\{[\s\S]*\}/);
        if (m) {
          parsed = tryParse(m[0]);
        } else {
          throw e1;
        }
      }
    } catch (parseErr) {
      console.error('[agent] JSON parse failed:', (parseErr as Error).message, '| raw start:', raw.slice(0, 200));
      return NextResponse.json({ task, result: { _blocked: true, _message: 'Could not parse the analysis — please try again.' } });
    }

    // Echo the transcript back on analyze tasks so the UI can render it with the
    // model's verbatim highlights as clickable spans.
    if (isAnalyzeTask && cleanTranscript && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      (parsed as Record<string, unknown>).transcript = cleanTranscript;
    }

    return NextResponse.json({ task, result: parsed });
  } catch (err) {
    console.error('Agent error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
