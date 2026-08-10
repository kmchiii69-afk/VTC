import { NextRequest } from 'next/server';
import { db } from '@/lib/kv';
import { basesFromHeaders, parseTwilioBody, validateTwilioRequest } from '@/lib/twilio';
import { stampLeadCadence, stageLabelFor } from '@/lib/crm-leads';
import { cadencePatch, type CadenceLead } from '@/lib/crm-followup';

/**
 * Per-leg status callbacks for the lead's side of a dial. This is the
 * authoritative source for answered / duration, and where a dial turns into CRM
 * bookkeeping: a touchpoint on the timeline, +1 Dials Made, and a cadence stamp
 * so the follow-up date rolls exactly as if the setter had pressed Log Follow-Up.
 */
const PATH = '/api/webhooks/twilio/status';

function fmtDuration(sec: number): string {
  if (sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = parseTwilioBody(raw);

  if (!validateTwilioRequest(req.headers.get('x-twilio-signature'), PATH, params, basesFromHeaders(req.headers))) {
    return new Response('forbidden', { status: 403 });
  }

  const childSid = params.CallSid || '';
  const parentSid = params.ParentCallSid || '';
  const status = params.CallStatus || 'unknown';
  const duration = parseInt(params.CallDuration || '0', 10) || 0;
  const terminal = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status);

  // The crm_calls row was created by the voice webhook against the PARENT sid.
  const { data: row } = await db()
    .from('crm_calls')
    .select('*')
    .eq('call_sid', parentSid)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    child_call_sid: childSid || null,
    status,
    answered: status === 'completed' && duration > 0,
    duration_sec: duration,
    ...(terminal ? { ended_at: new Date().toISOString() } : {}),
  };

  if (row) await db().from('crm_calls').update(patch).eq('id', row.id);
  else if (childSid) {
    // Voice-webhook insert failed or raced — don't lose the call record.
    await db().from('crm_calls').insert({
      call_sid: parentSid || childSid,
      to_number: params.To || 'unknown',
      from_number: params.From || null,
      ...patch,
    }).then(() => {}, () => {});
  }

  // Bookkeeping happens once, when the leg finishes.
  const leadId = row?.lead_id as string | null | undefined;
  if (terminal && leadId) {
    // The same callback finishes a forwarded inbound call (a lead ringing back),
    // which is activity but is NOT a dial — Dials Made must not count it.
    const inbound = row?.direction === 'inbound';
    const answered = status === 'completed' && duration > 0;
    const kind = inbound ? 'Inbound call' : 'Dialer call';
    const label = answered
      ? `${kind} · ${fmtDuration(duration)}`
      : `${kind} · ${status === 'completed' ? 'not answered' : status.replace('-', ' ')}`;

    await db().from('crm_touchpoints').insert({
      lead_id: leadId,
      channel: 'call',
      direction: inbound ? 'inbound' : 'outbound',
      content: label,
    }).then(() => {}, () => {});

    const { data: lead } = await db().from('crm_leads').select('*').eq('id', leadId).single();
    if (lead) {
      const stageLbl = await stageLabelFor(lead.pipeline_id as string | null, lead.stage as string);
      await stampLeadCadence(leadId, {
        ...cadencePatch(lead as unknown as CadenceLead, { stageLabel: stageLbl, activity: true }),
        ...(inbound ? {} : { dials_made: (Number(lead.dials_made) || 0) + 1 }),
      });
    }
  }

  // `null`, not '' — the Response constructor rejects a body on a 204, which
  // would turn a fully-successful callback into a 500 in Twilio's error log.
  return new Response(null, { status: 204 });
}
