import { NextRequest } from 'next/server';
import { db } from '@/lib/kv';
import { basesFromHeaders, parseTwilioBody, toE164, validateTwilioRequest, twimlReject } from '@/lib/twilio';
import { findLeadByPhone, stampLeadCadence, stageLabelFor } from '@/lib/crm-leads';
import { cadencePatch, type CadenceLead } from '@/lib/crm-followup';

/**
 * Inbound SMS to our Twilio numbers — a lead texting back.
 *
 * Point the number's "A message comes in" webhook here (it ships pointing at
 * Twilio's demo auto-reply). We log the text on the lead's timeline and send
 * nothing back: an empty <Response/> means Twilio replies with silence.
 *
 * A text is activity, so it rolls the follow-up date exactly like a logged
 * touchpoint does.
 */

const PATH = '/api/webhooks/twilio/sms';

function xml(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * 'sms' is only a legal channel once supabase-crm-inbound.sql widens the check
 * constraint; until then the insert is retried as 'other' so the text is still
 * logged rather than dropped.
 */
async function logInboundText(leadId: string, content: string) {
  const row = { lead_id: leadId, direction: 'inbound', content };
  const first = await db().from('crm_touchpoints').insert({ ...row, channel: 'sms' });
  if (first.error) await db().from('crm_touchpoints').insert({ ...row, channel: 'other' }).then(() => {}, () => {});
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return xml(twimlReject(), 403);
  }

  const from = toE164(params.From || '') || params.From || '';
  const lead = from ? await findLeadByPhone(from) : null;
  // Nothing to attach it to — an unknown number texting in isn't a CRM record.
  if (!lead) return xml(EMPTY);

  const body = (params.Body || '').trim();
  const media = parseInt(params.NumMedia || '0', 10) || 0;
  const content = [body, media ? `[${media} attachment${media > 1 ? 's' : ''}]` : '']
    .filter(Boolean).join(' ') || '[empty message]';

  await logInboundText(lead.id, content.slice(0, 2000));

  // select('*') so the read still works before the cadence columns exist.
  const { data: row } = await db().from('crm_leads').select('*').eq('id', lead.id).single();
  if (row) {
    const stageLbl = await stageLabelFor(row.pipeline_id as string | null, row.stage as string);
    await stampLeadCadence(lead.id, cadencePatch(row as unknown as CadenceLead, { stageLabel: stageLbl, activity: true }));
  }

  return xml(EMPTY);
}
