-- Sales calls: keep a manual outcome correction from being overwritten
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- Why: a call's outcome (closed / no_close / dq / no_show) is written by the AI
-- analysis. When an admin corrects it by hand in the Sales Calls table — most
-- often marking a call DQ that the analyzer read as a no-close — a later
-- re-analysis (Retry Failed, or a re-sync) used to silently overwrite it.
-- outcome_locked is set on any manual edit and re-analysis then leaves the
-- outcome alone (it still refreshes the report, revenue and cash).
--
-- Until this SQL is run the app degrades gracefully: manual edits still save,
-- they just aren't protected from a re-analysis.

alter table public.calls add column if not exists outcome_locked boolean not null default false;
