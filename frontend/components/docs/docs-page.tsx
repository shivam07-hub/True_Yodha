"use client"

import Link from "next/link"
import { PublicTopNav } from "@/components/public/top-nav"
import { PublicFooter } from "@/components/public/public-footer"
import { ScoringSection } from "@/components/docs/scoring-section"
import "./docs-page.css"
import {
  CVReadingSection,
  SkillLevelsSection,
  MatchingSection,
  XPSection,
  DataSection,
  FAQSection,
} from "@/components/docs/docs-sections"

// ── TOC ───────────────────────────────────────────────────────────────────────

const TOC = [
  { id: "scoring",      label: "Myro Score" },
  { id: "cv-reading",   label: "How your CV is read" },
  { id: "skill-levels", label: "Skill levels" },
  { id: "matching",     label: "Job matching" },
  { id: "tokens",       label: "Myro Coins & rewards" },
  { id: "data",         label: "Data & privacy" },
  { id: "faq",          label: "FAQ" },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export function DocsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--tm-bg)", color: "var(--tm-text)", display: "flex", flexDirection: "column" }}>
      <PublicTopNav active="docs" />

      {/* Hero */}
      <div style={{ borderBottom: "1px solid var(--tm-border-soft)", padding: "48px 32px 36px", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, var(--tm-int-bg-wash), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 820, margin: "0 auto", position: "relative" }}>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--tm-text)" }}>
            Methodology &amp; documentation
          </h1>
        </div>
      </div>

      {/* Body */}
      <div className="docs-body">

        {/* Sticky TOC — desktop only (hidden < 768px via docs-page.css) */}
        <nav aria-label="Page sections" className="docs-toc">
          <div style={{ fontSize: 10, fontFamily: "var(--tm-font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--tm-text-faint)", marginBottom: 8 }}>
            On this page
          </div>
          {TOC.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{ fontSize: 13, color: "var(--tm-interactive-rest)", textDecoration: "none", padding: "4px 0", fontFamily: "var(--tm-font-mono)", transition: "color 120ms" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--tm-interactive-rest)" }}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScoringSection />
          <CVReadingSection />
          <SkillLevelsSection />
          <MatchingSection />
          <XPSection />
          <DataSection />
          <FAQSection />

          {/* CTA */}
          <div style={{ borderTop: "1px solid var(--tm-border-soft)", paddingTop: 40, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--tm-text)", marginBottom: 8, letterSpacing: "-0.02em" }}>
              Choose your match.
            </div>
            <p style={{ fontSize: 14, color: "var(--tm-text-faint)", marginBottom: 20, margin: "0 0 20px" }}>
              One CV in. A tailored version for every role — you decide which to send.
            </p>
            <Link
              href="/signup"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: 99,
                background: "var(--tm-interactive)",
                color: "var(--tm-interactive-fg)",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Map my CV →
            </Link>
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  )
}
