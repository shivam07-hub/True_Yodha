import type { Metadata } from "next"
import Link from "next/link"
import { XpFairnessNote, XpGuideLists } from "@/components/xp/xp-guide-content"

export const metadata: Metadata = {
  title: "About Myro | Myro",
  description: "What Myro is, what it does, and how Myro Coins keep the career intelligence engine fair.",
}

const whatMyroDoes = [
  { href: "/cv", label: "Reads your CV", detail: "Extracts real skills and levels — no self-rating." },
  { href: "/market", label: "Matches live jobs", detail: "Ranks openings against your CV, not keywords." },
  { href: "/practice", label: "Grows your Myro Score", detail: "Practice sessions close real skill gaps." },
  { href: "/collections", label: "Tracks every application", detail: "One tailored CV per job, every attempt kept." },
]

const quickActions = [
  { href: "/practice", label: "Practice a skill", detail: "Myro Coins accrue quietly while Practice runs in the background." },
  { href: "/cv", label: "Build your CV", detail: "Keep your baseline evidence current." },
  { href: "/market", label: "Use Live Job Data", detail: "Spend Myro Coins only when heavier analysis completes." },
]

const principles = [
  "Myro Coins should support useful career work, not empty clicks.",
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
            MYRO · CAREER INTELLIGENCE
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
            About Myro
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 650, fontSize: 15, lineHeight: 1.65, color: "var(--tm-text-muted)" }}>
            Myro reads your CV, matches it against live hiring demand, and tells you exactly what to fix to get hired —
            backed by a fair coin economy so the heavy analysis stays sustainable.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 32,
          }}
          aria-label="What Myro does"
        >
          {whatMyroDoes.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                minHeight: 108,
                padding: "14px 16px",
                borderRadius: "var(--tm-radius)",
                border: "1px solid var(--tm-border-soft)",
                background: "var(--tm-surface)",
                color: "var(--tm-text)",
                textDecoration: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--tm-text-faint)" }}>{item.detail}</div>
            </Link>
          ))}
        </section>

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
          MYRO COIN GUIDE
        </div>
        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 20,
            fontWeight: 800,
            color: "var(--tm-text)",
          }}
        >
          How Myro Coins work
        </h2>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
          aria-label="Myro Coin principles"
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
          aria-label="Start earning Myro Coins"
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
