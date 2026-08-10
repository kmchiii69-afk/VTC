import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthUser } from '@/lib/auth';
import { startConversation } from '@/lib/ai/memory';
import { db } from '@/lib/kv';

// Vision pass for the CRM Assistant. Receives screenshots (or frames sampled
// from a screen recording, client-side) as base64 images and returns a clean,
// chronological transcript of the DM conversation shown in them. The transcript
// is stored in crmbot_context and injected into the assistant's context on every
// later turn — so the images are read ONCE, not re-sent each message.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_IMAGES = 20; // frames are capped client-side; this is a server backstop

const EXTRACT_PROMPT = `These images are screenshots (or frames sampled from a screen recording) of a direct-message conversation — Instagram or WhatsApp — between the account owner ("Me") and a lead.

Transcribe the conversation into a clean, chronological thread. Rules:
- One line per message: "Lead: <text>" or "Me: <text>". Right-aligned / coloured bubbles are "Me"; left-aligned / grey bubbles are the "Lead".
- Preserve order top-to-bottom, and across images in the order given.
- If these are frames from a recording, they overlap heavily — MERGE duplicates. Each real message appears once, no repeats.
- Include visible timestamps or date separators in [brackets] when shown.
- Note non-text content briefly, e.g. "[Lead sent a voice note]", "[Me sent a reel]", "[image]".
- If the lead's name or @handle is visible, put it on the first line as "Handle: @...".
- Transcribe faithfully — do not summarise, interpret, paraphrase, or add commentary. Fix only obvious OCR artefacts.
- If a message is partially cut off or unreadable, mark it "[unclear]" rather than guessing.

Output only the transcript.`;

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const source: string = body.source === 'recording' ? 'recording' : 'screenshot';
  const label: string | null = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 200) : null;
  let conversationId: string | null = body.conversationId || null;

  const rawImages: unknown = body.images;
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    return NextResponse.json({ error: 'No images provided' }, { status: 400 });
  }

  // Normalise: accept bare base64 or full data URLs; strip the data-URL prefix.
  const images = rawImages
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .slice(0, MAX_IMAGES)
    .map((s) => {
      const comma = s.indexOf(',');
      return s.startsWith('data:') && comma !== -1 ? s.slice(comma + 1) : s;
    });
  if (!images.length) return NextResponse.json({ error: 'No valid images' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY_2;
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
            })),
            { type: 'text' as const, text: EXTRACT_PROMPT },
          ],
        },
      ],
    });

    const transcript =
      res.stop_reason === 'refusal'
        ? ''
        : res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();

    if (!transcript) {
      return NextResponse.json({ error: "Couldn't read any messages from those images. Try clearer or larger screenshots." }, { status: 422 });
    }

    // Ensure a conversation exists so the chat turn can find this context.
    if (!conversationId) conversationId = await startConversation('crmbot', auth.email);

    let contextId: string | null = null;
    try {
      const { data } = await db()
        .from('crmbot_context')
        .insert({
          conversation_id: conversationId,
          user_email: auth.email,
          source_type: source,
          label,
          transcript,
          image_count: images.length,
        })
        .select('id')
        .single();
      contextId = (data?.id as string) ?? null;
    } catch {
      /* non-fatal — still return the transcript so the user can proceed this turn */
    }

    return NextResponse.json({ conversationId, contextId, transcript, imageCount: images.length, source });
  } catch (e) {
    console.error('CRM assistant extract error:', e);
    return NextResponse.json({ error: 'Failed to read the images' }, { status: 500 });
  }
}
