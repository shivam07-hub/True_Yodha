"use client"

import Link from "next/link"
import { MyroLogo } from "@/components/myro-logo"

export function AboutSection() {
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
          maxWidth: 680,
          margin: "0 0 40px",
        }}>
          Upload your CV and see where your skills stand against live hiring demand, which gaps matter, and which roles are realistic now.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 48 }}>
          <a
            href="#intel"
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
            See how it works ↓
          </a>
          <Link
            href="/login"
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
            Sign in
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
          Pulled directly from company career pages. Every day.
        </p>
      </div>

    </section>
  )
}
