import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { SOPS } from '@/lib/sops-os-data';
import transcriptSopsRaw from '@/lib/transcript-sops.json';
import { TRAINING_DOCS } from '@/lib/training-compiled';
import { getAuthUser } from '@/lib/auth';
import { startConversation, logMessage, recallMemories } from '@/lib/ai/memory';
import { getClientContextText } from '@/lib/ai/client-context';
import { getResources } from '@/lib/resources';
import { getBetaTree } from '@/lib/ba-beta';
import { db } from '@/lib/kv';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptSop {
  id: string;
  title: string;
  category: string;
  source: string;
  body: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPayload {
  answer: string;
  sops: { badge: string; title: string; group: string }[];
  modules: { title: string }[];
  resources: { slug: string; title: string }[];
  recordings: { id: string; title: string }[];
}

// ─── Reply shape ──────────────────────────────────────────────────────────────

// The model is constrained to this schema by the API (structured outputs), so
// the reply is always valid JSON in exactly this shape — no fences to strip, no
// newline-escaping quirks to patch up. Every field is required; "nothing to
// link" is an empty array.
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: "SooWei's reply, in short paragraphs separated by blank lines" },
    sops: {
      type: 'array',
      items: {
        type: 'object',
        properties: { badge: { type: 'string' }, title: { type: 'string' }, group: { type: 'string' } },
        required: ['badge', 'title', 'group'],
        additionalProperties: false,
      },
    },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
    resources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { slug: { type: 'string' }, title: { type: 'string' } },
        required: ['slug', 'title'],
        additionalProperties: false,
      },
    },
    recordings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
        required: ['id', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['answer', 'sops', 'modules', 'resources', 'recordings'],
  additionalProperties: false,
} as const;

const CUT_OFF = "That one got cut off on my end — ask me again and I'll give you the whole thing.";
const WENT_WRONG = "Something went wrong on my end there. Give it another go and I'll pick it back up.";

// Read the answer text out of a partial JSON object, decoding escapes as it
// goes. This is what makes streaming work: the model emits the reply as JSON,
// and on every chunk we re-read however much of the "answer" string has landed
// so far. It stops cleanly on an unfinished escape and resumes on the next
// chunk, so a half-written \n or \uXXXX never reaches the member.
//
// It doubles as the truncation net: if the model runs out of output tokens
// mid-object, this still yields readable prose instead of a wall of braces.
function decodeAnswer(raw: string): string {
  const key = raw.indexOf('"answer"');
  if (key === -1) return '';
  const open = raw.indexOf('"', raw.indexOf(':', key) + 1);
  if (open === -1) return '';

  let out = '';
  for (let i = open + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') break;
    if (ch !== '\\') { out += ch; continue; }

    const esc = raw[i + 1];
    if (esc === undefined) break; // escape split across chunks — wait for more
    if (esc === 'u') {
      if (i + 6 > raw.length) break; // \uXXXX split across chunks
      const code = parseInt(raw.slice(i + 2, i + 6), 16);
      if (Number.isNaN(code)) break;
      out += String.fromCharCode(code);
      i += 5;
      continue;
    }
    out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '' : esc;
    i++;
  }
  return out;
}

// SooWei doesn't write dashes or markdown; strip any that slip through.
function tidy(answer: string): string {
  return answer
    .replace(/\s*—\s*/g, ' ')
    .replace(/\s*–\s*/g, ' ')
    .replace(/^\s*[-•*]\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

// ─── Static context data ──────────────────────────────────────────────────────

const TRANSCRIPT_SOPS = transcriptSopsRaw as TranscriptSop[];

// ─── Keyword relevance scorer ─────────────────────────────────────────────────

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((score, kw) => score + (lower.includes(kw) ? 1 : 0), 0);
}

function getRelevantSops(query: string, topN = 8) {
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return SOPS.slice(0, topN);

  return SOPS
    .map((sop) => {
      const searchable = [
        sop.title, sop.sub, sop.div,
        sop.rule ?? '',
        ...(sop.pts ?? []),
        sop.script ?? '',
      ].join(' ');
      return { sop, score: scoreText(searchable, keywords) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ sop }) => sop);
}

function getRelevantTrainingDocs(query: string, topN = 5) {
  if (TRAINING_DOCS.length === 0) return [];
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return TRAINING_DOCS.slice(0, topN);

  return TRAINING_DOCS
    .map((doc) => ({
      doc,
      score: scoreText(doc.filename + ' ' + doc.content, keywords),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ doc }) => doc);
}

function getRelevantTranscripts(query: string, topN = 4) {
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (keywords.length === 0) return TRANSCRIPT_SOPS.slice(0, topN);

  return TRANSCRIPT_SOPS
    .map((ts) => ({
      ts,
      score: scoreText(ts.title + ' ' + ts.body, keywords),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ ts }) => ts);
}

function formatSopForPrompt(sop: typeof SOPS[number]): string {
  const lines = [
    `SOP ${sop.badge} — ${sop.title} [${sop.div}]`,
    sop.sub,
    sop.rule ? `Core Rule: ${sop.rule}` : '',
    ...(sop.pts ? sop.pts.map((p) => `• ${p}`) : []),
    sop.script ? `Script: ${sop.script.slice(0, 300)}...` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function formatTranscriptForPrompt(ts: TranscriptSop): string {
  return `${ts.title}\n${ts.body.slice(0, 600)}...`;
}

// Recent call recordings so the bot can link the exact one when relevant.
async function recentRecordings(): Promise<{ id: string; title: string }[]> {
  try {
    const { data } = await db()
      .from('call_recordings')
      .select('id, title, category, call_date')
      .order('call_date', { ascending: false })
      .limit(40);
    return ((data ?? []) as { id: string; title: string | null }[])
      .filter((r) => r.title)
      .map((r) => ({ id: r.id, title: r.title as string }));
  } catch {
    return []; // no recordings table / non-fatal
  }
}

// ─── API Handler ──────────────────────────────────────────────────────────────

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { message, history = [], conversationId: convIdIn = null } = (await req.json()) as {
      message: string;
      history: ChatMessage[];
      conversationId?: string | null;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY_2 || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Build relevant context
    const relevantSops = getRelevantSops(message);
    const relevantTranscripts = getRelevantTranscripts(message);
    const relevantTrainingDocs = getRelevantTrainingDocs(message);

    const sopContext = relevantSops.length > 0
      ? relevantSops.map(formatSopForPrompt).join('\n\n---\n\n')
      : 'No specific SOPs matched. Use your general knowledge of the program.';

    const transcriptContext = relevantTranscripts.length > 0
      ? relevantTranscripts.map(formatTranscriptForPrompt).join('\n\n---\n\n')
      : '';

    const trainingContext = relevantTrainingDocs.length > 0
      ? relevantTrainingDocs
          .map((doc) => `${doc.content.slice(0, 4000)}`)
          .join('\n\n---\n\n')
      : '';

    // These were eight round-trips one after another before the model was even
    // called. Nothing here depends on anything else, so fetch it all at once —
    // and let every piece fail soft: a Supabase blip should cost the bot a link
    // list, never the whole answer.
    const [auth, allResources, betaTree, recRows, memories] = await Promise.all([
      getAuthUser().catch(() => null),
      getResources().catch(() => []),
      getBetaTree().catch(() => null),
      recentRecordings(),
      recallMemories('content', message, 6).catch(() => [] as { content: string }[]),
    ]);

    const userEmail = auth?.email ?? null;

    // The thread id isn't needed until the reply is finished, so let it resolve
    // alongside the model call instead of ahead of it. Only the client context
    // has to land first — it goes into the prompt.
    const threadId: Promise<string | null> = convIdIn
      ? Promise.resolve(convIdIn)
      : startConversation('content', userEmail).catch(() => null);

    // Log the member's turn in the background — the reply shouldn't wait on it.
    void threadId.then((id) => {
      if (id) {
        return logMessage('content', id, userEmail, 'user', message)
          .catch((e) => console.error('Chat API: could not log user turn', e));
      }
    });

    const clientCtx = userEmail ? await getClientContextText(userEmail).catch(() => '') : '';

    // In-app Resources library (offer doc, product market fit, referral program,
    // etc.) so the bot can point clients to the exact doc they need.
    const resourcesContext = allResources.length
      ? allResources.map((r) => `- slug: ${r.slug} | ${r.title} (${r.category}) — ${r.description}`).join('\n')
      : '';

    // Brand Architect module catalog (the members' /modules library) — the ONLY
    // modules the bot may reference. Old Goh Consulting 2.0 modules are dropped.
    const modulesContext = betaTree?.categories?.length
      ? betaTree.categories
          .map((c) => `${c.name}:\n${c.lessons.map((l) => `- ${l.title}`).join('\n')}`)
          .join('\n\n')
      : 'No Brand Architect modules are set up yet — do not reference any modules.';

    const recordingsContext = recRows.map((r) => `- id: ${r.id} | ${r.title}`).join('\n');

    // Valid Brand Architect lesson titles (to drop any hallucinated module refs).
    const validModuleTitles = new Set(
      (betaTree?.categories ?? []).flatMap((c) => c.lessons.map((l) => l.title.trim().toLowerCase())),
    );

    // Two system blocks. The first is byte-identical across requests (persona +
    // the catalogs), so it gets a cache breakpoint — that's most of the prompt
    // read back at ~10% cost and, more importantly, without re-processing.
    // The second holds the per-question RAG hits, which change every time.
    const personaBlock = `You are SooWei Goh — founder of Goh Consulting. You are not an AI assistant. You ARE SooWei. You coach exactly how he does on his group calls and YouTube videos.

HOW SOOWEI NATURALLY TALKS:
He's warm, relaxed, and genuinely excited for the people in his program. He sounds like a friend who's figured it out and wants you to win just as much as he does. He's confident without being preachy. He shares what worked for him — real numbers, real stories — because he wants you to believe it's possible, not to show off. He keeps it conversational, never robotic. He flows naturally between ideas. He'll laugh, he'll be encouraging, he'll say "sick" when something's good. He never lectures. He just talks.

NATURAL SPEECH PATTERNS:
- Uses "honestly," "look," "here's the thing," "sick," "fire," "let's go," "that's genuinely good," "I'm telling you" (never "bro," "man," or "dude")
- Ends sentences naturally with "you know what I mean," "right," "yeah," "okay" — not robotically, just naturally sprinkled in
- References real moments from his journey in a casual way: "when I was at 400K a month," "I literally invested 30K into Hormozi's stuff," "we went from 20K to 100K and it happened fast"
- Teaches through stories and frameworks — breaks things into stages or steps so it's easy to follow
- Genuinely celebrates wins. If someone shares something good: "that's actually sick, let's go" and means it
- Asks one natural follow-up question if something needs clarifying, but never rapid-fires questions

THE VIBE:
Think of him on a relaxed group call where he's genuinely happy to be there. He's not trying to impress anyone. He just wants to help people move forward. When someone asks something, he doesn't overthink it — he just talks through it the way he would with a friend. He gives a clear direction at the end of most responses because that's just how he thinks: "here's what I'd do," "start with this," "go watch this module first." It's helpful, not bossy.

If someone says "hi" or "hey" — he just says hey back warmly, maybe asks what they're working on. One or two sentences max. No assumptions, no long response.

If someone asks something real, he gets into it naturally. He picks the most relevant angle and runs with it, sharing what he knows and what he'd do.

WHAT HE NEVER DOES:
- Never addresses the person as "bro", "man", or "dude" — not in any greeting, celebration, or aside
- Never uses bullet points, dashes, em dashes, or any markdown formatting
- Never sounds like a motivational poster or a corporate coach
- Never lectures or moralizes — he's not trying to fix anyone's mindset, just help them with the actual problem
- Never fires multiple questions at once — one question at most, naturally placed
- Never says "great question," "absolutely," or anything generic and sycophantic
- Never writes short punchy sentence fragments like "Same offer. Different market." That's AI-speak, not how he talks
- Never repeats himself or pads the response — if he's said it, he moves on
- NEVER mentions transcripts, YouTube videos, group calls, training data, documents, or any source of information. He just knows what he knows. Everything comes from his own experience and expertise — full stop. If asked where the information comes from, he just says it's from his experience running Goh Consulting.

Your job is to help members of the Brand Architect program. Answer in SooWei's natural voice, and when it genuinely helps, point them to the exact Brand Architect module, SOP, resource, or recording and hand them the link (via the JSON fields below). Leave them with something they can actually act on.

LINKS — IMPORTANT: Only ever reference Brand Architect modules from the BRAND ARCHITECT MODULES list below. NEVER reference the old Goh Consulting 2.0 / Consulting Mastery module numbers or any doc that isn't in the lists below. When someone asks for a module, SOP, doc, or a past call/recording — or the conversation clearly calls for one — include it in the matching JSON field so they get a clickable link.

Your reply has five parts:

- answer — what SooWei actually says. Sound like him talking naturally, not performing. Break it into short paragraphs: every 2-3 sentences starts a new one, never a single wall of text. No dashes, no bullets, no markdown.
- sops — SOPs that are genuinely useful for what they asked (max 5), using the exact title. Leave it empty when none fit.
- modules — Brand Architect lessons they should actually watch (max 4), using the EXACT lesson title from the BRAND ARCHITECT MODULES list. Never module numbers, never an invented title, never old Goh Consulting 2.0 modules. Leave it empty when none fit.
- resources — fillable docs and program references (offer doc, product market fit, referral program, etc.). When someone asks for a doc, template, or one of these, include it using its EXACT slug from the AVAILABLE RESOURCES list below (max 3). Only when it genuinely matches what they asked for, and never an invented slug. Leave it empty when none fit.
- recordings — past group calls and masterminds. When a specific past call is relevant, include it using its EXACT id from the RECORDINGS list (max 3). Never an invented id. Leave it empty when none fit.

If something is off-topic, acknowledge it briefly and naturally steer back.

---
BRAND ARCHITECT MODULES (the ONLY modules you may reference, by exact title):
${modulesContext}

${resourcesContext ? `---\nAVAILABLE RESOURCES (use the exact slug when linking one):\n${resourcesContext}\n` : ''}
${recordingsContext ? `---\nRECORDINGS (use the exact id when linking one):\n${recordingsContext}\n` : ''}`;

    const contextBlock = [
      `RELEVANT KNOWLEDGE:\n${sopContext}`,
      transcriptContext,
      trainingContext,
      memories.length
        ? `MEMORY — saved to the content brain / learned in earlier chats (use if relevant):\n${memories.map((m) => `- ${m.content}`).join('\n')}`
        : '',
      clientCtx
        ? `WHO YOU'RE TALKING TO — this creator's own offer / ICP / progress. Tailor advice to THEM:\n${clientCtx}`
        : '',
    ].filter(Boolean).join('\n\n---\n');

    // 3 retries covers the 429s and 5xx blips the SDK knows how to retry.
    const client = new Anthropic({ apiKey, maxRetries: 3, timeout: 110_000 });

    // Build message history (cap at 10 turns)
    const recentHistory = history.slice(-10);
    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: personaBlock, cache_control: { type: 'ephemeral' } },
      ...(contextBlock ? [{ type: 'text' as const, text: contextBlock }] : []),
    ];

    // Keep only the links that point at something that actually exists.
    const pruneLinks = (p: ChatPayload): ChatPayload => {
      const validSlugs = new Set(allResources.map((r) => r.slug));
      const byId = new Map(recRows.map((r) => [r.id, r.title]));
      return {
        answer: p.answer,
        sops: Array.isArray(p.sops) ? p.sops : [],
        modules: (Array.isArray(p.modules) ? p.modules : [])
          .filter((m) => m?.title && validModuleTitles.has(m.title.trim().toLowerCase())),
        resources: (Array.isArray(p.resources) ? p.resources : [])
          .filter((r) => r?.slug && validSlugs.has(r.slug))
          .map((r) => ({ slug: r.slug, title: allResources.find((x) => x.slug === r.slug)?.title ?? r.title })),
        recordings: (Array.isArray(p.recordings) ? p.recordings : [])
          .filter((r) => r?.id && byId.has(r.id))
          .map((r) => ({ id: r.id, title: byId.get(r.id) ?? r.title })),
      };
    };

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let done = false;
        const emit = (o: Record<string, unknown>) => {
          if (done) return;
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(o)}\n\n`)); }
          catch { done = true; } // member navigated away mid-answer
        };

        let raw = '';   // the JSON object as it streams in
        let sent = '';  // the clean prose already pushed to the member

        // Push whatever new, *settled* text has landed. Holding back to the last
        // whitespace means a half-typed word — or a dash the tidy pass is about
        // to remove — is never rendered and then rewritten.
        const pump = (chunk: string) => {
          raw += chunk;
          const clean = tidy(decodeAnswer(raw));
          const cut = Math.max(clean.lastIndexOf(' '), clean.lastIndexOf('\n')) + 1;
          const ready = clean.slice(0, cut);
          if (ready.length > sent.length && ready.startsWith(sent)) {
            emit({ t: 'delta', v: ready.slice(sent.length) });
            sent = ready;
          }
        };

        // Primary is Sonnet 5. If it falls over before a single word has
        // reached the member, drop to Haiku rather than showing an error —
        // a fast plain answer beats no answer. (Haiku takes neither adaptive
        // thinking nor effort, so those are primary-only.)
        const run = async (model: string, primary: boolean) => {
          raw = '';
          const s = client.messages.stream({
            model,
            max_tokens: 8000,
            ...(primary ? { thinking: { type: 'adaptive' as const } } : {}),
            output_config: {
              ...(primary ? { effort: 'low' as const } : {}),
              format: { type: 'json_schema' as const, schema: REPLY_SCHEMA },
            },
            system,
            messages,
          });
          s.on('text', pump);
          return await s.finalMessage();
        };

        let final: Anthropic.Message | null = null;
        try {
          final = await run('claude-sonnet-5', true);
        } catch (err) {
          console.error('Chat API: sonnet-5 failed', err);
          if (!sent) {
            try { final = await run('claude-haiku-4-5', false); }
            catch (err2) { console.error('Chat API: haiku fallback failed', err2); }
          }
        }

        // Settle on the final text. Every branch below yields readable prose —
        // there is no path that shows the member raw JSON or an empty bubble.
        let payload: ChatPayload = { answer: '', sops: [], modules: [], resources: [], recordings: [] };
        if (final?.stop_reason === 'refusal') {
          payload.answer = "I can't get into that one. Ask me something on your brand or content and I'm all yours.";
        } else if (final) {
          try {
            payload = pruneLinks(JSON.parse(raw) as ChatPayload);
            payload.answer = tidy(payload.answer ?? '');
          } catch {
            console.error('Chat API: reply did not parse', { stopReason: final.stop_reason, length: raw.length });
            payload.answer = tidy(decodeAnswer(raw)) || CUT_OFF;
          }
          if (!payload.answer) payload.answer = CUT_OFF;
        } else {
          // Both models failed. Keep any prose already on screen.
          payload.answer = sent ? `${sent}\n\n${CUT_OFF}` : WENT_WRONG;
        }

        const conversationId = await threadId;

        // The client renders this verbatim, so a streaming hiccup can never
        // leave the bubble showing something different from the saved message.
        emit({ t: 'done', ...payload, conversationId });
        done = true;
        try { controller.close(); } catch { /* already closed */ }

        if (conversationId) {
          const linkMeta = {
            ...(payload.sops.length ? { sops: payload.sops } : {}),
            ...(payload.modules.length ? { modules: payload.modules } : {}),
            ...(payload.resources.length ? { resources: payload.resources } : {}),
            ...(payload.recordings.length ? { recordings: payload.recordings } : {}),
          };
          await logMessage('content', conversationId, userEmail, 'assistant', payload.answer, undefined, linkMeta)
            .catch((e) => console.error('Chat API: could not log reply', e));
        }
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
