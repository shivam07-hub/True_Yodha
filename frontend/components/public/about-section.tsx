"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"

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
          filter: "drop-shadow(0 0 16px var(--tm-accent-glow))",
          marginBottom: 24,
        }}>
          <MyroLogo size={56} />
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
          fontWeight: 600,
          color: "var(--tm-text)",
          margin: "0 0 12px",
          letterSpacing: "-0.02em",
          lineHeight: 1.3,
        }}>
          Know the skills. Close the gap. Land the role.
        </p>

        <p style={{
          fontSize: "var(--tm-fs-body)",
          color: "var(--tm-text-faint)",
          lineHeight: 1.65,
          maxWidth: 520,
          margin: "0 0 36px",
        }}>
          Upload your CV. See exactly where your skills stand against what the market wants — then get matched to roles you can realistically land today.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <a
            href="#intel"
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
            See how it works ↓
          </a>
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

      {/* Bridge into Intel */}
      <div style={{
        borderTop: "1px solid var(--tm-border-soft)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "14px 24px",
        background: "var(--tm-surface-2)",
      }}>
        <p style={{
          fontSize: 14, fontWeight: 500,
          color: "var(--tm-text-faint)",
          margin: 0, letterSpacing: "0.01em",
        }}>
          Pulled directly from company career pages. Every day.
        </p>
      </div>

    </section>
  )
}
