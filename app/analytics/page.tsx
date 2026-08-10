import { cookies } from "next/headers";
import { createHash } from "crypto";
import { verifyToken } from "@/lib/auth";
import PasswordGate from "./PasswordGate";
import Dashboard from "./Dashboard";
import "./jarvis.css";

export const metadata = { title: "Analytics · VTC" };

function isAnalyticsAuthed(token: string | undefined): boolean {
  const password = (process.env.ANALYTICS_PASSWORD || "").trim();
  if (!password || !token) return false;
  const expected = createHash("sha256").update(`ba-analytics:${password}`).digest("hex");
  return token === expected;
}

export default async function AnalyticsPage() {
  const cookieStore = await cookies();

  // Admins with a valid portal JWT bypass the analytics password gate
  const portalToken = cookieStore.get("ba_auth_token")?.value;
  if (portalToken) {
    const user = await verifyToken(portalToken);
    if (user?.role === "admin") return <Dashboard />;
  }

  // Fall back to analytics-specific password cookie
  const analyticsToken = cookieStore.get("ba_auth")?.value;
  if (isAnalyticsAuthed(analyticsToken)) return <Dashboard />;

  return <PasswordGate />;
}
