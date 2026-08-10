-- CRM Phase 1: Lead database + touchpoint timeline
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_handle TEXT,
  whatsapp TEXT,
  has_whatsapp BOOLEAN DEFAULT FALSE,
  name TEXT,
  source TEXT CHECK (source IN ('ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'other')),
  icp_tier TEXT CHECK (icp_tier IN ('A', 'B', 'C', 'D')),
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

CREATE INDEX IF NOT EXISTS crm_leads_stage_idx ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS crm_leads_followup_idx ON crm_leads(next_followup_at);
CREATE INDEX IF NOT EXISTS crm_touchpoints_lead_id_idx ON crm_touchpoints(lead_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_crm_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_crm_leads_updated_at ON crm_leads;
CREATE TRIGGER set_crm_leads_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_crm_leads_updated_at();
