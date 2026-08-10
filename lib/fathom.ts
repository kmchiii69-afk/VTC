const FATHOM_BASE = 'https://api.fathom.ai/external/v1';
const DEFAULT_API_KEY = process.env.FATHOM_API_KEY;

// Named Fathom accounts. The default is the main team key; 'sales_manager' is a
// separate Fathom account (the sales manager's) with its own API key.
export type FathomSource = 'default' | 'sales_manager';

export function resolveApiKey(source: FathomSource = 'default'): string | undefined {
  if (source === 'sales_manager') return process.env.FATHOM_SALES_API_KEY;
  return DEFAULT_API_KEY;
}

export interface FathomMeeting {
  id: string;
  title: string;
  created_at: string;
  recording_id: number;
  attendees: Array<{ name: string; is_host: boolean; email?: string; is_external?: boolean }>;
  transcript?: string;
  summary?: string;
  share_url?: string;
}

function headers(apiKey?: string) {
  return { 'X-Api-Key': (apiKey ?? DEFAULT_API_KEY) ?? '', 'Content-Type': 'application/json' };
}

function formatTranscript(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((s: { speaker?: { display_name?: string }; text?: string }) =>
        `${s.speaker?.display_name ?? 'Unknown'}: ${s.text ?? ''}`)
      .join('\n');
  }
  return JSON.stringify(raw);
}

function buildAttendees(meeting: Record<string, unknown>) {
  type Invitee = { name?: string; email?: string; is_external?: boolean; display_name?: string };
  const invitees = (
    (meeting.calendar_invitees as Invitee[]) ??
    (meeting.attendees as Invitee[]) ??
    (meeting.participants as Invitee[]) ??
    []
  );
  return invitees.map((inv) => ({
    name: inv.name ?? inv.display_name ?? inv.email ?? 'Unknown',
    email: inv.email ?? '',
    is_host: !inv.is_external,
    is_external: !!inv.is_external,
  }));
}

export async function listMeetings(cursor?: string, limit = 25, createdAfter?: string, apiKey?: string) {
  const key = apiKey ?? DEFAULT_API_KEY;
  if (!key) return { meetings: [] as FathomMeeting[], next_cursor: null as string | null };

  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (createdAfter) params.set('created_after', createdAfter);

  const res = await fetch(`${FATHOM_BASE}/meetings?${params}`, { headers: headers(key) });
  if (!res.ok) return { meetings: [] as FathomMeeting[], next_cursor: null };

  const data = await res.json();
  const items = (data.items ?? data.data ?? data.meetings ?? []) as Record<string, unknown>[];

  const meetings: FathomMeeting[] = items.map((m) => ({
    id: String(m.recording_id ?? m.id ?? ''),
    title: (m.meeting_title ?? m.title ?? 'Untitled') as string,
    created_at: (m.created_at ?? '') as string,
    recording_id: (m.recording_id ?? 0) as number,
    attendees: buildAttendees(m),
    transcript: formatTranscript(m.transcript) || undefined,
    summary: (m.default_summary ?? m.summary) as string | undefined,
    share_url: (m.share_url) as string | undefined,
  }));

  return { meetings, next_cursor: (data.next_cursor ?? null) as string | null };
}

export async function getMeetingTranscript(recordingId: string, apiKey?: string): Promise<string> {
  const key = apiKey ?? DEFAULT_API_KEY;
  if (!key) return '';
  const res = await fetch(`${FATHOM_BASE}/recordings/${recordingId}/transcript`, { headers: headers(key) });
  if (!res.ok) return '';
  const data = await res.json();
  if (data.transcript) return formatTranscript(data.transcript);
  return formatTranscript(data);
}

// Resolve a Fathom call URL (or recording id) into its recording id + transcript.
// Tries a numeric id in the URL first (e.g. /calls/123); falls back to scanning
// recent meetings for a matching share_url (handles /share/<token> links).
export async function resolveFathomCallFromUrl(
  url: string,
  apiKey?: string,
): Promise<{ recordingId: string; transcript: string; title?: string; callDate?: string | null } | null> {
  const key = apiKey ?? DEFAULT_API_KEY;
  if (!key) return null;
  const clean = url.trim();

  // 1) Direct numeric id in the path (calls/recordings/meetings/<id>) or any long run.
  const m = clean.match(/(?:calls|recordings|meetings)\/(\d+)/i) || clean.match(/(\d{6,})/);
  if (m?.[1]) {
    const transcript = await getMeetingTranscript(m[1], key);
    if (transcript) return { recordingId: m[1], transcript };
  }

  // 2) Share-URL fallback: find the meeting whose share_url matches, use its data.
  const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  const target = norm(clean);
  const meetings = await getAllMeetings(20, undefined, key);
  const hit = meetings.find((mt) => {
    const s = mt.share_url ? norm(mt.share_url) : '';
    return s && (s === target || target.includes(s) || s.includes(target));
  });
  if (hit) {
    const rid = String(hit.recording_id || hit.id);
    const transcript = hit.transcript || (await getMeetingTranscript(rid, key));
    if (transcript) return { recordingId: rid, transcript, title: hit.title, callDate: hit.created_at };
  }
  return null;
}

export async function getAllMeetings(maxPages = 20, createdAfter?: string, apiKey?: string): Promise<FathomMeeting[]> {
  const all: FathomMeeting[] = [];
  let cursor: string | undefined;

  for (let i = 0; i < maxPages; i++) {
    const { meetings, next_cursor } = await listMeetings(cursor, 25, createdAfter, apiKey);
    all.push(...meetings);
    if (!next_cursor) break;
    cursor = next_cursor;
  }

  return all;
}
