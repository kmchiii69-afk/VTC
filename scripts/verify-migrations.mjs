// One-off: verify the session's migration tables/columns exist in Supabase.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// minimal .env.local loader
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const checks = [
  ['client_events', 'id'],
  ['onboarding_progress', 'step_id'],
  ['onboarding_uploads', 'id'],
  ['onboarding_form_responses', 'form_id'],
  ['content_brain', 'id'],
  ['client_content_context', 'client_email'],
  ['csm_conversations', 'id'],
  ['csm_messages', 'id'],
  ['csm_memory', 'id'],
  ['advisor_conversations', 'id'],
  ['advisor_messages', 'id'],
  ['advisor_memory', 'id'],
  ['content_conversations', 'id'],
  ['content_messages', 'id'],
  ['content_memory', 'id'],
];

for (const [table, col] of checks) {
  const { error } = await db.from(table).select(col, { count: 'exact', head: true }).limit(1);
  console.log(`${error ? 'MISSING ' : 'OK      '} ${table}${error ? '  -> ' + error.message : ''}`);
}

// columns on portal_users
const { error: ue } = await db.from('portal_users').select('onboarded_at, contract_tier', { head: true }).limit(1);
console.log(`${ue ? 'MISSING ' : 'OK      '} portal_users.onboarded_at/contract_tier${ue ? '  -> ' + ue.message : ''}`);
