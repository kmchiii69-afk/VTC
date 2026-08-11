import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

// Returns the signed-in user's role + team seat, for client-side home routing.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ role: auth.role, teamRole: auth.teamRole ?? null });
}
