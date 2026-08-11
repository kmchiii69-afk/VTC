import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getClientByEmail } from "@/lib/airtable";

// Bridges the logged-in session to the client's Airtable record (read-only).
// The Airtable token stays server-side; the browser only ever sees this
// curated payload.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let record;
  try {
    record = await getClientByEmail(auth.email);
  } catch (err) {
    console.error("[vtc-client] airtable read failed:", err);
    return NextResponse.json({ error: "Could not reach the client system" }, { status: 502 });
  }

  if (!record) {
    // Logged in, but no matching client in Airtable yet.
    return NextResponse.json({ matched: false, email: auth.email });
  }

  const f = record.fields;
  return NextResponse.json({
    matched: true,
    email: auth.email,
    client: {
      name: f["Name"] ?? null,
      plan: f["Client Plan"] ?? null,
      deliveryStatus: f["Delivery Status (manual update)"] ?? null,
      billingStatus: f["Billing Status"] ?? null,
      onboardingStatus: f["Ob Status"] ?? null,
      ytChannelName: f["YT Channel Name"] ?? null,
      kickoffDate: f["Kickoff Date"] ?? null,
      renewalDate: f["📅 Renewal Date"] ?? null,
      // Onboarding checklist — the steps Jake's team tracks per client.
      onboarding: {
        ytAccess: f["YT Channel Access"] ?? "Pending",
        equipment: f["YT Equipment"] ?? "Pending",
        testVideo: f["Test Video"] ?? "Pending",
      },
    },
  });
}
