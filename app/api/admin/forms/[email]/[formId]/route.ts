import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getFormResponse, type FormId } from '@/lib/forms-store';
import { getForm } from '@/lib/onboarding-forms';
import { getUser } from '@/lib/kv';

type Params = { params: Promise<{ email: string; formId: string }> };

// Admin: read one member's submitted form answers (label + value pairs), for the
// "view submission" page the Discord ping links to.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email, formId } = await params;
  const decoded = decodeURIComponent(email);
  const form = getForm(formId);
  if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 404 });

  const [answers, profile] = await Promise.all([getFormResponse(decoded, formId as FormId), getUser(decoded)]);
  if (!answers) return NextResponse.json({ error: 'No submission found' }, { status: 404 });

  const items = form.fields.map((f) => ({ label: f.label, value: String(answers[f.id] ?? '').trim() || '—' }));
  return NextResponse.json({ title: form.title, email: decoded, name: profile?.name ?? null, items });
}
