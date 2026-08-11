"use client";

import { useState } from "react";

// Admin: provision VTC client logins from active Airtable clients.
// Dry-run preview first, then create for real. Calls the admin-guarded
// /api/admin/vtc/provision endpoint (reads Airtable, writes only to our DB).

const RED = "#F55A4E";
const DIM = "rgba(255,255,255,0.6)";

type Created = { email: string; password: string; plan: string | null };
type Result = {
  dryRun: boolean;
  activeClients: number;
  processed: number;
  summary: { wouldCreate: number; wouldTag: number; alreadySet: number; missingEmail: number };
  created: Created[];
  taggedOnly: string[];
};

export default function VtcProvisionPage() {
  const [preview, setPreview] = useState<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"preview" | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function call(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "run");
    setErr(null);
    try {
      const res = await fetch("/api/admin/vtc/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (res.status === 403) throw new Error("Admin access required. Log in as an admin.");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      if (dryRun) { setPreview(data); setResult(null); }
      else setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(245,87,78,0.18)",
    borderRadius: 14,
    padding: "20px 22px",
    marginBottom: 16,
  };
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: "12px 22px",
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${RED}66`,
    background: primary ? RED : "transparent",
    color: primary ? "#160404" : RED,
    fontWeight: 700,
    fontSize: 14,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(40px,7vw,72px) clamp(20px,5vw,32px)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: RED, marginBottom: 10 }}>
          VTC · Admin
        </div>
        <h1 style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Provision client logins
        </h1>
        <p style={{ color: DIM, lineHeight: 1.6, marginBottom: 24 }}>
          Reads <strong>active</strong> clients from Airtable and creates a login for anyone who doesn&apos;t have one
          yet, tagged by their plan. Run a dry run first to see what would happen — nothing is created until you confirm.
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button style={btn(false)} disabled={!!busy} onClick={() => call(true)}>
            {busy === "preview" ? "Checking…" : "Run dry run"}
          </button>
          {preview && preview.summary.wouldCreate > 0 && (
            <button style={btn(true)} disabled={!!busy} onClick={() => call(false)}>
              {busy === "run" ? "Provisioning…" : `Provision ${preview.summary.wouldCreate} account${preview.summary.wouldCreate === 1 ? "" : "s"}`}
            </button>
          )}
        </div>

        {err && <p style={{ color: RED, marginBottom: 16 }}>{err}</p>}

        {preview && !result && (
          <div style={card}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
              Dry run — preview only
            </div>
            {[
              ["Active clients in Airtable", preview.activeClients],
              ["Would create new logins", preview.summary.wouldCreate],
              ["Would add a plan tag (existing accounts)", preview.summary.wouldTag],
              ["Already set up", preview.summary.alreadySet],
              ["Skipped — no email", preview.summary.missingEmail],
            ].map(([k, v]) => (
              <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ color: DIM, fontSize: 14 }}>{k}</span>
                <span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            {preview.summary.wouldCreate === 0 && (
              <p style={{ color: DIM, marginTop: 14 }}>Nothing new to create — every active client already has a login.</p>
            )}
          </div>
        )}

        {result && (
          <div style={card}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: RED, marginBottom: 14 }}>
              Provisioned — {result.created.length} account{result.created.length === 1 ? "" : "s"} created
            </div>
            <p style={{ color: DIM, fontSize: 13, marginBottom: 14 }}>
              Copy these credentials and send them to each client (no auto-email set up yet). Passwords are shown once.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {result.created.map((c) => (
                <div key={c.email} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", background: "rgba(0,0,0,0.3)", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>
                  <span>{c.email}</span>
                  <span style={{ color: RED }}>{c.password}</span>
                </div>
              ))}
            </div>
            {result.taggedOnly.length > 0 && (
              <p style={{ color: DIM, fontSize: 12, marginTop: 12 }}>
                Also tagged {result.taggedOnly.length} existing account{result.taggedOnly.length === 1 ? "" : "s"} with their plan.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
