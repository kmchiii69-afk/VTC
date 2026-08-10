import { createHash } from "crypto";

export function isAuthed(token: string | undefined): boolean {
  const password = (process.env.ANALYTICS_PASSWORD || "").trim();
  if (!password || !token) return false;
  const expected = createHash("sha256").update(`ba-analytics:${password}`).digest("hex");
  return token === expected;
}
