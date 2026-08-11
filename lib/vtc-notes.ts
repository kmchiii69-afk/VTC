// Per-client AM notes & to-dos (the check-ins/action-items parity). Kept simple:
// a note is a line of text; a to-do is a note that can be checked off.

import { db, isMissingTable } from "@/lib/kv";

export const NOTES_TABLE = "vtc_notes";

export interface VtcNote {
  id: string;
  client_email: string;
  body: string;
  kind: "note" | "todo";
  done: boolean;
  author: string;
  created_at: string;
}

export async function listNotes(email: string): Promise<VtcNote[]> {
  try {
    const { data, error } = await db()
      .from(NOTES_TABLE)
      .select("*")
      .eq("client_email", email.toLowerCase().trim())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as VtcNote[];
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function addNote(email: string, body: string, kind: "note" | "todo", author: string): Promise<VtcNote> {
  const { data, error } = await db()
    .from(NOTES_TABLE)
    .insert({ client_email: email.toLowerCase().trim(), body, kind, author, done: false })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as VtcNote;
}

export async function toggleNote(id: string, done: boolean): Promise<void> {
  const { error } = await db().from(NOTES_TABLE).update({ done }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from(NOTES_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
