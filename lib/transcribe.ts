// Instagram reel transcription via Apify (resolve the reel's media URL) +
// AssemblyAI (transcribe that media). This replaces Supadata's flaky IG path.
//
// Env required:
//   APIFY_TOKEN            — your Apify API token (Console → Integrations)
//   ASSEMBLYAI_API_KEY     — your AssemblyAI key
//   APIFY_INSTAGRAM_ACTOR  — optional; defaults to the official 'apify~instagram-scraper'
//
// Apify's Instagram actors are actively maintained against IG changes, so the
// media-resolution step is far more reliable than RapidAPI wrappers. The output
// parser is shape-agnostic — it walks the dataset items and grabs the first
// plausible video URL, so it survives schema differences between actors.

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR = process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-scraper';
const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

export function reelTranscribeConfigured(): boolean {
  return !!(APIFY_TOKEN && ASSEMBLYAI_KEY);
}

// Recursively collect strings that look like a downloadable video URL.
function collectVideoUrls(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    if (/^https?:\/\//i.test(node) && (/\.mp4(\?|$)/i.test(node) || /(cdninstagram|fbcdn)\.[^ ]*video|\/video\//i.test(node))) {
      out.push(node);
    }
    return;
  }
  if (Array.isArray(node)) { for (const x of node) collectVideoUrls(x, out); return; }
  if (node && typeof node === 'object') { for (const v of Object.values(node)) collectVideoUrls(v, out); }
}

// Run the Apify Instagram actor synchronously for one reel and extract its video URL.
export async function resolveInstagramMedia(reelUrl: string): Promise<string | null> {
  if (!APIFY_TOKEN) return null;
  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directUrls: [reelUrl], resultsType: 'posts', resultsLimit: 1, addParentData: false }),
      signal: AbortSignal.timeout(120000), // actor runs can cold-start
    },
  );
  if (!res.ok) throw new Error(`Apify returned HTTP ${res.status}`);
  const items = await res.json().catch(() => null);
  if (!items) return null;
  const urls: string[] = [];
  collectVideoUrls(items, urls);
  return urls.find((u) => /\.mp4(\?|$)/i.test(u)) || urls[0] || null;
}

// Submit a media URL to AssemblyAI and poll until the transcript is ready.
export async function assemblyTranscribe(mediaUrl: string): Promise<string> {
  if (!ASSEMBLYAI_KEY) throw new Error('AssemblyAI is not configured.');
  const submit = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: ASSEMBLYAI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: mediaUrl }),
    signal: AbortSignal.timeout(20000),
  });
  if (!submit.ok) throw new Error(`AssemblyAI submit failed (HTTP ${submit.status})`);
  const submitData = (await submit.json()) as { id?: string; error?: string };
  if (!submitData.id) throw new Error(submitData.error || 'AssemblyAI did not return a job id.');

  const deadline = Date.now() + 150000; // ~2.5 min budget
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${submitData.id}`, {
      headers: { authorization: ASSEMBLYAI_KEY },
      signal: AbortSignal.timeout(20000),
    });
    if (!poll.ok) continue; // transient — keep polling
    const job = (await poll.json()) as { status?: string; text?: string; error?: string };
    if (job.status === 'completed') return (job.text || '').trim();
    if (job.status === 'error') throw new Error(job.error || 'AssemblyAI transcription failed.');
    // 'queued' | 'processing' → keep polling
  }
  throw new Error('AssemblyAI transcription timed out.');
}

// Full Instagram path: resolve the reel's media (Apify), then transcribe it (AssemblyAI).
export async function transcribeInstagramReel(reelUrl: string): Promise<string> {
  const mediaUrl = await resolveInstagramMedia(reelUrl);
  if (!mediaUrl) throw new Error('Could not find the reel video to transcribe.');
  const text = await assemblyTranscribe(mediaUrl);
  if (!text) throw new Error('No speech was found in this reel.');
  return text;
}
