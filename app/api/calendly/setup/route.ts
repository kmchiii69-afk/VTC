import { NextResponse } from 'next/server';

const CAL_BASE   = 'https://api.calendly.com';
const WEBHOOK_URL = 'https://gohconsulting.app/api/webhooks/calendly';

function calHeaders() {
  return {
    Authorization: `Bearer ${process.env.CALENDLY_PAT}`,
    'Content-Type': 'application/json',
  };
}

export async function POST() {
  const pat = process.env.CALENDLY_PAT;
  if (!pat) return NextResponse.json({ error: 'CALENDLY_PAT not set' }, { status: 500 });

  /* 1. Get current user + org URI */
  const meRes = await fetch(`${CAL_BASE}/users/me`, { headers: calHeaders() });
  if (!meRes.ok) {
    const err = await meRes.text();
    return NextResponse.json({ error: 'failed to fetch /users/me', detail: err }, { status: 502 });
  }
  const me = await meRes.json();
  const userUri = me?.resource?.uri as string;
  const orgUri  = me?.resource?.current_organization as string;

  /* 2. List existing webhook subscriptions to avoid duplicates */
  const listRes = await fetch(
    `${CAL_BASE}/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`,
    { headers: calHeaders() }
  );
  const listData = await listRes.json().catch(() => ({ collection: [] }));
  const existing = (listData.collection ?? []) as { callback_url: string; uri: string }[];
  const alreadyExists = existing.some(w => w.callback_url === WEBHOOK_URL);

  if (alreadyExists) {
    return NextResponse.json({
      ok: true,
      message: 'Webhook already registered',
      userUri,
      orgUri,
    });
  }

  /* 3. Register webhook */
  const regRes = await fetch(`${CAL_BASE}/webhook_subscriptions`, {
    method: 'POST',
    headers: calHeaders(),
    body: JSON.stringify({
      url: WEBHOOK_URL,
      events: ['invitee.created', 'invitee.canceled'],
      organization: orgUri,
      user: userUri,
      scope: 'organization',
      signing_key: process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? undefined,
    }),
  });

  const regData = await regRes.json().catch(() => ({}));
  if (!regRes.ok) {
    return NextResponse.json({ error: 'webhook registration failed', detail: regData }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Webhook registered successfully',
    webhookUri: regData?.resource?.uri,
    userUri,
    orgUri,
  });
}

/* GET — check current webhook status */
export async function GET() {
  const pat = process.env.CALENDLY_PAT;
  if (!pat) return NextResponse.json({ error: 'CALENDLY_PAT not set' }, { status: 500 });

  const meRes = await fetch(`${CAL_BASE}/users/me`, { headers: calHeaders() });
  const me    = await meRes.json().catch(() => ({}));
  const orgUri = me?.resource?.current_organization as string;

  if (!orgUri) return NextResponse.json({ error: 'could not get org URI' }, { status: 502 });

  const listRes  = await fetch(
    `${CAL_BASE}/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`,
    { headers: calHeaders() }
  );
  const listData = await listRes.json().catch(() => ({ collection: [] }));

  return NextResponse.json({
    webhooks: listData.collection ?? [],
    targetUrl: WEBHOOK_URL,
    registered: (listData.collection ?? []).some(
      (w: { callback_url: string }) => w.callback_url === WEBHOOK_URL
    ),
  });
}
