"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"

const HOW_IT_WORKS = [
  { n: "01", title: "Upload your CV",        body: "We extract every skill you've built across your career." },
  { n: "02", title: "We scan the market",    body: "Thousands of live job postings, parsed daily for what companies actually need." },
  { n: "03", title: "See your skill map",    body: "Your skills vs market demand — ranked, scored, and honest." },
  { n: "04", title: "Log daily progress",    body: "The Career Diary captures what you learn each day and credits your skills." },
  { n: "05", title: "Watch your score rise", body: "Your Myro Score grows as you close the gap. Every entry counts." },
]

const PROBLEM_POINTS = [
  "Companies know which exact skills they're hiring for. You're guessing.",
  "AI is reshaping every role. Nobody's telling you which human skills survive.",
  "Your CV is a story. The market wants a skill map.",
]

export function AboutSection() {
  return (
    <section style={{ position: "relative", zIndex: 2 }}>

      {/* Hero */}
      <div style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "80px 24px 64px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
      }}>
        <div style={{
          width: 56, height: 56,
          background: "linear-gradient(135deg, var(--tm-accent), var(--tm-accent-pressed))",
          borderRadius: "var(--tm-radius-lg)",
          display: "flex", alignItems: "center", justifyContent: "center",
          filter: "drop-shadow(0 0 16px var(--tm-accent-glow))",
          marginBottom: 24,
        }}>
          <MyroLogo size={34} />
        </div>

        <h1 style={{
          fontSize: "clamp(2.25rem, 5vw, 3rem)",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1.08,
          color: "var(--tm-text)",
          margin: "0 0 12px",
        }}>
          Myro
        </h1>

        <p style={{
          fontSize: "clamp(1.1rem, 2vw, 1.35rem)",
          fontStyle: "italic",
          color: "var(--tm-text-muted)",
          margin: "0 0 16px",
          letterSpacing: "-0.01em",
        }}>
          See your next move clearly.
        </p>

        <p style={{
          fontSize: "var(--tm-fs-body)",
          color: "var(--tm-text-faint)",
          lineHeight: 1.65,
          maxWidth: 520,
          margin: "0 0 36px",
        }}>
          The intelligence platform that reads what companies are actually hiring for — and shows you exactly where you stand, what&apos;s missing, and what to do next.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href="/signup"
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 20px", height: 40,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 14, fontWeight: 600,
              color: "var(--tm-accent-fg)",
              background: "var(--tm-accent)",
              border: "1px solid var(--tm-accent)",
              textDecoration: "none",
              boxShadow: "0 0 20px var(--tm-accent-glow)",
              transition: "background var(--tm-dur-fast) var(--tm-ease), box-shadow var(--tm-dur-fast) var(--tm-ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--tm-accent-hover)"
              e.currentTarget.style.boxShadow = "0 0 32px var(--tm-accent-glow)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--tm-accent)"
              e.currentTarget.style.boxShadow = "0 0 20px var(--tm-accent-glow)"
            }}
          >
            Get started free →
          </Link>
          <Link
            href="/login"
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 20px", height: 40,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 14, fontWeight: 500,
              color: "var(--tm-text-muted)",
              background: "transparent",
              border: "1px solid var(--tm-border)",
              textDecoration: "none",
              transition: "color var(--tm-dur-fast) var(--tm-ease), border-color var(--tm-dur-fast) var(--tm-ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--tm-accent)"
              e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tm-text-muted)"
              e.currentTarget.style.borderColor = "var(--tm-border)"
            }}
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* Content sections */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px 80px", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* Problem */}
        <div style={{
          padding: "24px 24px",
          borderRadius: "var(--tm-radius-lg)",
          background: "var(--tm-warning-wash)",
          border: "1px solid var(--tm-border)",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--tm-warning)",
            marginBottom: 12,
          }}>
            The Problem We&apos;re Solving
          </div>
          <div style={{
            fontSize: "var(--tm-fs-heading)", fontWeight: 600,
            color: "var(--tm-text)", marginBottom: 16, lineHeight: 1.35,
          }}>
            The job market doesn&apos;t show you the full picture.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PROBLEM_POINTS.map((point, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--tm-warning)", marginTop: 6, flexShrink: 0,
                }} />
                <span style={{ fontSize: "var(--tm-fs-body)", color: "var(--tm-text-muted)", lineHeight: 1.6 }}>{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mission */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--tm-text-faint)",
            marginBottom: 14,
          }}>
            Our Mission
          </div>
          <blockquote style={{ borderLeft: "3px solid var(--tm-accent)", paddingLeft: 20, margin: 0 }}>
            <p style={{
              fontSize: "var(--tm-fs-heading)", fontWeight: 600,
              color: "var(--tm-text)", lineHeight: 1.55, marginBottom: 10,
            }}>
              Myro is the intelligence bridge between your skills and what the market actually needs — built on real hiring data from thousands of companies, updated daily.
            </p>
            <p style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", lineHeight: 1.6, margin: 0 }}>
              Every feature — the skill match, the diary, the score — exists to close one gap: the distance between where you are and where the market needs you to be.
            </p>
          </blockquote>
        </div>

        {/* How It Works */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--tm-text-faint)",
            marginBottom: 16,
          }}>
            How It Works
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.n}
                style={{
                  display: "flex", gap: 16, padding: "14px 18px",
                  borderRadius: "var(--tm-radius)",
                  background: "var(--tm-surface)",
                  border: "1px solid var(--tm-border-soft)",
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--tm-accent)", minWidth: 24, paddingTop: 2, flexShrink: 0,
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{ fontSize: "var(--tm-fs-body)", fontWeight: 500, color: "var(--tm-text)", marginBottom: 3 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: "var(--tm-fs-meta)", color: "var(--tm-text-faint)", lineHeight: 1.55 }}>
                    {step.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Separator into Intel pane */}
      <div style={{
        borderTop: "1px solid var(--tm-border-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "14px 24px",
        background: "var(--tm-surface-2)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--tm-accent)",
        }}>
          <span style={{ opacity: 0.6, color: "var(--tm-text-faint)" }}>↓</span>
          Live market signals
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: "0.08em",
            color: "var(--tm-text-faint)", textTransform: "uppercase",
          }}>
            · updated daily
          </span>
        </div>
      </div>

    </section>
  )
}
