import type { Metadata } from "next"
import Link from "next/link"
import { getAllIssues, type Issue, type IssueTheme } from "@/lib/newsletter"
import { IssueCard } from "@/components/newsletter/issue-card"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"
import styles from "./newsletter-index.module.css"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro Weekly - Free AI Hiring Live Job Data",
  description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings. No fluff.",
  alternates: { canonical: `${BASE}/newsletter` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Myro Weekly - Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
    type: "website",
    url: `${BASE}/newsletter`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Myro Weekly - Free AI Hiring Live Job Data",
    description: "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings.",
  },
}

const THEME_LABELS: Record<IssueTheme, string> = {
  heatmap: "Hiring heatmap",
  skill: "Skill of the week",
  trajectory: "Career trajectory",
  "boom-watch": "Boom watch",
  "future-of-work": "Future of work",
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function topicClusters(issues: Issue[]) {
  const clusters = new Map<IssueTheme, { count: number; latest: Issue }>()
  for (const issue of issues) {
    const current = clusters.get(issue.theme)
    if (!current) {
      clusters.set(issue.theme, { count: 1, latest: issue })
    } else {
      current.count += 1
    }
  }
  return Array.from(clusters.entries()).map(([theme, data]) => ({
    theme,
    label: THEME_LABELS[theme],
    count: data.count,
    latest: data.latest,
  }))
}

export default async function NewsletterIndexPage() {
  const issues = await getAllIssues()
  const publishedIssues = issues.filter((i) => i.slug !== "_placeholder")
  const [featuredIssue, ...archiveIssues] = publishedIssues
  const clusters = topicClusters(publishedIssues)
  const latestDate = featuredIssue ? formatDate(featuredIssue.publishedAt) : "Soon"

  return (
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <div className={styles.copy}>
          <p className={styles.kicker}>Free weekly hiring intel</p>
          <h1>Myro Weekly</h1>
          <p className={styles.copyText}>
            Fresh reads on company demand, skill gaps, and where hiring is moving across live career-page data.
          </p>
          {featuredIssue ? (
            <div className={styles.actions}>
              <Link href={`/newsletter/${featuredIssue.slug}`} className={styles.primaryLink}>
                Read latest
              </Link>
              <Link href="/signup?utm_source=newsletter_index" className={styles.secondaryLink}>
                Sign up
              </Link>
            </div>
          ) : null}
        </div>
        <div className={styles.stats} aria-label="Newsletter signals">
          <div>
            <strong>{publishedIssues.length}</strong>
            <span>issues</span>
          </div>
          <div>
            <strong>{latestDate}</strong>
            <span>latest</span>
          </div>
          <div>
            <strong>Weekly</strong>
            <span>cadence</span>
          </div>
        </div>
      </header>

      {!featuredIssue ? (
        <section className={styles.empty}>
          <div className={styles.emptyMark} aria-hidden="true" />
          <h2>First issue coming soon</h2>
          <p>Sign up to get notified when Issue 001 drops.</p>
          <Link href="/signup?utm_source=newsletter_index" className={styles.primaryLink}>
            Get notified
          </Link>
        </section>
      ) : (
        <div className={styles.grid}>
          <main className={styles.main}>
            <IssueCard issue={featuredIssue} featured />

            {archiveIssues.length > 0 && (
              <section aria-labelledby="newsletter-archive">
                <div className={styles.sectionHead}>
                  <h2 id="newsletter-archive">Latest issues</h2>
                  <span>{archiveIssues.length} more</span>
                </div>
                <div className={styles.archiveList}>
                  {archiveIssues.map((issue) => (
                    <IssueCard key={issue.slug} issue={issue} />
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className={styles.rail} aria-label="Newsletter briefing">
            <section className={styles.panel}>
              <p className={styles.panelKicker}>Get it weekly</p>
              <h2>Hiring intel in your inbox</h2>
              <EmailSubscribe compact />
            </section>

            {/* Topic clusters earn a panel only once the taxonomy is real
                (≥2 themes). One theme = a dead single-row list → hidden. */}
            {clusters.length > 1 && (
              <section className={styles.panel}>
                <p className={styles.panelKicker}>Topic clusters</p>
                <div className={styles.clusters}>
                  {clusters.map((cluster) => (
                    <Link key={cluster.theme} href={`/newsletter/${cluster.latest.slug}`} className={styles.cluster}>
                      <span>{cluster.label}</span>
                      <strong>{cluster.count}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <Link href="/signup?utm_source=newsletter_index" className={styles.primaryLink}>
              Get your Myro Score
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
