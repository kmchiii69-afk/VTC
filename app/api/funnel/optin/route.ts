import { NextResponse } from 'next/server';
import { db } from '@/lib/kv';
import { kitSubscribe } from '@/lib/kit';
import { notifyNewLead } from '@/lib/discord';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

// The "Freebie Leads" pipeline id, resolved lazily and cached per instance
// (only cache a real hit, so it self-heals once the pipeline is created).
let freebiePipelineId: string | null = null;
async function getFreebiePipelineId(): Promise<string | null> {
  if (freebiePipelineId) return freebiePipelineId;
  try {
    const { data } = await db().from('crm_pipelines').select('id').eq('name', 'Freebie Leads').limit(1).maybeSingle();
    if (data?.id) freebiePipelineId = data.id;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// Per-funnel routing for the opt-in entry gates (clipping / buyer-mirror). Both
// are lead-magnet "freebie" opt-ins: they email the lead via Kit, ping a shared
// Discord leads channel, and create a CRM lead for everyone who opts in.
//   discordTitle — "New lead · <title>" ping (undefined = no ping)
//   crm          — 'always' = CRM lead for everyone; 'qualified' = only strong
//                  leads (makes money from content AND cash > Under $10k)
//   kit          — subscribe to Kit so its automation emails the freebie
//   kitSeqEnv / kitFormEnv — env vars holding this funnel's Kit sequence/form id
const FUNNELS: Record<string, {
  discordTitle?: string;
  crm: 'always' | 'qualified';
  kit: boolean;
  kitSeqEnv?: string;
  kitFormEnv?: string;
}> = {
  'clipping':     { discordTitle: 'Clipping SOP', crm: 'always', kit: true, kitSeqEnv: 'KIT_CLIPPING_SEQUENCE_ID',    kitFormEnv: 'KIT_CLIPPING_FORM_ID' },
  'buyer-mirror': { discordTitle: 'Buyer Mirror', crm: 'always', kit: true, kitSeqEnv: 'KIT_BUYERMIRROR_SEQUENCE_ID', kitFormEnv: 'KIT_BUYERMIRROR_FORM_ID' },
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    funnel = '',
    first_name, phone, email, instagram,
    making_money, coaching_business, monthly_cash,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, ttclid, traffic_source, referrer, landing_page,
  } = body;

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
  const cfg = FUNNELS[funnel] ?? { crm: 'qualified' as const, kit: false };

  // A "qualified" lead: makes money from content AND collects more than $10k/mo.
  const qualified = making_money === 'Yes I do' && !!monthly_cash && monthly_cash !== 'Under $10k';

  /* 1. Store the opt-in (best-effort — table may not exist yet). */
  try {
    await db().from('freebie_optins').upsert({
      email, funnel, first_name, phone, instagram,
      making_money, coaching_business, monthly_cash,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, gclid, ttclid, traffic_source, referrer, landing_page,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'email' });
  } catch (e) {
    console.error(`[optin:${funnel}] supabase store:`, e);
  }

  /* 2. CRM lead — always, or only for qualified leads, per funnel config.
     New opt-ins land in the "Freebie Leads" pipeline at the "Opt-Ins" stage.
     If the lead already exists we MERGE (union tags, fill blanks) and leave
     their stage/pipeline alone — an opt-in must never drag a lead backwards. */
  if (cfg.crm === 'always' || qualified) {
    try {
      const igHandle = instagram ? String(instagram).replace(/^@/, '').trim() : null;
      const cleanEmail = email ? String(email).trim() : null;
      const notes = [
        cleanEmail && `Email: ${cleanEmail}`,
        phone && `Phone: ${phone}`,
        making_money && `Making money from content: ${making_money}`,
        coaching_business && `Coaching business: ${coaching_business}`,
        monthly_cash && `Monthly cash: ${monthly_cash}`,
        `Funnel: ${funnel}`,
      ].filter(Boolean).join(' · ') || null;
      // Tags: freebie source + qualification. (Makes-money is its own column.)
      const tags = [
        funnel,
        qualified ? 'qualified' : 'disqualified',
      ].filter(Boolean) as string[];
      // Normalize the "making money from content" answer to Yes/No.
      const makesMoney = making_money ? (making_money === 'Yes I do' ? 'Yes' : 'No') : null;

      // Find an existing lead by IG handle, else by email.
      const cols = 'id, name, email, whatsapp, revenue, status, makes_money, tags';
      let match: { id: string; name: string | null; email: string | null; whatsapp: string | null; revenue: string | null; status: string | null; makes_money: string | null; tags: string[] | null } | null = null;
      if (igHandle) {
        const { data } = await db().from('crm_leads').select(cols).eq('ig_handle', igHandle).limit(1).maybeSingle();
        match = data ?? null;
      }
      if (!match && cleanEmail) {
        const { data } = await db().from('crm_leads').select(cols).eq('email', cleanEmail).limit(1).maybeSingle();
        match = data ?? null;
      }

      if (match) {
        const patch: Record<string, unknown> = {
          tags: Array.from(new Set([...(match.tags || []), ...tags])),
          updated_at: new Date().toISOString(),
        };
        if (!match.name && first_name) patch.name = first_name;
        if (!match.email && cleanEmail) patch.email = cleanEmail;
        if (!match.whatsapp && phone) patch.whatsapp = phone;
        if (!match.revenue && monthly_cash) patch.revenue = monthly_cash;
        if (!match.status) patch.status = qualified ? 'Qualified' : 'DQ';
        if (!match.makes_money && makesMoney) patch.makes_money = makesMoney;
        await db().from('crm_leads').update(patch).eq('id', match.id);
        // Mirror into Close so the setter can dial straight away (fire-and-forget:
        // the cron sweep catches it if Close is unreachable right now).
        queueCloseSync(match.id, `optin:${funnel}`);
        queueAlowareSync(match.id, `optin:${funnel}`);
      } else {
        const { data: created } = await db().from('crm_leads').insert({
          ig_handle: igHandle || null,
          name: first_name || null,
          email: cleanEmail,
          whatsapp: phone || null,
          revenue: monthly_cash || null,
          status: qualified ? 'Qualified' : 'DQ',
          makes_money: makesMoney,
          source: 'freebie',
          stage: 'opt_ins',
          pipeline_id: await getFreebiePipelineId(),
          tags,
          notes,
          updated_at: new Date().toISOString(),
        }).select('id').maybeSingle();
        queueCloseSync(created?.id, `optin:${funnel}`);
        queueAlowareSync(created?.id, `optin:${funnel}`);
      }
    } catch (e) {
      console.error(`[optin:${funnel}] CRM upsert:`, e);
    }
  }

  /* 3. Discord "new lead" ping to the shared team leads channel. */
  if (cfg.discordTitle) {
    const posted = await notifyNewLead({
      channelId: process.env.DISCORD_LEADS_CHANNEL_ID || '',
      mentionId: process.env.DISCORD_LEADS_MENTION_ID,
      title: cfg.discordTitle,
      name: first_name, email, instagram, phone,
      makingMoney: making_money, coachingBiz: coaching_business, monthlyCash: monthly_cash,
    });
    if (!posted) console.warn(`[optin:${funnel}] Discord lead ping not sent (check bot access to DISCORD_LEADS_CHANNEL_ID)`);
  }

  /* 4. Kit subscribe → Kit's automation emails the freebie. */
  let kit: { ok: boolean; skipped?: boolean } = { ok: false, skipped: true };
  if (cfg.kit) {
    kit = await kitSubscribe({
      email,
      firstName: first_name,
      sequenceId: cfg.kitSeqEnv ? process.env[cfg.kitSeqEnv] : undefined,
      formId: cfg.kitFormEnv ? process.env[cfg.kitFormEnv] : undefined,
    });
    if (!kit.ok && !kit.skipped) console.error(`[optin:${funnel}] Kit subscribe failed`);
  }

  return NextResponse.json({ ok: true, qualified, kit: kit.ok ? 'subscribed' : (kit.skipped ? 'not_configured' : 'error') });
}
