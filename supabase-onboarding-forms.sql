-- Native onboarding form responses (replaces the Typeform links). One row per
-- (client, form). answers is a jsonb map of field-id → value. Run once.

create table if not exists public.onboarding_form_responses (
  client_email text not null,
  form_id      text not null,            -- 'primary' | 'secondary'
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (client_email, form_id)
);
create index if not exists onboarding_form_responses_email_idx on public.onboarding_form_responses (client_email);
alter table public.onboarding_form_responses enable row level security;
