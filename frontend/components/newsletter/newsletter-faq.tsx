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
      className="nl-faq"
      style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--tm-border-soft)" }}
    >
      <h2 id="nl-faq-heading" className="nl-eyebrow" style={{ display: "block", fontSize: 13, margin: "0 0 16px" }}>
        Frequently asked
      </h2>
      <div>
        {items.map((item, i) => (
          <details key={i}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
