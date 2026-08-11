import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAllClientStates } from "@/lib/vtc-clients";
import { listNotes, addNote, toggleNote, deleteNote } from "@/lib/vtc-notes";

// Per-client AM notes & to-dos. Admin sees any client; an AM only their pod.

export const dynamic = "force-dynamic";

function emailFromPath(req: NextRequest): string {
  // /api/admin/clients/<email>/notes
  const parts = req.nextUrl.pathname.split("/");
  const i = parts.indexOf("clients");
  return decodeURIComponent(parts[i + 1] || "").toLowerCase().trim();
}

async function guard(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || (auth.role !== "admin" && auth.teamRole !== "am")) return null;
  const email = emailFromPath(req);
  if (!email) return null;
  if (auth.role !== "admin") {
    const states = await getAllClientStates();
    if (states.get(email)?.account_manager_email !== auth.email.toLowerCase().trim()) return null;
  }
  return { auth, email };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ notes: await listNotes(g.email) });
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { body?: string; kind?: "note" | "todo" } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  const note = await addNote(g.email, text, body.kind === "todo" ? "todo" : "note", g.auth.email);
  return NextResponse.json({ note });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req);
  if (!g) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { id?: string; done?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await toggleNote(body.id, !!body.done);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if (!g) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteNote(body.id);
  return NextResponse.json({ ok: true });
}
