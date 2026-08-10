-- Native in-app contract signing (replaces the PandaDoc form links during
-- onboarding). Admins upload a PDF template per tier; clients read it, consent
-- to e-sign, and sign in-app. The signed PDF + a tamper-evidence audit record
-- (SHA-256, IP, device, consent, timestamp) are stored for legal defensibility.
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).

-- One uploaded template per contract tier ('14k' | '25k'). version bumps each
-- time an admin re-uploads, so signatures always reference the exact PDF signed.
create table if not exists public.contract_templates (
  tier text primary key,
  label text not null default '',
  storage_path text not null,            -- path in the private 'contracts' bucket
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- One row per signing event (append-only — never updated/deleted).
create table if not exists public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  tier text not null,
  template_version int not null default 1,
  signer_name text not null,
  signed_path text not null,             -- path to the generated signed PDF (private bucket)
  doc_sha256 text not null,              -- hash of the signed PDF (tamper evidence)
  ip text,
  user_agent text,
  consent text not null,                 -- the exact consent statement the signer agreed to
  signed_at timestamptz not null default now()
);
create index if not exists contract_signatures_email_idx on public.contract_signatures (client_email, signed_at desc);

-- RLS on, no policies — service-role server access only (same as the other tables).
do $$ declare t text; begin
  foreach t in array array['contract_templates','contract_signatures'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
