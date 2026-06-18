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
      <div className="nl-eyebrow" style={{ marginBottom: 8 }}>How Myro works</div>
      <h2 id="how-myro-works-heading" className="nl-callout-title" style={{ margin: "0 0 8px" }}>
        Turn this market data into your next move
      </h2>
      <p style={{ fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.65, margin: 0 }}>
        Myro reads your CV and scores it across 10 career domains against live hiring demand —
        the same data behind this issue. You get your Myro Score, the roles you can land now, and
        the exact skills to close the gap.{" "}
        <Link href="/docs" style={{ color: "var(--tm-accent-text)", textDecoration: "none", fontWeight: 600 }}>
          See how it works →
        </Link>
      </p>
    </section>
  )
}
