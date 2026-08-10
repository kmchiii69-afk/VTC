import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export const runtime = 'nodejs';

const SQL = `
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_handle TEXT,
  whatsapp TEXT,
  has_whatsapp BOOLEAN DEFAULT FALSE,
  name TEXT,
  source TEXT CHECK (source IN ('ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'freebie', 'other')),
  icp_tier TEXT,
  status TEXT,
  revenue TEXT,
  business TEXT,
  dials_made INTEGER,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN (
    'new', 'contacted', 'nurturing', 'application_sent',
    'call_booked', 'call_held', 'closed_won', 'closed_lost', 'ghosted'
  )),
  next_followup_at TIMESTAMPTZ,
  ai_summary TEXT,
  ai_next_move TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('ig_dm', 'whatsapp', 'call', 'email', 'other')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bring existing installs up to date (idempotent):
-- drop the old A/B/C/D constraint so icp_tier accepts free-text labels,
-- and add the qualification columns.
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_icp_tier_check;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS revenue TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS business TEXT;
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS dials_made INTEGER;
-- Allow 'freebie' as a lead source (widen the existing CHECK constraint).
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_source_check;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_source_check
  CHECK (source IN ('ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'freebie', 'other'));

CREATE INDEX IF NOT EXISTS crm_leads_stage_idx ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS crm_leads_followup_idx ON crm_leads(next_followup_at);
CREATE INDEX IF NOT EXISTS crm_touchpoints_lead_id_idx ON crm_touchpoints(lead_id);

CREATE OR REPLACE FUNCTION update_crm_leads_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_crm_leads_updated_at ON crm_leads;

CREATE TRIGGER set_crm_leads_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_crm_leads_updated_at();
`;

export async function POST() {
  const a = await getAuthUser();
  if (!a || a.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 });

  // Supabase exposes a direct SQL execution endpoint for service role keys
  const res = await fetch(`${url}/rest/v1/sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'text/plain',
      Prefer: 'return=minimal',
    },
    body: SQL,
  });

  if (res.ok) return NextResponse.json({ ok: true, message: 'Migration complete' });

  // Fallback: try the pg endpoint (older Supabase versions expose this differently)
  const text = await res.text().catch(() => '');
  return NextResponse.json({ ok: false, status: res.status, body: text }, { status: 500 });
}
