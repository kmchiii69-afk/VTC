import { NextResponse } from 'next/server';
import { db } from '@/lib/kv';

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_PIT = 'pit-afc28ad1-981b-4e50-98e7-14d09085cba5';
const GHL_LOCATION = 'Y1mpgvgd2Sb5y2LE4PvE';
const GHL_HEADERS = {
  Authorization: `Bearer ${GHL_PIT}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name, email, phone, businessType, revenue, target, bottleneck, readiness,
      source = 'funnel',
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, gclid, ttclid, traffic_source, referrer, landing_page,
    } = body;

    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const [firstName, ...rest] = (name || '').trim().split(' ');
    const lastName = rest.join(' ');

    /* Save to Supabase funnel_leads table */
    try {
      await db()
        .from('funnel_leads')
        .upsert({
          email,
          name: name || null,
          phone: phone || null,
          source,
          business_type: businessType || null,
          current_revenue: revenue || null,
          target_revenue: target || null,
          bottleneck: bottleneck || null,
          readiness: readiness || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          fbclid: fbclid || null,
          gclid: gclid || null,
          ttclid: ttclid || null,
          traffic_source: traffic_source || source,
          referrer: referrer || null,
          landing_page: landing_page || null,
          created_at: new Date().toISOString(),
        }, { onConflict: 'email' });
    } catch (dbErr) {
      console.error('[funnel/lead] supabase:', dbErr);
    }

    const qualTag = null;
    const tags = ['brand-architect-lead', `${source}-lead`, ...(qualTag ? [qualTag] : [])];

    /* Create or update contact in GHL */
    const ghlRes = await fetch(`${GHL_API}/contacts/`, {
      method: 'POST',
      headers: GHL_HEADERS,
      body: JSON.stringify({
        locationId: GHL_LOCATION,
        firstName,
        lastName,
        email,
        phone,
        tags,
        customFields: [
          { key: 'business_type', field_value: businessType },
          { key: 'revenue_current', field_value: revenue },
          { key: 'revenue_target', field_value: target },
          { key: 'biggest_bottleneck', field_value: bottleneck },
          { key: 'readiness', field_value: readiness },
          { key: 'funnel_source', field_value: source },
          { key: 'utm_source', field_value: utm_source },
          { key: 'utm_medium', field_value: utm_medium },
          { key: 'utm_campaign', field_value: utm_campaign },
          { key: 'traffic_source', field_value: traffic_source },
        ].filter((f) => f.field_value),
      }),
    });

    const ghlData = await ghlRes.json().catch(() => ({}));
    const contactId = ghlData?.contact?.id;

    const calLink = process.env.NEXT_PUBLIC_CAL_LINK || 'https://calendly.com/goh-consulting/1-1-strategy-call';

    return NextResponse.json({ ok: true, contactId, calLink });
  } catch (err) {
    console.error('[funnel/lead]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
