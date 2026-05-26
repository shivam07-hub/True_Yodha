"use client"

import Link from "next/link"

interface Step {
  label: string
  href: string
}

const STEPS: Step[] = [
  { label: "Find job",  href: "/market" },
  { label: "See gap",   href: "/cv"     },
  { label: "Graph",     href: "/skills" },
  { label: "Tailor CV", href: "/cv"     },
]

export function JourneyStrip() {
  return (
    <div
      aria-label="Your job-search journey"
      style={{
        display: "flex", alignItems: "center", gap: 0,
        flexWrap: "nowrap", overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {STEPS.map((step, i) => (
        <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <span aria-hidden="true" style={{ fontSize: 9, color: "var(--tm-border)", margin: "0 5px", lineHeight: 1 }}>→</span>
          )}
          <Link
            href={step.href}
            style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
              color: "var(--tm-text-faint)", whiteSpace: "nowrap",
              textDecoration: "none",
              padding: "2px 8px", borderRadius: 99,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--tm-border-soft)",
              transition: "all 0.15s var(--tm-ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--tm-interactive)"
              e.currentTarget.style.borderColor = "var(--tm-int-border)"
              e.currentTarget.style.background = "var(--tm-int-bg-wash)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--tm-text-faint)"
              e.currentTarget.style.borderColor = "var(--tm-border-soft)"
              e.currentTarget.style.background = "rgba(255,255,255,0.03)"
            }}
          >
            {step.label}
          </Link>
        </div>
      ))}
    </div>
  )
}
