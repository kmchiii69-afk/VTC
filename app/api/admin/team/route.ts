import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAllUsers, updateUser } from "@/lib/kv";
import { isTeamRole } from "@/lib/vtc-roles";

// Admin: list members and assign each a team seat (team_role). Setting a seat
// takes effect on that member's NEXT login (the seat is stamped into the JWT).

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === "admin" ? auth : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await getAllUsers();
  return NextResponse.json({
    users: users.map((u) => ({ email: u.email, name: u.name, role: u.role, team_role: u.team_role ?? null })),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { email?: string; teamRole?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const teamRole = body.teamRole && isTeamRole(body.teamRole) ? body.teamRole : null;
  await updateUser(body.email, { team_role: teamRole });
  return NextResponse.json({ email: body.email.toLowerCase().trim(), team_role: teamRole });
}
