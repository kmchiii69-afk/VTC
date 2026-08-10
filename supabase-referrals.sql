-- Referrals tracker (manual entry in the Admin Panel → Referrals tab)
-- Run once in the Supabase SQL editor (same project as portal_users).

create table if not exists public.referrals (
  id              uuid primary key default gen_random_uuid(),
  referrer_name   text not null,   -- client who sent the referral
  referred_name   text not null,   -- person they referred to us
  referral_date   date,            -- date the referral was sent
  cash_collected  numeric default 0,  -- cash collected from the closed referral
  commission      numeric default 0,  -- commission owed to the referrer
  created_at      timestamptz not null default now()
);

create index if not exists referrals_date_idx on public.referrals (referral_date);

-- Service key bypasses RLS; enabling it locks out the public/anon API.
alter table public.referrals enable row level security;
