import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getFormResponse, saveFormResponse, type FormId } from '@/lib/forms-store';
import { getForm } from '@/lib/onboarding-forms';
import { canAccessForm } from '@/lib/onboarding-variant';
import { logEvent } from '@/lib/journey';
import { getUser } from '@/lib/kv';
import { sendSubmissionNotice } from '@/lib/discord/notify';

// Which Discord channel webhook each form's submission notice goes to.
const FORM_WEBHOOK_ENV: Record<string, string> = {
  primary: 'DISCORD_ONBOARDING_FORM_WEBHOOK_URL',
  secondary: 'DISCORD_BUYER_MIRROR_WEBHOOK_URL',
  // The Creative Specialist onboarding form lands in the same channel as the
  // standard onboarding form unless it gets its own webhook.
  creative: 'DISCORD_CREATIVE_ONBOARDING_WEBHOOK_URL',
};

type Params = { params: Promise<{ formId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { formId } = await params;
  if (!getForm(formId)) return NextResponse.json({ error: 'Unknown form' }, { status: 404 });

  // The Creative Specialist form belongs to their onboarding only.
  const profile = await getUser(user.email);
  if (!canAccessForm(formId, profile?.features, profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const answers = await getFormResponse(user.email, formId as FormId);
  return NextResponse.json({ answers: answers ?? {}, submitted: !!answers });
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { formId } = await params;
  const form = getForm(formId);
  if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 404 });

  const profile = await getUser(user.email);
  // Submitting the Creative Specialist form requires being on that onboarding.
  // Admins may read a form (GET) but never submit one as a member.
  if (!canAccessForm(formId, profile?.features)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const answers = (body?.answers ?? {}) as Record<string, unknown>;
  // Keep only known field ids.
  const allowed = new Set(form.fields.map((f) => f.id));
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) if (allowed.has(k)) clean[k] = v;

  // Only notify on the FIRST submission, not on later edits.
  const alreadySubmitted = !!(await getFormResponse(user.email, formId as FormId));

  await saveFormResponse(user.email, formId as FormId, clean);
  await logEvent({
    clientEmail: user.email,
    type: 'form_submitted',
    title: `Submitted ${form.title}`,
    refTable: 'onboarding_form_responses',
    refId: formId,
  });

  if (!alreadySubmitted) {
    const profile = await getUser(user.email);
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await sendSubmissionNotice({
      webhookUrl: process.env[FORM_WEBHOOK_ENV[formId] ?? ''] || process.env.DISCORD_ONBOARDING_FORM_WEBHOOK_URL,
      who: profile?.name || user.email,
      label: form.title,
      link: `${appUrl}/admin/forms/${encodeURIComponent(user.email)}/${formId}`,
      linkLabel: 'View submission',
    });
  }
  return NextResponse.json({ ok: true });
}
