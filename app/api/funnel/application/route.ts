import { NextResponse } from 'next/server';
import { db } from '@/lib/kv';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

const GHL_API  = 'https://services.leadconnectorhq.com';
const GHL_PIT  = 'pit-afc28ad1-981b-4e50-98e7-14d09085cba5';
const GHL_LOC  = 'Y1mpgvgd2Sb5y2LE4PvE';
const GHL_HEAD = { Authorization: `Bearer ${GHL_PIT}`, Version: '2021-07-28', 'Content-Type': 'application/json' };

export async function POST(req: Request) {
  const body = await req.json();
  const {
    first_name, last_name, email, phone, guests,
    instagram, business_description,
    current_revenue, target_revenue, blocker,
    commitment, investment_range,
    watched_youtube, decision_maker,
    qualified, source = 'vsl',
    completed, last_step,
    /* attribution */
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, ttclid,
    traffic_source, referrer, landing_page,
  } = body;

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  // Partial saves capture drop-offs; only the final step (completed:true) fires CRM/GHL.
  const isComplete = completed === true;

  /* 1. Upsert into Supabase (undefined keys are dropped by JSON, so a partial
     save only writes the answers given so far). */
  const { data: appRow, error: dbErr } = await db()
    .from('vsl_applications')
    .upsert({
      email, first_name, last_name, phone, guests,
      instagram, business_description,
      current_revenue, target_revenue, blocker,
      commitment, investment_range, watched_youtube, decision_maker,
      qualified: isComplete ? qualified : undefined, source,
      completed: isComplete,
      last_step: typeof last_step === 'number' ? last_step : undefined,
      /* attribution columns */
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, gclid, ttclid,
      traffic_source, referrer, landing_page,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'email' })
    .select()
    .single();

  if (dbErr) console.error('[application] supabase:', dbErr.message);

  if (!isComplete) {
    return NextResponse.json({ ok: true, id: appRow?.id ?? null, partial: true });
  }

  /* 2. Upsert CRM lead from application */
  try {
    const igHandle = instagram ? instagram.replace(/^@/, '').trim() : null;
    const crmName = [first_name, last_name].filter(Boolean).join(' ').trim() || null;
    const noteParts: string[] = [];
    if (investment_range) noteParts.push(`${investment_range} investment range`);
    if (current_revenue)  noteParts.push(`${current_revenue} current revenue`);
    const crmNotes = noteParts.length ? noteParts.join(', ') : null;

    const crmRecord = {
      ig_handle: igHandle || undefined,
      name: crmName || undefined,
      // Contact details the applicant just gave us — without them Close has
      // nothing to dial and Kit has nobody to email.
      email: email || undefined,
      whatsapp: phone || undefined,
      revenue: current_revenue || undefined,
      source: 'inbound' as const,
      stage: qualified ? 'application_sent' : 'new',
      notes: crmNotes || undefined,
      updated_at: new Date().toISOString(),
    };

    let leadId: string | null = null;
    if (igHandle) {
      const { data } = await db()
        .from('crm_leads')
        .upsert(crmRecord, { onConflict: 'ig_handle' })
        .select('id')
        .maybeSingle();
      leadId = data?.id ?? null;
    } else {
      // No handle to dedupe on — match on email so a re-submitted application
      // updates the same lead instead of stacking up duplicates (which would
      // become duplicate leads in Close too).
      const { data: match } = await db().from('crm_leads').select('id').ilike('email', email).limit(1).maybeSingle();
      const { data } = match
        ? await db().from('crm_leads').update(crmRecord).eq('id', match.id).select('id').maybeSingle()
        : await db().from('crm_leads').insert(crmRecord).select('id').maybeSingle();
      leadId = data?.id ?? null;
    }
    // Mirror into Close right away (fire-and-forget — the cron sweep is the net).
    queueCloseSync(leadId, 'application');
    queueAlowareSync(leadId, 'application');
  } catch (crmErr) {
    console.error('[application] CRM upsert error:', crmErr);
  }

  /* 3. Build GHL tags */
  const qualTag = qualified === true  ? 'brand-architect-qualified'
                : qualified === false ? 'brand-architect-disqualified'
                : null;

  const sourceTags: string[] = [];
  if (traffic_source) sourceTags.push(`src-${traffic_source}`);
  if (utm_campaign)   sourceTags.push(`camp-${utm_campaign.slice(0, 40)}`);

  const tags = [
    'brand-architect-lead',
    `${source}-lead`,
    ...(qualTag ? [qualTag] : []),
    ...sourceTags,
  ];

  /* 4. Create / update GHL contact */
  try {
    await fetch(`${GHL_API}/contacts/`, {
      method: 'POST',
      headers: GHL_HEAD,
      body: JSON.stringify({
        locationId: GHL_LOC,
        firstName: first_name,
        lastName:  last_name,
        email, phone, tags,
        customFields: [
          { key: 'instagram_handle',     field_value: instagram },
          { key: 'business_description', field_value: business_description },
          { key: 'current_revenue',      field_value: current_revenue },
          { key: 'target_revenue',       field_value: target_revenue },
          { key: 'biggest_bottleneck',   field_value: blocker },
          { key: 'readiness',            field_value: commitment },
          { key: 'investment_range',     field_value: investment_range },
          { key: 'watched_youtube',      field_value: watched_youtube },
          { key: 'decision_maker',       field_value: decision_maker },
          { key: 'partner_emails',       field_value: guests },
          { key: 'funnel_source',        field_value: source },
          /* attribution */
          { key: 'utm_source',           field_value: utm_source },
          { key: 'utm_medium',           field_value: utm_medium },
          { key: 'utm_campaign',         field_value: utm_campaign },
          { key: 'utm_content',          field_value: utm_content },
          { key: 'utm_term',             field_value: utm_term },
          { key: 'fbclid',               field_value: fbclid },
          { key: 'gclid',                field_value: gclid },
          { key: 'traffic_source',       field_value: traffic_source },
          { key: 'referrer',             field_value: referrer },
          { key: 'landing_page',         field_value: landing_page },
        ].filter(f => f.field_value),
      }),
    });
  } catch (e) {
    console.error('[application] GHL error:', e);
  }

  return NextResponse.json({ ok: true, id: appRow?.id ?? null, qualified, traffic_source });
}
