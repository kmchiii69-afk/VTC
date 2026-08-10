// Onboarding "you're falling behind" nudges.
//
// A client still in onboarding (portal_users.onboarded_at IS NULL) works the
// steps in a fixed sequence. There's no per-step "started_at" in the schema, so
// we INFER when their current step became available:
//   - step 1  → their account creation time (created_at)
//   - step N  → the completed_at of step N-1 (when they finished the previous one)
// If they've sat on that frontier step for more than 2 days, we ping their 1-1
// Discord channel. Cadence is "once, then daily": first ping at the 2-day mark,
// then at most one per day until the step is done (tracked in onboarding_reminders).
//
// Driven by app/api/cron/onboarding-reminders/route.ts (daily).

import { getAllUsers, db } from '@/lib/kv';
import { getOnboardingStepCompletions } from '@/lib/onboarding';
import { onboardingBoundary } from '@/lib/onboarding-data';
import { stepsFor } from '@/lib/onboarding-variant';
import { sendChannelMessage } from '@/lib/discord';
import { logEvent } from '@/lib/journey';

const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_DAYS = 2;
const APP_URL = (process.env.APP_URL || 'https://gohconsulting.app').replace(/\/$/, '');

// UTC calendar day (YYYY-MM-DD) — the "once per day" boundary for the cadence.
function utcDay(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export interface ReminderResult {
  onboarding_clients: number; // still mid-onboarding
  eligible: number;           // stuck > 2 days on their current step
  sent: number;
  skipped_no_channel: number; // eligible but no 1-1 channel configured
  failed: number;             // Discord send failed (will retry next run)
  previews?: { name: string; step: string; days: number; hasChannel: boolean; message: string }[]; // dry-run only
}

// The exact text posted to a client's 1-1 channel. Exported so a dry-run can
// render a sample without sending.
export function buildReminderMessage(name: string, stepTitle: string, days: number): string {
  const who = name?.trim() || 'there';
  return (
    `Hey **${who}** — quick nudge on your onboarding.\n\n` +
    `You've been on **${stepTitle}** for ${days} days now and are falling behind the pack. ` +
    `It only takes a few minutes — jump back in and knock it out here:\n${APP_URL}/onboarding\n\n` +
    `Stuck on anything? Just reply here, we've got you.`
  );
}

// dry: compute + collect the messages that WOULD be sent, but send nothing and
// write no cadence/journey rows. Used by the ?dry=1 preview.
export async function runOnboardingReminders(
  now: Date = new Date(),
  opts: { dry?: boolean } = {},
): Promise<ReminderResult> {
  const dry = !!opts.dry;
  const nowMs = now.getTime();
  const users = await getAllUsers();
  const onboarding = users.filter(
    (u) => (u.role ?? 'user') === 'user' && u.active !== false && u.onboarded_at == null,
  );

  const res: ReminderResult = {
    onboarding_clients: onboarding.length,
    eligible: 0, sent: 0, skipped_no_channel: 0, failed: 0,
    ...(dry ? { previews: [] } : {}),
  };
  if (onboarding.length === 0) return res;

  // Load existing cadence rows once (small table).
  const { data: rows } = await db()
    .from('onboarding_reminders')
    .select('user_email, step_id, last_sent_at, sent_count');
  const seen = new Map<string, { last_sent_at: string; sent_count: number }>();
  for (const r of (rows ?? []) as { user_email: string; step_id: string; last_sent_at: string; sent_count: number }[]) {
    seen.set(`${r.user_email}|${r.step_id}`, { last_sent_at: r.last_sent_at, sent_count: r.sent_count });
  }
  const today = utcDay(now);

  for (const u of onboarding) {
    const completions = await getOnboardingStepCompletions(u.email);
    const completedSet = new Set(completions.map((c) => c.stepId));
    const completedAt = new Map(completions.map((c) => [c.stepId, c.completedAt]));
    // Nudge against THEIR onboarding — a Creative Specialist has a single step.
    const steps = stepsFor(u.features);
    const stepIds = steps.map((s) => s.id);
    const boundary = onboardingBoundary(completedSet, stepIds);
    // boundary === length → every step done (onboarded_at just not stamped yet). Nothing to nudge.
    if (boundary >= stepIds.length) continue;

    const stepId = stepIds[boundary];
    const step = steps[boundary];

    // When did this (frontier) step become available to them?
    let availableSinceMs: number | null;
    if (boundary === 0) {
      availableSinceMs = typeof u.created_at === 'number' && u.created_at > 0 ? u.created_at : null;
    } else {
      const prevDone = completedAt.get(stepIds[boundary - 1]);
      availableSinceMs = prevDone ? new Date(prevDone).getTime() : null;
    }
    if (availableSinceMs == null) continue; // can't establish a start anchor → don't guess

    const daysStuck = (nowMs - availableSinceMs) / DAY_MS;
    if (daysStuck < THRESHOLD_DAYS) continue;
    res.eligible++;

    const whole = Math.max(THRESHOLD_DAYS, Math.floor(daysStuck));
    const msg = buildReminderMessage(u.name, step.title, whole);

    // Dry preview: show every stuck client (with a channel flag), send nothing.
    if (dry) {
      res.previews!.push({
        name: u.name?.trim() || u.email, step: step.title, days: whole,
        hasChannel: !!u.discord_channel_id, message: msg,
      });
      continue;
    }

    if (!u.discord_channel_id) { res.skipped_no_channel++; continue; }

    // Cadence: once, then daily. Skip if this step was already pinged today.
    const emailKey = u.email.toLowerCase().trim();
    const key = `${emailKey}|${stepId}`;
    const prior = seen.get(key);
    if (prior && utcDay(prior.last_sent_at) === today) continue;

    const ok = await sendChannelMessage(u.discord_channel_id, msg).catch(() => false);
    if (!ok) { res.failed++; continue; }
    res.sent++;

    // Record the send: first insert stamps first_sent_at; later sends bump the
    // daily counter and last_sent_at (first_sent_at omitted so it's preserved).
    const iso = now.toISOString();
    await db()
      .from('onboarding_reminders')
      .upsert(
        prior
          ? { user_email: emailKey, step_id: stepId, last_sent_at: iso, sent_count: (prior.sent_count ?? 0) + 1 }
          : { user_email: emailKey, step_id: stepId, first_sent_at: iso, last_sent_at: iso, sent_count: 1 },
        { onConflict: 'user_email,step_id' },
      )
      .then(() => {}, () => {});

    await logEvent({
      clientEmail: emailKey,
      type: 'onboarding_reminder',
      title: `Onboarding nudge · ${step.title}`,
      summary: `Stuck ${whole} days — reminded in 1-1 channel`,
    }).catch(() => {});
  }

  return res;
}
