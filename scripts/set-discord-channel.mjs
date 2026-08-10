// Point a member at their 1-1 Discord channel (the one the bot pings for
// assigned action items, weekly-report prompts, onboarding reminders).
//
//   node scripts/set-discord-channel.mjs someone@example.com 1533233065005027469
//   node scripts/set-discord-channel.mjs someone@example.com            # just show it
//
// Same thing the admin user drawer's "1-1 Channel" field does, from the CLI.
// Reads SUPABASE_URL / SUPABASE_SERVICE_KEY from .env.local.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [rawEmail, channelId] = process.argv.slice(2);
const email = rawEmail?.toLowerCase().trim();

if (!email) {
  console.error('usage: node scripts/set-discord-channel.mjs <email> [<channel-id>]');
  process.exit(1);
}
if (channelId && !/^\d{17,20}$/.test(channelId)) {
  console.error(`"${channelId}" is not a Discord channel id (17-20 digits).`);
  process.exit(1);
}

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const { data: user, error } = await db
  .from('portal_users')
  .select('email, name, discord_id, discord_channel_id')
  .eq('email', email)
  .maybeSingle();

if (error) { console.error(error.message); process.exit(1); }
if (!user) { console.error(`No portal_users row for ${email}`); process.exit(1); }

console.log(`${user.name || '(no name)'} <${user.email}>`);
console.log(`  discord_id:         ${user.discord_id || '—'}`);
console.log(`  1-1 channel (was):  ${user.discord_channel_id || '—'}`);

if (channelId) {
  const { error: upErr } = await db
    .from('portal_users')
    .update({ discord_channel_id: channelId })
    .eq('email', email);
  if (upErr) { console.error(upErr.message); process.exit(1); }
  console.log(`  1-1 channel (now):  ${channelId}`);
}
