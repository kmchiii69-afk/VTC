// ConvertKit ("Kit") subscribe — adds an opt-in lead as a subscriber so Kit's
// automation/sequence emails them the lead magnet (freebie / clipping SOP /
// buyer mirror, etc.).
//
// Env-gated + best-effort: with no API key or target id it is a no-op (returns
// { skipped: true }) and never throws, so a missing/misconfigured Kit account
// can never block the opt-in flow.
//
//   KIT_API_KEY — your Kit PUBLIC api key (v3 subscribe uses this)
// Per-funnel target ids are passed in by the caller (resolved from env there).
// A sequence id takes precedence over a form id.

type KitResult = { ok: boolean; skipped?: boolean; status?: number; error?: string };

export async function kitSubscribe(input: {
  email: string;
  firstName?: string;
  sequenceId?: string;
  formId?: string;
  fields?: Record<string, string | undefined>;
}): Promise<KitResult> {
  const apiKey = process.env.KIT_API_KEY || process.env.KIT_API_SECRET || '';
  const sequenceId = input.sequenceId || '';
  const formId = input.formId || '';

  if (!apiKey || (!sequenceId && !formId)) return { ok: false, skipped: true };

  const url = sequenceId
    ? `https://api.convertkit.com/v3/sequences/${sequenceId}/subscribe`
    : `https://api.convertkit.com/v3/forms/${formId}/subscribe`;

  const fields = Object.fromEntries(
    Object.entries(input.fields || {}).filter(([, v]) => v),
  );

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        email: input.email,
        ...(input.firstName ? { first_name: input.firstName } : {}),
        ...(Object.keys(fields).length ? { fields } : {}),
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `Kit ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'kit request failed' };
  }
}

const V3 = 'https://api.convertkit.com/v3';
const publicKey = () => process.env.KIT_API_KEY || process.env.KIT_API_SECRET || '';
const secretKey = () => process.env.KIT_API_SECRET || '';

/** Kit tags/sequences are addressed by numeric id; the CRM lets a coach pick by
 *  name, so these list endpoints resolve names → ids. (Kit v3 calls sequences
 *  "courses".) */
export type KitNamed = { id: number; name: string };

export async function kitListTags(): Promise<KitNamed[]> {
  const key = publicKey();
  if (!key) return [];
  try {
    const res = await fetch(`${V3}/tags?api_key=${encodeURIComponent(key)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.tags ?? []).map((t: { id: number; name: string }) => ({ id: t.id, name: t.name }));
  } catch { return []; }
}

export async function kitListSequences(): Promise<KitNamed[]> {
  const key = publicKey();
  if (!key) return [];
  try {
    const res = await fetch(`${V3}/sequences?api_key=${encodeURIComponent(key)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.courses ?? []).map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }));
  } catch { return []; }
}

/** Find a tag id by (case-insensitive) name, creating the tag if it doesn't
 *  exist — so tagging by a free-typed name always resolves. */
export async function kitResolveTag(name: string): Promise<number | null> {
  const key = publicKey();
  const want = name.trim();
  if (!key || !want) return null;
  const existing = (await kitListTags()).find((t) => t.name.toLowerCase() === want.toLowerCase());
  if (existing) return existing.id;
  try {
    const res = await fetch(`${V3}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, tag: { name: want } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Create returns the tag object (occasionally wrapped in an array).
    return Array.isArray(data) ? (data[0]?.id ?? null) : (data?.id ?? null);
  } catch { return null; }
}

/** Add (or upsert) a subscriber and apply a tag in one call. Creates the tag if
 *  needed. This is the "sync a CRM contact into Kit with a tag" primitive. */
export async function kitTagSubscriber(input: { email: string; firstName?: string; tag: string }): Promise<KitResult> {
  const key = publicKey();
  if (!key) return { ok: false, skipped: true };
  const tagId = await kitResolveTag(input.tag);
  if (!tagId) return { ok: false, error: 'Could not resolve Kit tag' };
  try {
    const res = await fetch(`${V3}/tags/${tagId}/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, email: input.email, ...(input.firstName ? { first_name: input.firstName } : {}) }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `Kit ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'kit request failed' };
  }
}

/** Create a broadcast in Kit. Created as a DRAFT (no send_at) so nothing goes
 *  out until it's reviewed & sent from Kit — a deliberate safety guard against
 *  firing mass email straight from a button. Returns the broadcast id. */
export async function kitCreateBroadcast(input: { subject: string; content: string; description?: string }): Promise<KitResult & { id?: number }> {
  const secret = secretKey();
  if (!secret) return { ok: false, skipped: true, error: 'KIT_API_SECRET required for broadcasts' };
  try {
    const res = await fetch(`${V3}/broadcasts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_secret: secret,
        subject: input.subject,
        content: input.content,
        ...(input.description ? { description: input.description } : {}),
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `Kit ${res.status}` };
    const data = await res.json();
    return { ok: true, status: res.status, id: data?.broadcast?.id ?? data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'kit request failed' };
  }
}
