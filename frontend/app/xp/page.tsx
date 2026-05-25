import type { Metadata } from "next"
import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { XpFairnessNote, XpGuideLists } from "@/components/xp/xp-guide-content"
import { XP_POLICY } from "@/lib/xp-policy"

export const metadata: Metadata = {
  title: "How to Gain XP | Myro",
  description: "Learn how Myro XP is earned, where it is spent, and the fairness rules behind XP gates.",
}

const quickActions = [
  { href: "/skills", label: "Forge XP", detail: "Claim XP while Forge builds in the background." },
  { href: "/forge?diary=1", label: "Complete diary", detail: `Log progress for +${XP_POLICY.diaryEntry} XP per entry.` },
  { href: "/cv", label: "Build your CV", detail: "Keep your baseline evidence current." },
  { href: "/market", label: "Use Intel", detail: "Spend XP only when heavier analysis completes." },
]

const principles = [
  "XP should reward useful career work, not empty clicks.",
  "One-time profile rewards are paid once so the system stays fair.",
  "Spending should happen after Myro produces value, not before.",
]

export default function XpPage() {
  return (
    <AppShell>
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
            XP GUIDE
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
            How to gain XP
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 650, fontSize: 15, lineHeight: 1.65, color: "var(--tm-text-muted)" }}>
            XP keeps expensive career intelligence fair. Earn it by improving your profile, forging skills, writing diary
            evidence, and sharing Myro with other job seekers.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
          aria-label="XP principles"
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
          aria-label="Start earning XP"
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
    </AppShell>
  )
}
