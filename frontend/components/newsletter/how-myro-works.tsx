import Link from "next/link"

/**
 * Canonical "below the line" product explainer. Renders once, by the template,
 * directly under the CTA divider — so the value zone above stays free of any
 * product pitch (editorial law). This is the ONLY place an issue talks about
 * what Myro is. Replaces the old per-issue free-text pitch paragraphs.
 */
export function HowMyroWorks() {
  return (
    <section
      aria-labelledby="how-myro-works-heading"
      style={{ marginTop: 24, paddingTop: 28, borderTop: "1px dashed var(--tm-border-soft)" }}
    >
      <div
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--tm-text-faint)", marginBottom: 8,
        }}
      >
        How Myro works
      </div>
      <h2
        id="how-myro-works-heading"
        style={{ fontSize: 17, fontWeight: 600, color: "var(--tm-text)", margin: "0 0 8px", lineHeight: 1.4 }}
      >
        Turn this market data into your next move
      </h2>
      <p style={{ fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.65, margin: 0 }}>
        Myro reads your CV and scores it across 10 career domains against live hiring demand —
        the same data behind this issue. You get your Myro Score, the roles you can land now, and
        the exact skills to close the gap.{" "}
        <Link href="/docs" style={{ color: "var(--tm-interactive)", textDecoration: "none" }}>
          See how it works →
        </Link>
      </p>
    </section>
  )
}
