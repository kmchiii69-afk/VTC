import { db } from '@/lib/kv';
import { getForm, ONBOARDING_FORMS, formatFormForAI } from '@/lib/onboarding-forms';

// Storage + AI-formatting for native onboarding form responses. Non-throwing.

const TABLE = 'onboarding_form_responses';
const norm = (e: string) => e.toLowerCase().trim();

export type FormId = 'primary' | 'secondary' | 'creative';

export async function getFormResponse(email: string, formId: FormId): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await db().from(TABLE).select('answers').eq('client_email', norm(email)).eq('form_id', formId).maybeSingle();
    return (data?.answers as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

// Which forms a client has submitted, e.g. { primary: true, secondary: false }.
// 'creative' is the Creative Specialist onboarding form — the only one those
// members fill (see lib/onboarding-variant.ts).
export async function getSubmittedForms(email: string): Promise<Record<FormId, boolean>> {
  try {
    const { data } = await db().from(TABLE).select('form_id').eq('client_email', norm(email));
    const ids = new Set((data ?? []).map((r: { form_id: string }) => r.form_id));
    return { primary: ids.has('primary'), secondary: ids.has('secondary'), creative: ids.has('creative') };
  } catch {
    return { primary: false, secondary: false, creative: false };
  }
}

export async function saveFormResponse(email: string, formId: FormId, answers: Record<string, unknown>): Promise<void> {
  await db().from(TABLE).upsert(
    { client_email: norm(email), form_id: formId, answers, submitted_at: new Date().toISOString() },
    { onConflict: 'client_email,form_id' }
  );
}

// Combined readable text of a client's submitted forms, for AI context (CSM bot,
// content bot). Returns '' if none submitted.
export async function formatFormsForAI(email: string): Promise<string> {
  try {
    const { data } = await db().from(TABLE).select('form_id, answers').eq('client_email', norm(email));
    const rows = (data ?? []) as { form_id: string; answers: Record<string, unknown> }[];
    const blocks = rows
      .map((r) => {
        const form = getForm(r.form_id);
        return form ? formatFormForAI(form, r.answers) : '';
      })
      .filter(Boolean);
    return blocks.join('\n\n');
  } catch {
    return '';
  }
}

// Structured version of a client's submitted forms, for clean UI rendering
// (question / answer pairs grouped by form). Returns [] if none submitted.
export interface FormAnswer {
  id: string;
  label: string;
  help?: string;
  answer: string;
}
export interface FormResponseGroup {
  formId: string;
  title: string;
  items: FormAnswer[];
}
export async function getFormsStructured(email: string): Promise<FormResponseGroup[]> {
  try {
    const { data } = await db().from(TABLE).select('form_id, answers').eq('client_email', norm(email));
    const rows = (data ?? []) as { form_id: string; answers: Record<string, unknown> }[];
    // Keep a stable order: primary, secondary, then the Creative Specialist form.
    const order: Record<string, number> = { primary: 0, secondary: 1, creative: 2 };
    return rows
      .map((r): FormResponseGroup | null => {
        const form = getForm(r.form_id);
        if (!form) return null;
        const items = form.fields
          .map((f): FormAnswer | null => {
            const v = r.answers?.[f.id];
            if (v === undefined || v === null || v === '') return null;
            return { id: f.id, label: f.label, help: f.help, answer: String(v) };
          })
          .filter((x): x is FormAnswer => x !== null);
        return items.length ? { formId: form.id, title: form.title, items } : null;
      })
      .filter((x): x is FormResponseGroup => x !== null)
      .sort((a, b) => (order[a.formId] ?? 9) - (order[b.formId] ?? 9));
  } catch {
    return [];
  }
}

export { ONBOARDING_FORMS };
