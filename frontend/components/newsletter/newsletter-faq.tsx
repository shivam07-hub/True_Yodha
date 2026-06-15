import type { IssueFaq } from "@/lib/newsletter"

interface NewsletterFAQProps {
  items: IssueFaq[]
}

/**
 * Visible FAQ accordion. Native <details> → zero client JS, keyboard-accessible,
 * answer text always in the DOM (the AEO requirement — AI engines and Google
 * parse on-page FAQ text, not schema-only). FAQPage JSON-LD is emitted from the
 * same `items` in the page so the two never drift.
 */
export function NewsletterFAQ({ items }: NewsletterFAQProps) {
  if (!items?.length) return null
  return (
    <section
      aria-labelledby="nl-faq-heading"
      style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--tm-border-soft)" }}
    >
      <h2
        id="nl-faq-heading"
        style={{
          fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--tm-text-faint)", margin: "0 0 16px",
        }}
      >
        Frequently asked
      </h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((item, i) => (
          <details
            key={i}
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--tm-border-soft)", padding: "14px 0" }}
          >
            <summary
              style={{
                fontSize: 16, fontWeight: 600, color: "var(--tm-text)", cursor: "pointer",
                listStyle: "none", lineHeight: 1.45,
              }}
            >
              {item.q}
            </summary>
            <p style={{ fontSize: 15, color: "var(--tm-text-muted)", lineHeight: 1.65, margin: "10px 0 0" }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}
