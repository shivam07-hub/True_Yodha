import type { Metadata } from "next"
import { getAllIssues } from "@/lib/newsletter"
import { IssueCard } from "@/components/newsletter/issue-card"

export const metadata: Metadata = {
  title: "Myro Weekly — Free AI Hiring Intel",
  description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings. No fluff.",
  openGraph: {
    title: "Myro Weekly — Free AI Hiring Intel",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
    type: "website",
  },
}

export default async function NewsletterIndexPage() {
  const issues = await getAllIssues()
  const publishedIssues = issues.filter((i) => i.slug !== "_placeholder")

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px var(--tm-page-px)" }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10, opacity: 0.8 }}>
          Free · Weekly
        </div>
        <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 12 }}>
          Myro Weekly
        </h1>
        <p style={{ fontSize: 16, color: "var(--tm-text-muted)", lineHeight: 1.65, maxWidth: 540 }}>
          Free weekly hiring intel — no fluff. Real skill demand data from thousands of live job postings, delivered every week.
        </p>
      </div>

      {publishedIssues.length === 0 ? (
        <div style={{
          padding: "48px 32px", borderRadius: "var(--tm-radius-lg)",
          border: "1px solid var(--tm-border-soft)", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 16, color: "var(--tm-accent)", opacity: 0.4 }}>◉</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", marginBottom: 8 }}>First issue coming soon</div>
          <p style={{ fontSize: 14, color: "var(--tm-text-muted)" }}>
            Sign up to get notified when Issue 001 drops.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {publishedIssues.map((issue) => (
            <IssueCard key={issue.slug} issue={issue} />
          ))}
        </div>
      )}
    </div>
  )
}
