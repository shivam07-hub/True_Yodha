"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"

export function AboutSection({
  primaryCtaHref = "/intel",
  primaryCtaLabel = "Open Intel",
}: {
  primaryCtaHref?: string
  primaryCtaLabel?: string
}) {
  return (
    <section style={{ position: "relative", zIndex: 2, width: "100%", minWidth: 0, overflow: "hidden", background: "linear-gradient(180deg, var(--tm-bg) 0%, var(--tm-surface-2) 100%)" }}>

      {/* Hero */}
      <div style={{
        maxWidth: 980,
        width: "100%",
        minWidth: 0,
        margin: "0 auto",
        minHeight: "calc(100dvh - 64px)",
        padding: "96px 24px 72px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}>
        <div style={{
          filter: "drop-shadow(0 16px 28px var(--tm-accent-glow))",
          marginBottom: 28,
        }}>
          <MyroLogo size={72} />
        </div>

        <h1 style={{
          fontFamily: "var(--tm-font-display)",
          fontSize: "var(--tm-fs-hero)",
          fontWeight: 600,
          letterSpacing: 0,
          lineHeight: "var(--tm-lh-hero)",
          color: "var(--tm-text)",
          margin: "0 0 8px",
        }}>
          Myro
        </h1>

        <p style={{
          fontSize: "var(--tm-fs-title)",
          fontWeight: 700,
          color: "var(--tm-text)",
          margin: "0 0 18px",
          letterSpacing: 0,
          lineHeight: "var(--tm-lh-title)",
          maxWidth: 760,
        }}>
          Career intelligence for people who are done guessing.
        </p>

        <p style={{
          fontSize: 20,
          color: "var(--tm-text-muted)",
          lineHeight: 1.55,
          maxWidth: 640,
          margin: "0 0 28px",
        }}>
          Upload your CV, get your Myro Score, see the skills the market wants, and know what to improve next.
        </p>

        <div
          aria-label="How Myro works"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            width: "100%",
            maxWidth: 720,
            marginBottom: 36,
          }}
        >
          {[
            ["1. Upload your CV", "Myro reads your current proof."],
            ["2. Compare to demand", "Live job data reveals the missing skills."],
            ["3. Act on the gap", "You get job matches and a sharper next move."],
          ].map(([label, body]) => (
            <div
              key={label}
              style={{
                padding: "16px 18px",
                borderRadius: "var(--tm-radius)",
                border: "1px solid var(--tm-border-soft)",
                background: "color-mix(in srgb, var(--tm-surface) 82%, transparent)",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tm-text)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--tm-text-faint)" }}>{body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 48 }}>
          <a
            href={primaryCtaHref}
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 24px", height: 50,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 16, fontWeight: 700,
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
            {primaryCtaLabel}
          </a>
          <Link
            href="/signup"
            style={{
              display: "inline-flex", alignItems: "center",
              padding: "0 22px", height: 50,
              borderRadius: "var(--tm-radius-pill)",
              fontSize: 16, fontWeight: 600,
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
            Sign up
          </Link>
        </div>

        <div
          aria-label="Myro evidence model"
          style={{
            width: "100%",
            maxWidth: 820,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            borderTop: "1px solid var(--tm-border-soft)",
            borderBottom: "1px solid var(--tm-border-soft)",
            background: "var(--tm-surface)",
          }}
        >
          {[
            ["Career pages", "Live roles pulled from company sources."],
            ["Skill demand", "Market language translated into readable signals."],
            ["Next move", "A focused path from current proof to target role."],
          ].map(([label, body]) => (
            <div key={label} style={{ padding: "18px 22px", textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tm-text)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, lineHeight: 1.45, color: "var(--tm-text-faint)" }}>{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bridge into Intel */}
      <div style={{
        borderTop: "1px solid var(--tm-border-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "14px 24px",
        background: "var(--tm-surface-2)",
      }}>
        <p style={{
          fontSize: 15, fontWeight: 600,
          color: "var(--tm-text-muted)",
          margin: 0, letterSpacing: 0,
        }}>
          Live market signals, without the research rabbit hole.
        </p>
      </div>

    </section>
  )
}
