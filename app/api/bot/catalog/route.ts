import { NextRequest, NextResponse } from 'next/server';
import { SOPS, SOP_DRIVE_NAMES } from '@/lib/sops-os-data';
import { getResources } from '@/lib/resources';
import { getBetaTree } from '@/lib/ba-beta';
import { db } from '@/lib/kv';

// Read-only catalog for the external SOP-finder Discord bot. The bot pulls this
// hourly and folds modules / resources / app SOPs / recordings into the same
// Claude match it runs over its Google Drive SOPs, so one question can be
// answered with a link to any of them. Guarded by a shared secret (BOT_API_SECRET)
// — the bot sends it in the `x-bot-secret` header. All URLs are absolute so they
// work from inside Discord.

export const dynamic = 'force-dynamic';

const APP_URL = (process.env.APP_URL || 'https://gohconsulting.app').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const secret = process.env.BOT_API_SECRET;
  // Fail closed: if no secret is configured, the endpoint is disabled rather
  // than left wide open.
  if (!secret) {
    return NextResponse.json({ error: 'Bot API not configured' }, { status: 503 });
  }
  const provided = req.headers.get('x-bot-secret') || '';
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // VTC modules (the members' /modules catalog). No per-lesson deep
  // link exists, so every module link opens /modules; the category + title are
  // carried for matching and for the bot to show in its reply.
  //
  // `resources` carries the titles of anything attached to the lesson. A module
  // is otherwise just a title and a category, which loses every topical match to
  // a Drive SOP carrying 2500 chars of extracted PDF text — this is the only
  // extra matchable signal a video has.
  const betaTree = await getBetaTree().catch(() => null);
  const modules = (betaTree?.categories ?? []).flatMap((c) =>
    c.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      category: c.name,
      resources: (l.resources ?? []).map((r) => r.title).filter(Boolean),
      url: `${APP_URL}/modules`,
    })),
  );

  // Resources library (offer doc, PMF, referral program, etc.). Deep-links to
  // the exact resource inside the portal.
  const resourceRows = await getResources().catch(() => []);
  const resources = resourceRows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category,
    url: `${APP_URL}/portal?view=resources&resource=${encodeURIComponent(r.slug)}`,
  }));

  // In-app SOP library (the OS-style SOPs shown at /sops), linked by badge.
  //
  // `driveNames` is how the same document is filed in the bot's Drive folder. The
  // bot indexes Drive for PDF text but should reply with the portal link, so it
  // uses these to fold its Drive copy and this entry into one. Sent raw and
  // unnormalised — the bot owns the comparison, so there's no second normaliser
  // here to drift out of step with it.
  const sops = SOPS.map((s) => ({
    badge: s.badge,
    title: s.title,
    sub: s.sub,
    group: s.group,
    div: s.div,
    driveNames: SOP_DRIVE_NAMES[s.badge] ?? [],
    url: `${APP_URL}/sops?sop=${encodeURIComponent(s.badge)}`,
  }));

  // Recent call recordings, linked to their section page in the hub.
  let recordings: { id: string; title: string; category: string; url: string }[] = [];
  try {
    const { data } = await db()
      .from('call_recordings')
      .select('id, title, category, call_date')
      .order('call_date', { ascending: false })
      .limit(60);
    recordings = ((data ?? []) as { id: string; title: string | null; category: string | null }[])
      .filter((r) => r.title)
      .map((r) => ({
        id: r.id,
        title: r.title as string,
        category: (r.category as string) ?? '',
        url: `${APP_URL}/hub?s=${encodeURIComponent((r.category as string) ?? '')}&rec=${encodeURIComponent(r.id)}`,
      }));
  } catch {
    /* no recordings table — non-fatal */
  }

  return NextResponse.json({ base: APP_URL, modules, resources, sops, recordings });
}
