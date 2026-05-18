"use client"

import Link from "next/link"
import { AppShell } from "@/components/app-shell"

const RESOURCES = [
  {
    href: "/newsletter",
    label: "Newsletter",
    kicker: "Myro Weekly",
    detail: "Weekly hiring intel, market maps, and skill-demand shifts.",
  },
  {
    href: "/about",
    label: "About us",
    kicker: "What Myro tracks",
    detail: "How the product reads live demand and turns it into career signals.",
  },
  {
    href: "/xp",
    label: "How to gain XP",
    kicker: "Earn and spend fairly",
    detail: "Forge skills, complete your diary, add LinkedIn, and build your CV.",
  },
] as const

const SHORTCUTS = [
  { href: "/home", label: "Dashboard", detail: "Today's mission control." },
  { href: "/market", label: "Intel", detail: "Live company + skill demand." },
  { href: "/skills", label: "Skills", detail: "Score, gaps, and the 12-domain map." },
  { href: "/cv", label: "CV Builder", detail: "Tailor a version per job." },
  { href: "/tracker", label: "Tracker", detail: "Applications by stage." },
] as const

export default function MyroPage() {
  return (
    <AppShell>
      <div style={{ padding: "32px 36px 72px", maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
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
            Myro · Career Intelligence
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              color: "var(--tm-text)",
              letterSpacing: 0,
              lineHeight: 1.1,
            }}
          >
            Welcome to Myro
          </h1>
          <p style={{ margin: "12px 0 0", maxWidth: 660, fontSize: 15, lineHeight: 1.65, color: "var(--tm-text-muted)" }}>
            Live hiring intelligence, your skill map, and a fair XP economy. Start with the resources below or jump into a
            workspace.
          </p>
        </header>

        <section aria-label="Myro resources" style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
                Resource shelf
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--tm-text)" }}>
                Learn how Myro works
              </h2>
            </div>
            <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
              Newsletter, product context, and XP rules live here.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {RESOURCES.map((resource) => (
              <Link
                key={resource.href}
                href={resource.href}
                style={{
                  display: "block",
                  minHeight: 124,
                  padding: "14px 16px",
                  borderRadius: "var(--tm-radius)",
                  border: "1px solid var(--tm-border-soft)",
                  background: "var(--tm-surface)",
                  color: "var(--tm-text)",
                  textDecoration: "none",
                  transition: "border-color var(--tm-dur) var(--tm-ease), background var(--tm-dur) var(--tm-ease)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--tm-accent-ring)"
                  e.currentTarget.style.background = "var(--tm-accent-wash)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--tm-border-soft)"
                  e.currentTarget.style.background = "var(--tm-surface)"
                }}
              >
                <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)", marginBottom: 8 }}>
                  {resource.kicker}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{resource.label}</div>
                <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--tm-text-faint)" }}>{resource.detail}</div>
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="Workspaces">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--tm-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 4 }}>
              Jump in
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--tm-text)" }}>
              Workspaces
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {SHORTCUTS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: "var(--tm-radius-sm)",
                  border: "1px solid var(--tm-border-soft)",
                  background: "rgba(255,255,255,0.02)",
                  color: "var(--tm-text)",
                  textDecoration: "none",
                  transition: "border-color var(--tm-dur) var(--tm-ease)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--tm-accent-ring)" }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--tm-border-soft)" }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>{s.detail}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}