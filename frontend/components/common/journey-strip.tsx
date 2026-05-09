"use client"

import Link from "next/link"

interface Step {
  label: string
  href: string | null
  active?: boolean
}

const STEPS: Step[] = [
  { label: "Find job",  href: "/market",  active: false },
  { label: "See gap",   href: "/cv",      active: false },
  { label: "Forge",     href: null,       active: true  },
  { label: "Log",       href: null,       active: true  },
  { label: "Graph",     href: "/skills",  active: false },
  { label: "Tailor CV", href: "/cv",      active: false },
  { label: "Apply",     href: "/tracker", active: false },
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
            <span aria-hidden="true" style={{ fontSize: 9, color: "var(--tm-border)", margin: "0 5px", lineHeight: 1 }}>
              →
            </span>
          )}
          {step.active ? (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
              color: "var(--tm-accent)", whiteSpace: "nowrap",
              padding: "2px 7px", borderRadius: 99,
              background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-accent-ring)",
            }}>
              {step.label}
            </span>
          ) : step.href ? (
            <Link
              href={step.href}
              style={{
                fontSize: 10, fontWeight: 500, letterSpacing: "0.03em",
                color: "var(--tm-text-faint)", whiteSpace: "nowrap",
                textDecoration: "none", opacity: 0.65,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--tm-text-muted)" }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.65"; e.currentTarget.style.color = "var(--tm-text-faint)" }}
            >
              {step.label}
            </Link>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 500, color: "var(--tm-text-faint)", whiteSpace: "nowrap", opacity: 0.65 }}>
              {step.label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
