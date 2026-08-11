import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAuthUser } from "@/lib/auth";
import { getActiveClients } from "@/lib/airtable";
import { getUser, createUser, updateUser } from "@/lib/kv";

// Phase 3 — onboarding automation (read Airtable, write only to our own app).
// For each ACTIVE client in Airtable that has an email but no app account yet,
// create a login and tag it by their Client Plan. Idempotent: existing accounts
// are skipped (their plan tag is topped up if missing).
//
// Safety: dryRun defaults to TRUE — the first call just reports what it WOULD
// do. Pass { "dryRun": false } to actually provision. Optional { "limit": N }.
//
// Note: there's no transactional email provider wired up, so generated
// passwords are RETURNED here for the admin to distribute. Wire Resend (or
// similar) later to email them automatically.

function generatePassword(): string {
  // 9 url-safe chars — readable enough to send, strong enough as a temp password.
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { dryRun?: boolean; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → defaults */
  }
  const dryRun = body.dryRun !== false; // default true
  const limit = typeof body.limit === "number" ? body.limit : undefined;

  const clients = await getActiveClients();

  const created: { email: string; password: string; plan: string | null }[] = [];
  const taggedOnly: string[] = [];
  const skipped: string[] = [];
  const noEmail: string[] = [];

  let processed = 0;
  for (const rec of clients) {
    if (limit && processed >= limit) break;
    const email = (rec.fields.Email ?? "").toLowerCase().trim();
    const plan = rec.fields["Client Plan"] ?? null;
    const name = rec.fields.Name ?? "";
    if (!email) {
      noEmail.push(rec.id);
      continue;
    }

    const existing = await getUser(email);
    if (existing) {
      // Account already exists — make sure the plan tag is present.
      const tags = existing.tags ?? [];
      if (plan && !tags.includes(plan)) {
        if (!dryRun) await updateUser(email, { tags: [...tags, plan] });
        taggedOnly.push(email);
      } else {
        skipped.push(email);
      }
      processed++;
      continue;
    }

    // New client → create the login, tag by plan.
    const password = generatePassword();
    if (!dryRun) {
      await createUser({ email, password, name, role: "user" });
      await updateUser(email, { tags: plan ? [plan] : [] });
    }
    created.push({ email, password, plan });
    processed++;
  }

  return NextResponse.json({
    dryRun,
    activeClients: clients.length,
    processed,
    summary: {
      wouldCreate: created.length,
      wouldTag: taggedOnly.length,
      alreadySet: skipped.length,
      missingEmail: noEmail.length,
    },
    // Credentials for the accounts (to be) created. Distribute securely; wire an
    // email provider to send these automatically.
    created,
    taggedOnly,
  });
}
