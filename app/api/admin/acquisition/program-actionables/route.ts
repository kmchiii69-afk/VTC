import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isAcqAdmin, listAcquisitionClients } from '@/lib/acquisition-admin';
import { notifyTasksAssigned } from '@/lib/discord';
import { createTodo, wasRecentlyAssigned } from '@/lib/todos';
import { isTodoCategory, isTodoPriority } from '@/lib/todo-shared';

export const dynamic = 'force-dynamic';

// Optional open-ended week number (null = unscheduled). undefined when absent,
// false when present-but-invalid.
function parseWeek(v: unknown): number | null | false {
  if (v == null || v === '') return null;
  const w = Number(v);
  return Number.isInteger(w) && w >= 1 && w <= 260 ? w : false;
}

// POST → an acq-admin adds ONE Program actionable to EVERY acquisition member's
// Program list (list='program'). This is the broadcast create for the Acquisition
// Dashboard's Program Actionables tab. Individual actionables are never broadcast.
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Action item text is required' }, { status: 400 });
  if (!isTodoCategory(body?.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  const priority = Number(body?.priority);
  if (body?.priority != null && !isTodoPriority(priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
  const week = parseWeek(body?.week);
  if (week === false) return NextResponse.json({ error: 'Invalid week' }, { status: 400 });

  const members = await listAcquisitionClients();
  const assigned_date = typeof body?.assigned_date === 'string' ? body.assigned_date : null;
  const due_date = typeof body?.due_date === 'string' ? body.due_date : null;

  let created = 0;
  const notified: { email: string; id: string }[] = [];
  for (const m of members) {
    const item = await createTodo({
      client_email: m.email,
      text,
      category: body.category,
      priority: isTodoPriority(priority) ? priority : undefined,
      assigned_date,
      due_date,
      list: 'program',
      week,
      created_by: auth.email,
      source: 'admin',
    });
    if (item) { created++; notified.push({ email: m.email, id: item.id }); }
  }

  // Ping each member's 1-1 channel that a Program actionable was assigned to
  // them — once per member, and not at all if they were pinged for a recent
  // assignment (a coach broadcasting several actionables in a row).
  await Promise.all(notified.map(async ({ email, id }) => {
    if (!await wasRecentlyAssigned(email, [id])) await notifyTasksAssigned(email);
  }));

  return NextResponse.json({ ok: true, created, members: members.length });
}
