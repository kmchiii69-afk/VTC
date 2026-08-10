import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { analyzeClosingCall, resolveCallOutcome } from '@/lib/ai/analyze';
import { writeWithOptionalColumns } from '@/lib/db-write';

interface ParsedCall {
  closer: string;
  setter: string;
  call_date: string;
  lead_name: string;
  live_call: string;
  outcome: string;
  product: string;
  cash_collected: number;
  revenue: number;
  call_link: string;
  call_notes: string;
  what_made_them_buy: string;
  next_steps: string;
}

const LABELS = [
  'Closer', 'Setter', 'Date of Call', 'Lead Name', 'Live Call',
  'Closed', 'Product', 'C\\.C', 'Rev', 'Call Link', 'Call Notes',
  'What Made Them Buy', 'Next Steps For Setting Team',
];

function extractField(block: string, label: string): string {
  const idx = LABELS.indexOf(label.replace('.', '\\.'));
  const nextLabels = LABELS.slice(idx + 1);
  const escapedLabel = label.replace(/\./g, '\\.');
  const lookahead = nextLabels.length
    ? `(?=${nextLabels.map((l) => `${l}:`).join('|')}|\\s*$)`
    : '';
  const rx = new RegExp(`${escapedLabel}:\\s*([\\s\\S]*?)${lookahead}`, 'i');
  return block.match(rx)?.[1]?.trim() ?? '';
}

function parseOutcome(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes('dq') || r.includes('disqualif')) return 'dq';
  if (r.includes('no show') || r.includes('no-show') || r.includes('didn\'t show') || r.includes('did not show')) return 'no_show';
  if (r === 'closed' || r.startsWith('closed') || r === 'yes') return 'closed';
  if (r.includes('no-close') || r.includes('no close')) return 'no_close';
  return 'unknown';
}

function parseAmount(raw: string): number {
  if (!raw || raw === '0' || raw === '-') return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseCallBlocks(raw: string): ParsedCall[] {
  const blocks = raw.split(/(?=^Closer:\s)/m).filter((b) => /^Closer:/i.test(b.trim()));
  return blocks.map((block) => ({
    closer: extractField(block, 'Closer'),
    setter: extractField(block, 'Setter'),
    call_date: extractField(block, 'Date of Call'),
    lead_name: extractField(block, 'Lead Name'),
    live_call: extractField(block, 'Live Call'),
    outcome: parseOutcome(extractField(block, 'Closed')),
    product: extractField(block, 'Product'),
    cash_collected: parseAmount(extractField(block, 'C\\.C')),
    revenue: parseAmount(extractField(block, 'Rev')),
    call_link: extractField(block, 'Call Link'),
    call_notes: extractField(block, 'Call Notes'),
    what_made_them_buy: extractField(block, 'What Made Them Buy'),
    next_steps: extractField(block, 'Next Steps For Setting Team'),
  }));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { raw, analyze = true } = await req.json();
  if (!raw?.trim()) return NextResponse.json({ error: 'raw text required' }, { status: 400 });

  const parsed = parseCallBlocks(raw);
  if (!parsed.length) return NextResponse.json({ error: 'No calls found — make sure the text starts with "Closer:"' }, { status: 400 });

  const { data: icpData } = await db()
    .from('icp_criteria').select('criteria').order('version', { ascending: false }).limit(1).single();
  const icpCriteria = (icpData?.criteria as Record<string, unknown>) ?? {};

  const results = [];

  for (const p of parsed) {
    const callId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const transcript = [
      p.call_notes,
      p.what_made_them_buy ? `What made them buy: ${p.what_made_them_buy}` : '',
      p.next_steps ? `Next steps: ${p.next_steps}` : '',
    ].filter(Boolean).join('\n\n');

    const { data: call, error: callErr } = await writeWithOptionalColumns('calls', {
      fathom_call_id: callId,
      lead_name: p.lead_name,
      closer: p.closer,
      setter: p.setter,
      call_date: p.call_date || null,
      outcome: p.outcome,
      // The Closed: field in the notes is a human's call — an "n/a DQ" logged
      // there must survive a later re-analysis.
      outcome_locked: p.outcome !== 'unknown',
      product: p.product,
      cash_collected: p.cash_collected,
      revenue: p.revenue,
      call_notes_text: p.call_notes,
      what_made_them_buy: p.what_made_them_buy,
      next_steps: p.next_steps,
      transcript,
      status: analyze ? 'pending' : 'analyzed',
      source: 'manual',
      call_type: 'closing',
      raw_payload: p,
    }, { optional: ['outcome_locked'] });

    if (callErr || !call) {
      results.push({ lead_name: p.lead_name, error: callErr?.message ?? 'Insert failed' });
      continue;
    }

    if (analyze && transcript.length > 50) {
      try {
        const analysis = await analyzeClosingCall(transcript, icpCriteria, p.outcome);

        // Skip internal/non-sales calls the AI recognizes from the notes.
        if (analysis.is_internal_call === true) {
          await db().from('calls').update({ status: 'internal' }).eq('id', call.id);
          results.push({ lead_name: p.lead_name, ok: true, internal: true });
          continue;
        }

        const { data: report } = await db()
          .from('icp_reports')
          .insert({
            call_id: call.id,
            icp_score: analysis.icp_score,
            close_likelihood: analysis.close_likelihood,
            pain_points: analysis.pain_points,
            call_summary: analysis.call_summary,
            next_step: analysis.next_step,
            full_analysis: analysis,
            analysis_type: 'closing',
            discord_sent: false,
          })
          .select()
          .single();

        const curName = (p.lead_name as string | undefined)?.trim();
        const useName = (!curName || curName === 'Unknown') && analysis.prospect_name?.trim()
          ? analysis.prospect_name.trim() : undefined;
        // Notes that didn't state an outcome fall back to the analysis — which
        // reads a showed-up-but-unqualified prospect as a DQ, not a no-close.
        const filled = p.outcome === 'unknown' ? resolveCallOutcome(analysis) : null;
        await db().from('calls').update({
          status: 'analyzed',
          ...(filled ? { outcome: filled } : {}),
          ...(useName ? { lead_name: useName } : {}),
        }).eq('id', call.id);
        results.push({ lead_name: useName || p.lead_name, report_id: report?.id, ok: true });
      } catch (err) {
        results.push({ lead_name: p.lead_name, error: String(err), ok: false });
      }
    } else {
      results.push({ lead_name: p.lead_name, ok: true });
    }
  }

  return NextResponse.json({ imported: results.length, results });
}
