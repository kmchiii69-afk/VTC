import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

// A pipeline stage: { key, label, color }. `key` is what's stored in
// crm_leads.stage; `label` is display; `color` drives the column accent.
export interface Stage { key: string; label: string; color: string }

const DEFAULT_COLORS = [
  '#8FD0FF', 'rgba(201,164,85,0.8)', '#4ade80', '#34d399',
  '#C9A8FF', '#BFFA46', 'rgba(240,232,212,0.4)', 'rgba(239,68,68,0.7)',
];

function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'stage';
}

// Normalize a stages payload into clean, de-duplicated {key,label,color} objects.
export function normalizeStages(input: unknown): Stage[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Stage[] = [];
  input.forEach((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const label = String(s.label ?? s.name ?? '').trim();
    if (!label) return;
    let key = slug(String(s.key ?? label));
    while (seen.has(key)) key = `${key}_${i}`;
    seen.add(key);
    const color = typeof s.color === 'string' && s.color.trim() ? s.color : DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    out.push({ key, label, color });
  });
  return out;
}

// GET /api/crm/pipelines — list all pipelines (ordered).
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await db()
    .from('crm_pipelines')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/crm/pipelines — create a pipeline.
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Pipeline name is required' }, { status: 400 });

  const stages = normalizeStages(b.stages);
  if (stages.length === 0) return NextResponse.json({ error: 'Add at least one stage' }, { status: 400 });

  // Place new pipelines last.
  const { data: existing } = await db().from('crm_pipelines').select('position').order('position', { ascending: false }).limit(1);
  const position = existing && existing.length ? (existing[0].position ?? 0) + 1 : 0;

  const { data, error } = await db()
    .from('crm_pipelines')
    .insert({ name, stages, position })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
