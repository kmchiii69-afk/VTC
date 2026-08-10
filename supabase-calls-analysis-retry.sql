-- Sales-call analysis retry + failure tracking.
-- A call that fails analysis (transient Claude API overload/timeout, a truncated
-- response, or a Fathom transcript that wasn't ready at import time) was previously
-- set to status 'imported' and NEVER retried — the analyze queue only ever selected
-- status 'pending', so one transient failure stranded the call permanently and it
-- never reached the Sales dashboard (no ICP report).
--
-- lib/sales-sync.ts now retries 'imported' calls too, bounded by analysis_attempts.
-- After MAX_ANALYSIS_ATTEMPTS (3) a call moves to the terminal 'analysis_failed'
-- status with the reason stored in analysis_error, so it's visible + diagnosable
-- (never silently stranded) and recoverable via the admin "Retry failed" action.
--
-- Run once in the Supabase SQL editor (same project as portal_users / calls).
-- Safe to re-run: every statement is idempotent.

alter table public.calls add column if not exists analysis_attempts integer not null default 0;
alter table public.calls add column if not exists analysis_error text;

-- Fast lookups for the analyze queue (pending/imported under the retry cap) and
-- for counting terminally-failed calls to surface in the admin UI.
create index if not exists calls_status_idx on public.calls (status);

-- Give already-stranded calls (failed before this fix) a clean slate so they retry
-- and recover automatically on the next sync/cron run.
update public.calls set analysis_attempts = 0, analysis_error = null where status = 'imported';
