import type { Metadata } from "next"
import Link from "next/link"
import { XpFairnessNote, XpGuideLists } from "@/components/xp/xp-guide-content"

export const metadata: Metadata = {
  title: "How Tokens Work | Myro",
  description: "Learn how Myro tokens are earned, where they are spent, and the fairness rules behind token-gated work.",
}

const quickActions = [
  { href: "/forge", label: "Practice a skill", detail: "Tokens accrue quietly while Practice runs in the background." },
  { href: "/cv", label: "Build your CV", detail: "Keep your baseline evidence current." },
  { href: "/market", label: "Use Live Job Data", detail: "Spend tokens only when heavier analysis completes." },
]

const principles = [
  "Tokens should support useful career work, not empty clicks.",
  "One-time profile rewards are paid once so the system stays fair.",
  "Spending should happen after Myro produces value, not before.",
]

export default function TokensPage() {
  return (
    <>
      <div style={{ padding: "32px 36px 72px", maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "var(--tm-font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--tm-text-faint)",
              marginBottom: 6,
            }}
          >
            TOKEN GUIDE
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              color: "var(--tm-text)",
              letterSpacing: 0,
              lineHeight: 1.15,
            }}
          >
            How tokens work
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 650, fontSize: 15, lineHeight: 1.65, color: "var(--tm-text-muted)" }}>
            Tokens keep expensive career intelligence fair. Earn them by improving your profile, practicing skills,
            and writing diary evidence.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
          aria-label="Token principles"
        >
          {principles.map((principle, index) => (
            <div
              key={principle}
              style={{
                padding: "14px 16px",
                borderRadius: "var(--tm-radius)",
                border: "1px solid var(--tm-border-soft)",
                background: "var(--tm-surface)",
              }}
            >
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-interactive)", marginBottom: 8 }}>
                0{index + 1}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--tm-text-muted)" }}>{principle}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius-lg)",
            padding: "22px 24px",
            marginBottom: 18,
          }}
        >
          <XpGuideLists />
        </section>

        <div style={{ marginBottom: 24 }}>
          <XpFairnessNote />
        </div>

        <section
          style={{
            background: "var(--tm-surface)",
            border: "1px solid var(--tm-border-soft)",
            borderRadius: "var(--tm-radius-lg)",
            padding: "18px 20px",
          }}
          aria-label="Start earning tokens"
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--tm-text)" }}>Start from here</h2>
            <span style={{ fontFamily: "var(--tm-font-mono)", fontSize: 11, color: "var(--tm-text-faint)" }}>
              Earn first, spend when the work completes
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-border-soft)",
                  background: "rgba(255,255,255,0.025)",
                  color: "var(--tm-text)",
                  textDecoration: "none",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{action.label}</div>
                <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--tm-text-faint)" }}>{action.detail}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
