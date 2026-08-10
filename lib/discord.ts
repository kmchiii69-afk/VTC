import { getUser } from '@/lib/kv';
import { recordingCategory, formatCallDate } from '@/lib/recordings';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
// Separate bot for funnel lead-ping notifications (its own token + channel
// access), kept distinct from the main bot used for client 1-1 messages.
const LEADS_BOT_TOKEN = process.env.DISCORD_LEADS_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

// Low-level channel post with an explicit bot token. Non-throwing.
// `allowedMentions` (optional) whitelists what may ping — pass e.g.
// { roles: ['<id>'] } to force a role ping even if the role isn't "mentionable".
async function postMessage(
  token: string | undefined,
  channelId: string,
  content: string,
  allowedMentions?: Record<string, unknown>,
): Promise<boolean> {
  if (!token || !channelId) return false;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...(allowedMentions ? { allowed_mentions: allowedMentions } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface DiscordMember {
  username: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
  roles: string[];
}

// Post a message to a channel via the bot (e.g. a client's 1-1 channel).
// Requires the bot to be in the server with access to that channel. Non-throwing.
export async function sendChannelMessage(channelId: string, content: string): Promise<boolean> {
  return postMessage(BOT_TOKEN, channelId, content);
}

// Notify a client, in their 1-1 Discord channel, that new task(s) were assigned
// to them by a coach/admin. Pings the member by Discord id and links them to
// their actionables. Best-effort: a missing channel/id/token never throws and
// never blocks the assignment that triggered it.
export async function notifyTasksAssigned(clientEmail: string): Promise<boolean> {
  try {
    const user = await getUser(clientEmail);
    if (!user || !user.discord_channel_id) return false;

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    // Acquisition members view tasks on the Acquisition board; everyone else in
    // the to-do bubble, which only mounts on /select. Not /portal — that section
    // isn't surfaced to members.
    const isAcq = Array.isArray(user.features) && user.features.includes('acquisition');
    const link = appUrl ? `${appUrl}${isAcq ? '/roadmap?view=acquisition' : '/select'}` : '';
    const mention = user.discord_id ? `<@${user.discord_id}>` : (user.name || 'there');

    const content = `Action items have been assigned to you ${mention} — please check here${link ? `: ${link}` : '.'}`;
    return await sendChannelMessage(user.discord_channel_id, content);
  } catch {
    return false;
  }
}

// Post a "new lead" notification to a team channel (e.g. an opt-in funnel lead),
// tagging a handler by Discord user id. Best-effort + non-throwing.
export async function notifyNewLead(opts: {
  channelId: string;
  mentionId?: string;
  title: string;                // e.g. "Buyer Mirror" → "New lead · Buyer Mirror"
  name?: string; email?: string; instagram?: string; phone?: string;
  makingMoney?: string; coachingBiz?: string; monthlyCash?: string;
}): Promise<boolean> {
  if (!opts.channelId) return false;
  const mention = opts.mentionId ? ` <@${opts.mentionId}>` : '';
  const content = [
    `**New lead · ${opts.title}**${mention}`,
    `**Name:** ${opts.name || '—'}`,
    `**Email:** ${opts.email || '—'}`,
    `**Instagram:** ${opts.instagram || '—'}`,
    `**Phone:** ${opts.phone || '—'}`,
    `**Money From Content:** ${opts.makingMoney || '—'}`,
    `**Coaching Biz:** ${opts.coachingBiz || '—'}`,
    `**Monthly C.C:** ${opts.monthlyCash || '—'}`,
  ].join('\n');
  // Uses the dedicated leads bot token (separate from the client-1-1 bot).
  return postMessage(LEADS_BOT_TOKEN, opts.channelId, content);
}

// Notify the recordings team channel whenever a new call recording is uploaded.
// Posts via the main bot (must be in the server with Send Messages on that
// channel). Channel is env-overridable; defaults to the configured recordings
// channel. Best-effort + non-throwing — never blocks the upload.
export async function notifyRecordingUploaded(rec: {
  id: string; category: string; title?: string | null; call_date?: string | null;
  embed_code?: string | null; fathom_url?: string | null; summary?: string | null;
}): Promise<boolean> {
  const channelId = process.env.DISCORD_RECORDINGS_CHANNEL_ID || '1213261444586405898';
  const roleId = process.env.DISCORD_RECORDINGS_ROLE_ID || '1490803846216159294';
  const cat = recordingCategory(rec.category);
  const day = cat?.day ? `${cat.day} - ` : '';
  const title = rec.title || cat?.name || 'Recording';
  const date = rec.call_date ? formatCallDate(rec.call_date) : '';
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  // Link straight to the recording's own section URL in the hub (each group-call
  // category is its own page now), with the recording preselected. Falls back to
  // a Fathom share link only when APP_URL isn't configured.
  const fathomToken = (rec.fathom_url || rec.embed_code || '').match(/fathom\.video\/(?:embed|share)\/([A-Za-z0-9_-]+)/i)?.[1];
  const link = appUrl
    ? `${appUrl}/hub?s=${encodeURIComponent(rec.category)}&rec=${encodeURIComponent(rec.id)}`
    : (rec.fathom_url || (fathomToken ? `https://fathom.video/share/${fathomToken}` : ''));
  const body = [
    `**${day}${title}**${date ? ` (${date})` : ''}`,
    rec.summary?.trim() || null,
    link ? `**Recording:** ${link}` : null,
  ].filter(Boolean).join('\n\n');
  const content = `<@&${roleId}>\n**New Recording Is Live**\n\n${body}`;
  return postMessage(BOT_TOKEN, channelId, content, { roles: [roleId] });
}

// Notify the recordings channel when a new Exclusive Guest Mastermind is added.
// Uses the same channel + format as notifyRecordingUploaded. Best-effort.
export async function notifyBreakdownUploaded(b: { slug: string; title: string; embed_code?: string | null; summary?: string | null }): Promise<boolean> {
  const channelId = process.env.DISCORD_RECORDINGS_CHANNEL_ID || '1213261444586405898';
  const roleId = process.env.DISCORD_RECORDINGS_ROLE_ID || '1490803846216159294';
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  // Guest masterminds live under their own /hub?s=breakdowns section page.
  const fathomToken = (b.embed_code || '').match(/fathom\.video\/(?:embed|share)\/([A-Za-z0-9_-]+)/i)?.[1];
  const link = appUrl ? `${appUrl}/hub?s=breakdowns` : (fathomToken ? `https://fathom.video/share/${fathomToken}` : '');
  const body = [
    `**${b.title}**`,
    b.summary?.trim() || null,
    link ? `**Recording:** ${link}` : null,
  ].filter(Boolean).join('\n\n');
  const content = `<@&${roleId}>\n**New Recording Is Live**\n\n${body}`;
  return postMessage(BOT_TOKEN, channelId, content, { roles: [roleId] });
}

export async function getGuildMember(discordId: string): Promise<DiscordMember | null> {
  if (!BOT_TOKEN || !GUILD_ID || !discordId) return null;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
      {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.user || {};
    const avatarHash = data.avatar || user.avatar;
    const avatarUrl = avatarHash
      ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${discordId}/avatars/${avatarHash}.webp`
      : user.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.webp`
      : null;
    return {
      username: user.username || discordId,
      display_name: data.nick || user.global_name || user.username || discordId,
      avatar_url: avatarUrl,
      joined_at: data.joined_at || '',
      roles: data.roles || [],
    };
  } catch {
    return null;
  }
}
