import Anthropic from '@anthropic-ai/sdk';
import type { AgentTool } from '@/lib/ai/tools';
import { type BotId, startConversation, logMessage, saveMemory, recallMemories } from '@/lib/ai/memory';

// Backstop on a single tool result's size. High enough to carry a FULL sales-call
// transcript (an 80+ min call is ~60–70k chars; this leaves ample headroom) into
// the model — Opus 4.8's 1M-token context easily absorbs it. Only guards against a
// pathological payload, not real transcripts.
const MAX_TOOL_RESULT_CHARS = 800_000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResult {
  reply: string;
  conversationId: string | null;
}

// A minimal manual tool-use loop with per-bot persistence: recall what the bot
// has learned, let it answer using its tools, log the exchange, and let it save
// new insights via a save_memory tool. The bot can only read what its `tools`
// expose — that's the data-access boundary.
export async function runAgent(opts: {
  bot: BotId;
  system: string;
  tools: AgentTool[];
  history: ChatMessage[];
  message: string;
  userEmail?: string | null;
  conversationId?: string | null;
  maxSteps?: number;
}): Promise<AgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) throw new Error('API key not configured');

  const client = new Anthropic({ apiKey });

  // Resolve/extend the conversation thread and log the user's message.
  const conversationId = opts.conversationId || (await startConversation(opts.bot, opts.userEmail ?? null));
  await logMessage(opts.bot, conversationId, opts.userEmail ?? null, 'user', opts.message);

  // Recall prior learnings and inject them into the system prompt.
  const memories = await recallMemories(opts.bot, opts.message, 6);
  const system = memories.length
    ? `${opts.system}\n\n# Memory — things you've learned in earlier conversations (use if relevant, ignore if not):\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : opts.system;

  // Give the bot a tool to persist durable insights.
  const saveMemoryTool: AgentTool = {
    definition: {
      name: 'save_memory',
      description:
        "Save a durable insight to your long-term memory so you can recall it in future conversations. Use for stable, reusable facts or patterns (e.g. a client's recurring blocker, a useful framing, a team preference) — NOT for transient query results that you can just look up again.",
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The insight to remember, self-contained.' },
          scope: { type: 'string', description: 'Optional tag, e.g. a client email or topic.' },
        },
        required: ['content'],
      },
    },
    handler: async (input) => {
      await saveMemory(opts.bot, String(input.content || ''), input.scope ? String(input.scope) : null, conversationId);
      return { saved: true };
    },
  };

  const tools = [...opts.tools, saveMemoryTool];
  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));
  const toolDefs = tools.map((t) => t.definition);
  const toolsUsed = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: opts.message },
  ];

  const maxSteps = opts.maxSteps ?? 8;
  for (let step = 0; step < maxSteps; step++) {
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system,
      tools: toolDefs,
      messages,
    });

    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === 'tool_use') {
          toolsUsed.add(block.name);
          const tool = toolMap.get(block.name);
          let output: unknown;
          try {
            output = tool
              ? await tool.handler((block.input ?? {}) as Record<string, unknown>)
              : { error: `Unknown tool: ${block.name}` };
          } catch (e) {
            output = { error: e instanceof Error ? e.message : 'tool failed' };
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output).slice(0, MAX_TOOL_RESULT_CHARS) });
        }
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const reply =
      res.stop_reason === 'refusal'
        ? "I can't help with that request."
        : res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim() || 'No response.';

    await logMessage(opts.bot, conversationId, opts.userEmail ?? null, 'assistant', reply, [...toolsUsed]);
    return { reply, conversationId };
  }

  const fallback = "That question needed too many lookups — try narrowing it (e.g. ask about one client at a time).";
  await logMessage(opts.bot, conversationId, opts.userEmail ?? null, 'assistant', fallback, [...toolsUsed]);
  return { reply: fallback, conversationId };
}
