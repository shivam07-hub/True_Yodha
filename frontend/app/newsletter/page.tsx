import type { Metadata } from "next"
import Link from "next/link"
import { getAllIssues } from "@/lib/newsletter"
import { IssueCard } from "@/components/newsletter/issue-card"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro Weekly — Free AI Hiring Live Job Data",
  description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings. No fluff.",
  alternates: { canonical: `${BASE}/newsletter` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro Weekly — Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
    type: "website",
    url: `${BASE}/newsletter`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro Weekly — Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
  },
}

export default async function NewsletterIndexPage() {
  const issues = await getAllIssues()
  const publishedIssues = issues.filter((i) => i.slug !== "_placeholder")

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px var(--tm-page-px) 64px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", lineHeight: 1.1, marginBottom: 10 }}>
          Myro Weekly
        </h1>
        <p style={{ fontSize: 16, color: "var(--tm-text-muted)", lineHeight: 1.65, maxWidth: 560 }}>
          Every week, Myro reads thousands of fresh job postings and shares what stood out — as a newsletter.
        </p>
      </div>

      {publishedIssues.length === 0 ? (
        <div style={{
          padding: "48px 32px", borderRadius: "var(--tm-radius-lg)",
          border: "1px solid var(--tm-border-soft)", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 16, color: "var(--tm-interactive)", opacity: 0.4 }}>◉</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 8 }}>First issue coming soon</div>
          <p style={{ fontSize: 14, color: "var(--tm-text-muted)", marginBottom: 20 }}>
            Sign up to get notified when Issue 001 drops.
          </p>
          <Link href="/signup" style={{ display: "inline-flex", alignItems: "center", padding: "9px 20px", borderRadius: "var(--tm-radius-pill)", background: "var(--tm-interactive)", color: "var(--tm-interactive-fg)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            Sign up free →
          </Link>
        </div>
      ) : (
        <div className="nl-grid">
          <main style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--tm-border-soft)" }}>
            {publishedIssues.map((issue) => (
              <IssueCard key={issue.slug} issue={issue} />
            ))}
          </main>

          <aside className="nl-rail" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ padding: 20, borderRadius: "var(--tm-radius-lg)", background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)", boxShadow: "var(--tm-shadow-1)" }}>
              <div style={{ fontSize: 11, color: "var(--tm-interactive)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
                Get it weekly
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginTop: 6, letterSpacing: "var(--tm-tracking-tight)" }}>
                Hiring intel in your inbox
              </div>
              <p style={{ fontSize: 13, color: "var(--tm-text-muted)", lineHeight: 1.55, margin: "6px 0 16px" }}>
                Skill-demand data from thousands of live postings. Every week. No fluff.
              </p>
              <EmailSubscribe compact />
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
                What&apos;s inside
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {["Company hiring heatmaps", "Skill-gap analysis", "Real numbers, zero hype"].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--tm-text-muted)" }}>
                    <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--tm-interactive)", flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
