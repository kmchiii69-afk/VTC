"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/analytics/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setError("Incorrect password.");
      setLoading(false);
    }
  }

  const gold = "rgba(201,164,85,0.8)";
  const cream = "rgba(240,232,212,0.85)";
  const creamFaint = "rgba(240,232,212,0.45)";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050403",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'DM Sans', sans-serif",
      position: "relative",
    }}>
      {/* Mesh background — same radial as admin panel */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(201,164,85,0.06) 0%, transparent 70%)",
      }} />
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 50% 50% at 20% 80%, rgba(201,164,85,0.03) 0%, transparent 60%)",
      }} />

      <div style={{ width: "100%", maxWidth: 380, textAlign: "center", position: "relative", zIndex: 1 }}>
        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          padding: "44px 36px 40px",
        }}>
          {/* Logo mark */}
          <div style={{ width: 48, height: 48, margin: "0 auto 28px", position: "relative" }}>
            <svg width="48" height="48" viewBox="0 0 52 52" fill="none">
              <polygon points="26,2 50,14 50,38 26,50 2,38 2,14"
                fill="none" stroke="#C9A455" strokeWidth="1.5" opacity="0.5" />
              <polygon points="26,10 42,18 42,34 26,42 10,34 10,18"
                fill="#C9A455" opacity="0.1" />
              <polygon points="26,16 38,22 38,30 26,36 14,30 14,22"
                fill="#C9A455" opacity="0.65" />
              <polygon points="26,20 34,24 34,28 26,32 18,28 18,24"
                fill="#050403" />
            </svg>
            <div style={{ position: "absolute", inset: -10, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,164,85,0.12) 0%, transparent 70%)" }} />
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 26, fontWeight: 300,
            color: cream, letterSpacing: "0.04em",
            marginBottom: 4,
          }}>
            Analytics
          </div>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: "0.22em",
            color: gold, textTransform: "uppercase" as const,
            marginBottom: 36,
          }}>
            VTC
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access password"
              autoFocus
              required
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                color: cream,
                padding: "13px 16px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box" as const,
                transition: "border-color 200ms",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(201,164,85,0.4)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            />

            {error && (
              <div style={{ fontSize: 11, color: "#F0826D", letterSpacing: "0.06em" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              style={{
                padding: "13px",
                background: loading || !password ? "rgba(255,255,255,0.03)" : "rgba(201,164,85,0.12)",
                border: `1px solid ${loading || !password ? "rgba(255,255,255,0.06)" : "rgba(201,164,85,0.3)"}`,
                borderRadius: 10,
                color: loading || !password ? creamFaint : gold,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, fontWeight: 500,
                letterSpacing: "0.18em", textTransform: "uppercase" as const,
                cursor: loading || !password ? "default" : "pointer",
                transition: "all 200ms ease",
              }}
            >
              {loading ? "Verifying…" : "Unlock →"}
            </button>
          </form>

          <div style={{ marginTop: 28, fontSize: 10, color: "rgba(240,232,212,0.2)", letterSpacing: "0.1em" }}>
            Admins — log into the portal first, then return here
          </div>
        </div>
      </div>
    </div>
  );
}
