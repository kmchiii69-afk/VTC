import { getUser, getAllUsers, type User } from '@/lib/kv';

// ─────────────────────────────────────────────────────────────────────────────
// Fathom's "New meeting content ready" payload is parsed defensively here:
// field names vary across plans / API versions, so we probe several likely
// locations and always fall back gracefully. The raw body is persisted by the
// webhook route regardless, so anything we miss can be reprocessed later.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedCall {
  recordingId: string;
  title: string;
  recordingUrl: string | null;
  callDate: string | null;        // ISO string
  durationMinutes: number | null;
  transcript: string;
  summary: string;
  actionItems: string[];
  hostEmail: string | null;
  participantEmails: string[];     // all known emails, lowercased & unique
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function pick<T = unknown>(obj: unknown, ...paths: string[]): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const path of paths) {
    let cur: unknown = obj;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur as T;
  }
  return undefined;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function collectEmails(node: unknown, out: Set<string>) {
  if (!node) return;
  if (typeof node === 'string') {
    const matches = node.match(EMAIL_RE);
    if (matches) matches.forEach((m) => out.add(m.toLowerCase()));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectEmails(n, out));
    return;
  }
  if (typeof node === 'object') {
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      // Only recurse into fields likely to hold people/emails to avoid pulling
      // unrelated emails (e.g. from transcript prose links).
      if (/email|invitee|participant|attendee|host|user|speaker|contact|people|crm/i.test(key)) {
        collectEmails(val, out);
      }
    }
  }
}

function extractTranscript(body: unknown): string {
  // Could be a plain string, { plaintext }, { markdown }, or an array of segments.
  const direct = pick<string>(body, 'transcript.plaintext', 'transcript.text', 'transcript_plaintext');
  if (typeof direct === 'string' && direct.trim()) return direct;

  const t = pick(body, 'transcript');
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    return t
      .map((seg) => {
        const speaker = asString(
          pick(seg, 'speaker.display_name', 'speaker.name', 'speaker') ?? ''
        );
        const text = asString(pick(seg, 'text', 'plaintext', 'content') ?? '');
        return speaker ? `${speaker}: ${text}` : text;
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function extractActionItems(body: unknown): string[] {
  // Fathom sends `action_items` as an array; tolerate an {items:[...]} wrapper too.
  let items = pick(body, 'action_items', 'actionItems', 'summary.action_items');
  if (items && !Array.isArray(items)) items = pick(items, 'items');
  if (!Array.isArray(items)) return [];
  return items
    .map((it) =>
      typeof it === 'string'
        ? it
        : asString(pick(it, 'text', 'description', 'title', 'content') ?? '')
    )
    .filter(Boolean);
}

// Fathom's summary lives in `default_summary` (object) on the real payload, or
// `summary` on some shapes. Either may be a plain string or an object with a
// markdown/text field — never stringify the raw object.
function extractSummary(body: unknown): string {
  const direct = pick(body, 'default_summary', 'summary');
  if (typeof direct === 'string' && direct.trim()) return direct;
  const nested = pick<string>(
    body,
    'default_summary.markdown',
    'default_summary.text',
    'default_summary.formatted_summary',
    'default_summary.summary',
    'summary.markdown',
    'summary.text',
    'summary.formatted_summary'
  );
  return typeof nested === 'string' && nested.trim() ? nested : '';
}

export function normalizeFathomPayload(body: unknown): NormalizedCall {
  const recordingId = asString(
    pick(
      body,
      'recording.id',
      'recording.recording_id',
      'recording_id',
      'meeting.recording_id',
      'id'
    ) ?? ''
  );

  const title = asString(
    pick(body, 'meeting.title', 'recording.title', 'title', 'meeting.meeting_title') ?? ''
  );

  const recordingUrl =
    asString(
      pick(
        body,
        'recording.url',
        'recording.share_url',
        'recording.recording_url',
        'recording_url',
        'share_url',
        'url'
      ) ?? ''
    ) || null;

  const callDateRaw = pick<string>(
    body,
    'meeting.scheduled_start_time',
    'recording.created_at',
    'meeting.started_at',
    'started_at',
    'created_at',
    'scheduled_start_time'
  );
  const callDate = callDateRaw ? asString(callDateRaw) : null;

  const durRaw = pick<number | string>(
    body,
    'recording.duration_in_minutes',
    'meeting.duration_minutes',
    'duration_minutes',
    'duration'
  );
  let durationMinutes =
    durRaw == null || durRaw === '' ? null : Math.round(Number(durRaw)) || null;
  // Fathom has no duration field — derive it from the recording start/end times.
  if (durationMinutes == null) {
    const start = pick(body, 'recording_start_time', 'recording.recording_start_time', 'started_at', 'meeting.scheduled_start_time', 'scheduled_start_time');
    const end = pick(body, 'recording_end_time', 'recording.recording_end_time', 'ended_at', 'meeting.scheduled_end_time', 'scheduled_end_time');
    if (start && end) {
      const ms = Date.parse(asString(end)) - Date.parse(asString(start));
      if (Number.isFinite(ms) && ms > 0) durationMinutes = Math.round(ms / 60000) || null;
    }
  }

  const hostEmail =
    asString(
      pick(
        body,
        'fathom_user.email',
        'host.email',
        'recording.recorded_by.email',
        'owner.email',
        'host_email'
      ) ?? ''
    ).toLowerCase() || null;

  const emails = new Set<string>();
  collectEmails(body, emails);

  return {
    recordingId,
    title,
    recordingUrl,
    callDate,
    durationMinutes,
    transcript: extractTranscript(body),
    summary: extractSummary(body),
    actionItems: extractActionItems(body),
    hostEmail,
    participantEmails: [...emails],
  };
}

// ─── Coach / client resolution ───────────────────────────────────────────────

export interface MatchResult {
  coach: User | null;
  coachNameFromTitle: string | null;
  clients: User[]; // matched portal users with role 'user'
}

// Strip the "Check-in" prefix to recover the coach name from the title
// (titles follow the convention "Check-in <coach name>").
export function coachNameFromTitle(title: string): string | null {
  if (!title) return null;
  const cleaned = title
    .replace(/check[\s-]*in/i, '')
    .replace(/\b1[\s-]*[:on]+[\s-]*1\b/i, '') // 1-1, 1:1, 1 on 1
    .replace(/[-–—|·:]/g, ' ')
    .replace(/\bwith\b/i, ' ')
    .trim();
  return cleaned || null;
}

export async function matchParticipants(call: NormalizedCall): Promise<MatchResult> {
  const coaches: User[] = [];
  const clients: User[] = [];

  for (const email of call.participantEmails) {
    const user = await getUser(email);
    if (!user || !user.active) continue;
    if (user.role === 'admin') coaches.push(user);
    else if (user.role === 'user') clients.push(user);
  }

  const nameFromTitle = coachNameFromTitle(call.title);

  // Prefer a coach (admin) confirmed by both the title and a matched email.
  let coach: User | null = null;
  if (coaches.length === 1) {
    coach = coaches[0];
  } else if (coaches.length > 1 && nameFromTitle) {
    coach =
      coaches.find((c) =>
        c.name && nameFromTitle.toLowerCase().includes(c.name.toLowerCase())
      ) ?? coaches[0];
  } else if (coaches.length > 1) {
    coach = coaches[0];
  }

  // Title-only fallback when no admin email matched (e.g. coach used a
  // personal calendar address that differs from their portal email).
  if (!coach && nameFromTitle) {
    const admins = (await getAllUsers()).filter((u) => u.role === 'admin' && u.active);
    coach =
      admins.find(
        (a) => a.name && nameFromTitle.toLowerCase().includes(a.name.toLowerCase())
      ) ?? null;
  }

  return { coach, coachNameFromTitle: nameFromTitle, clients };
}
