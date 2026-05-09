"use client"

import Link from "next/link"

const GAPS = [
  { skill: "Product Strategy", demand: "Very High", level: "Not on CV" },
  { skill: "Go-to-Market Strategy", demand: "High", level: "Early stage" },
  { skill: "User Research & Discovery", demand: "Very High", level: "Early stage" },
]

const STRENGTHS = [
  { skill: "Data & Business Analysis", note: "PM teams rely on this daily to validate decisions." },
  { skill: "Stakeholder Management", note: "Non-negotiable for shipping product cross-functionally." },
  { skill: "Agile Project Management", note: "Translates vision into sprints engineering can execute." },
]

const SCORE = 62

export function SampleDiagnostic() {
  const pct = (SCORE / 100) * 100

  return (
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "80px 24px 96px" }}>

      {/* Section label */}
      <div style={{
        fontSize: 13, fontWeight: 700, letterSpacing: 0,
        textTransform: "uppercase", color: "var(--tm-text-faint)",
        marginBottom: 20,
      }}>
        Sample Diagnostic
      </div>

      {/* Editorial header */}
      <h2 style={{
        fontFamily: "var(--tm-font-display)",
        fontSize: "var(--tm-fs-display)",
        fontWeight: 600, letterSpacing: 0,
        lineHeight: "var(--tm-lh-display)", color: "var(--tm-text)",
        margin: "0 0 24px",
        maxWidth: 720,
      }}>
        What Myro found when Meera uploaded her CV
      </h2>

      {/* Narrative */}
      <p style={{
        fontSize: 18, color: "var(--tm-text-muted)",
        lineHeight: 1.7, margin: "0 0 36px", maxWidth: 700,
      }}>
        For four years, Meera has been the quiet engine at TCS — the analyst who turns
        complex client requirements into specs that engineering can actually ship. Now she
        wants the Product Manager title at a top MNC. The ambition is earned.
        Three skills are standing in the way.
      </p>

      {/* Visual anchor */}
      <div style={{
        borderRadius: "var(--tm-radius-lg)",
        border: "1px solid var(--tm-border)",
        background: "var(--tm-surface)",
        overflow: "hidden",
        marginBottom: 32,
      }}>

        {/* Score bar */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--tm-border-soft)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 0,
              textTransform: "uppercase", color: "var(--tm-text-faint)",
              marginBottom: 6,
            }}>
              Myro Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{
                fontSize: "2.25rem", fontWeight: 700,
                letterSpacing: 0, color: "var(--tm-accent)",
                lineHeight: 1,
              }}>
                {SCORE}
              </span>
              <span style={{ fontSize: 14, color: "var(--tm-text-faint)", fontWeight: 500 }}>/100</span>
            </div>
          </div>
          <div style={{ fontSize: 14, color: "var(--tm-text-faint)", maxWidth: 240, textAlign: "right", lineHeight: 1.5 }}>
            Approaching baseline for target role — strategic evidence needed to clear competitive thresholds.
          </div>
        </div>

        {/* Score progress bar */}
        <div style={{ height: 4, background: "var(--tm-border-soft)" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: "var(--tm-accent)",
            borderRadius: "0 2px 2px 0",
          }} />
        </div>

        {/* Two columns */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 0,
        }}>

          {/* Gaps */}
          <div style={{ padding: "24px 26px", borderRight: "1px solid var(--tm-border-soft)" }}>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 0,
              textTransform: "uppercase", color: "var(--tm-warning)",
              marginBottom: 14,
            }}>
              Bridge These Gaps
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {GAPS.map((g) => (
                <div key={g.skill}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tm-text)", marginBottom: 3 }}>
                    {g.skill}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, letterSpacing: 0,
                      textTransform: "uppercase",
                      padding: "2px 7px", borderRadius: 4,
                      background: g.demand === "Very High" ? "var(--tm-warning-wash)" : "var(--tm-surface-2)",
                      color: g.demand === "Very High" ? "var(--tm-warning)" : "var(--tm-text-faint)",
                      border: `1px solid ${g.demand === "Very High" ? "var(--tm-warning)" : "var(--tm-border-soft)"}`,
                    }}>
                      {g.demand} demand
                    </span>
                    <span style={{ fontSize: 13, color: "var(--tm-text-faint)" }}>· {g.level}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths */}
          <div style={{ padding: "24px 26px" }}>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: 0,
              textTransform: "uppercase", color: "var(--tm-success, #22c55e)",
              marginBottom: 14,
            }}>
              Leverage These
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {STRENGTHS.map((s) => (
                <div key={s.skill}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tm-text)", marginBottom: 3 }}>
                    {s.skill}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--tm-text-faint)", lineHeight: 1.55 }}>
                    {s.note}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Closing punch */}
      <p style={{
        fontSize: 18, fontWeight: 600,
        color: "var(--tm-text)", lineHeight: 1.6,
        margin: "0 0 28px",
        borderLeft: "3px solid var(--tm-accent)",
        paddingLeft: 16,
      }}>
        The PM role she wants is 3 skills away. Myro shows her exactly which three.
      </p>

      {/* CTA */}
      <Link
        href="/signup"
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
        See your own diagnostic →
      </Link>

    </section>
  )
}
