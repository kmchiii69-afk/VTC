-- Roadmap Phase 0 ("Onboarding") backfill. Run once, AFTER the onboarding-as-
-- Phase-0 change ships (lib/roadmap-data.ts now prepends an Onboarding phase
-- whose item ids ARE the onboarding step ids).
--
-- Why this is needed: roadmap gating is strictly sequential. Existing clients
-- have onboarded_at set (supabase-onboarding.sql backfilled it) but have NO
-- Phase-0 rows in roadmap_progress, so the new phase would read as 0% done and
-- LOCK their entire roadmap. This marks Phase 0 complete for them.
--
-- New clients need nothing here: completing an onboarding step mirrors into
-- roadmap_progress under the same id going forward (lib/onboarding.ts).

-- 1) Mirror any onboarding steps clients have ALREADY completed into Phase 0
--    (item_id === step_id). Covers clients caught mid-flow.
insert into public.roadmap_progress (user_email, item_id)
select op.user_email, op.step_id
from public.onboarding_progress op
on conflict (user_email, item_id) do nothing;

-- 2) Grandfathered clients (already past onboarding) get all 12 Phase 0 items
--    marked complete so their roadmap unlocks exactly as it did before.
insert into public.roadmap_progress (user_email, item_id)
select lower(btrim(u.email)), s.item_id
from public.portal_users u
cross join (values
  ('meet-team'),('join-discord'),('complete-forms'),('select-contract'),('introduce-yourself'),
  ('video-modules'),('offer-foundation'),('market-research'),('offer-docs'),('submit-docs'),
  ('mindset-modules'),('referral-doc'),('book-fanbasis'),('onboarding-call')
) as s(item_id)
where u.onboarded_at is not null
on conflict (user_email, item_id) do nothing;
