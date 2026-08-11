"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// VTC client dashboard (Phase 2 MVP) — reads the logged-in client's live
// Airtable record via /api/me/vtc-client (read-only) and shows their plan +
// onboarding progress. Later phases add scripts/uploads/videos + team chat.

const RED = "#F55A4E";
const DIM = "rgba(255,255,255,0.6)";

type Onboarding = { ytAccess: string; equipment: string; testVideo: string };
type Client = {
  name: string | null;
  plan: string | null;
  deliveryStatus: string | null;
  billingStatus: string | null;
  onboardingStatus: string | null;
  ytChannelName: string | null;
  kickoffDate: string | null;
  renewalDate: string | null;
  onboarding: Onboarding;
};
type Resp = { matched: boolean; email: string; client?: Client };

const isDone = (s: string) => /done/i.test(s);

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ClientDashboard() {
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/vtc-client", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) {
          router.replace("/");
          return null;
        }
        if (!r.ok) throw new Error("Could not load your account");
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(245,87,78,0.18)",
    borderRadius: 16,
    padding: "22px 24px",
  };

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(40px,7vw,72px) clamp(20px,5vw,32px)" }}>
        {loading && <p style={{ color: DIM }}>Loading your account…</p>}
        {err && <p style={{ color: RED }}>{err}</p>}

        {data && !data.matched && (
          <div style={card}>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>You&apos;re logged in.</h1>
            <p style={{ color: DIM, lineHeight: 1.6 }}>
              We couldn&apos;t find a client record for <strong>{data.email}</strong> yet. If you just signed up,
              your account is still being set up — check back shortly or reach out to your team.
            </p>
          </div>
        )}

        {data && data.matched && data.client && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: RED, marginBottom: 10 }}>
              VTC · Client Portal
            </div>
            <h1 style={{ fontSize: "clamp(26px,4vw,36px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
              Welcome{data.client.name ? `, ${data.client.name.split(" ")[0]}` : ""}.
            </h1>
            <p style={{ color: DIM, marginBottom: 28 }}>
              {data.client.plan ?? "Your plan"}
              {data.client.deliveryStatus ? ` · ${data.client.deliveryStatus}` : ""}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
              {/* Onboarding checklist */}
              <div style={card}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
                  Onboarding
                </div>
                {[
                  { label: "YouTube channel access", value: data.client.onboarding.ytAccess },
                  { label: "Equipment check", value: data.client.onboarding.equipment },
                  { label: "Test video", value: data.client.onboarding.testVideo },
                ].map((step) => (
                  <div key={step.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: isDone(step.value) ? "rgba(245,87,78,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${isDone(step.value) ? RED : "rgba(255,255,255,0.15)"}`, color: isDone(step.value) ? RED : "rgba(255,255,255,0.3)" }}>
                        {isDone(step.value) ? "✓" : ""}
                      </span>
                      <span style={{ fontSize: 15 }}>{step.label}</span>
                    </div>
                    <span style={{ fontSize: 13, color: isDone(step.value) ? RED : DIM }}>{step.value}</span>
                  </div>
                ))}
              </div>

              {/* Account summary */}
              <div style={card}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
                  Account
                </div>
                {[
                  { k: "Plan", v: data.client.plan ?? "—" },
                  { k: "Delivery", v: data.client.deliveryStatus ?? "—" },
                  { k: "Billing", v: data.client.billingStatus ?? "—" },
                  { k: "YouTube channel", v: data.client.ytChannelName ?? "—" },
                  { k: "Kickoff", v: fmtDate(data.client.kickoffDate) },
                  { k: "Renewal", v: fmtDate(data.client.renewalDate) },
                ].map((row) => (
                  <div key={row.k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: DIM, fontSize: 14 }}>{row.k}</span>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 20 }}>
              Scripts, uploads, and team chat are coming next.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
