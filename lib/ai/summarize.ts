import Anthropic from '@anthropic-ai/sdk';

// Turn a call transcript into a crisp ~2-sentence recap for the recordings
// Discord notification. Returns '' when no transcript / no API key / on any
// failure, so callers fall back to a manual summary or omit the line.
export async function summarizeTranscript(transcript: string, title?: string): Promise<string> {
  const t = (transcript || '').trim();
  if (!t) return '';
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) return '';
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 90,
      system:
        'Write a very short recap of a coaching/mastermind call from its transcript: 1–2 sentences, 40 WORDS MAXIMUM, that fits on two lines in Discord. Capture what the call covered at a high level. Plain prose only — no markdown, no bullets, no preamble, no quotes. Hard limit: never exceed 40 words.',
      messages: [
        {
          role: 'user',
          content: `${title ? `Call title: ${title}\n\n` : ''}Transcript:\n"""\n${t.slice(0, 40000)}\n"""\n\nWrite the recap (max 40 words, 2 lines).`,
        },
      ],
    });
    return res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
  } catch (e) {
    console.error('[summarizeTranscript]', e);
    return '';
  }
}
