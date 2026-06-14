import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getAllIssues, getIssueBySlug } from "@/lib/newsletter"
import { NewsletterCTA } from "@/components/newsletter/issue-cta"
import { ChartEmbed } from "@/components/newsletter/chart-embed"
import { ReadingProgress } from "@/components/newsletter/reading-progress"
import { ShareButton } from "@/components/newsletter/share-button"
import { NewsletterBackLink } from "@/components/newsletter/back-link"
import { TldrCard } from "@/components/newsletter/tldr-card"
import { StatCards } from "@/components/newsletter/stat-cards"
import { DataTable } from "@/components/newsletter/data-table"
import { LocationChart } from "@/components/newsletter/location-chart"
import { SkillsList } from "@/components/newsletter/skills-list"
import { CareerCards } from "@/components/newsletter/career-cards"
import { EmailSubscribe } from "@/components/newsletter/email-subscribe"
import { MethodologyBlock } from "@/components/newsletter/methodology-block"

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.map((i) => ({ slug: i.slug }))
}

const BASE = "https://www.himyro.com"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) return {}
  const title = issue.seoTitle ? `${issue.seoTitle} | Myro` : `${issue.title} | Myro Weekly`
  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const absoluteOgImage = issue.ogImage
    ? issue.ogImage.startsWith("http") ? issue.ogImage : `${BASE}${issue.ogImage}`
    : undefined
  const ogImages = absoluteOgImage
    ? [{ url: absoluteOgImage, width: 1200, height: 630, alt: issue.ogImageAlt ?? issue.title }]
    : undefined
  const isoDate = new Date(issue.publishedAt).toISOString()
  return {
    title,
    description: issue.summary,
    alternates: { canonical: canonicalUrl },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
    },
    openGraph: {
      title,
      description: issue.summary,
      type: "article",
      url: canonicalUrl,
      publishedTime: isoDate,
      ...(ogImages && { images: ogImages }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: issue.summary,
      ...(ogImages && { images: ogImages }),
    },
  }
}

const mdxComponents = {
  NewsletterCTA, ChartEmbed,
  TldrCard, StatCards, DataTable,
  LocationChart, SkillsList, CareerCards,
  EmailSubscribe, MethodologyBlock,
}

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } }

function themeLabel(theme: string) {
  return theme.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export default async function IssuePage({ params }: Props) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) notFound()

  const moreIssues = (await getAllIssues())
    .filter((i) => i.slug !== issue.slug && i.slug !== "_placeholder")
    .slice(0, 3)

  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
  const initials = issue.authorInitials ?? "SP"
  const authorName = issue.authorName ?? "Shivam Pathak"
  const issueNum = issue.issueNumber ? String(issue.issueNumber).padStart(3, "0") : "001"
  const series = issue.seriesLabel ?? "Monday Hiring Heatmap"
  const mins = issue.readMinutes ?? 5

  const isoDate = new Date(issue.publishedAt).toISOString()
  const absoluteOgImage = issue.ogImage
    ? issue.ogImage.startsWith("http") ? issue.ogImage : `${BASE}${issue.ogImage}`
    : undefined
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: issue.seoTitle ?? issue.title,
      datePublished: isoDate,
      description: issue.summary,
      author: { "@type": "Person", name: authorName },
      publisher: {
        "@type": "Organization",
        name: "Myro",
        url: BASE,
        sameAs: [
          "https://x.com/himyro",
          "https://www.linkedin.com/company/himyro-career-intelligence",
        ],
      },
      ...(absoluteOgImage && { image: absoluteOgImage }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: "Newsletter", item: `${BASE}/newsletter` },
        { "@type": "ListItem", position: 3, name: issue.title, item: canonicalUrl },
      ],
    },
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ReadingProgress />

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 32px 96px" }}>
       <div className="nl-grid">
        <div style={{ minWidth: 0 }}>

        {/* Back link sits above the reading sheet */}
        <NewsletterBackLink />

        <article className="nl-article">

        {/* Issue tag */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--tm-interactive)", background: "var(--tm-int-bg-wash)",
            border: "1px solid var(--tm-int-border)", padding: "3px 10px", borderRadius: "var(--tm-radius-pill)",
          }}>
            {themeLabel(issue.theme)}
          </span>
          <time dateTime={issue.publishedAt} style={{ fontSize: 13, color: "var(--tm-text-faint)", letterSpacing: "0.02em" }}>
            {date}
          </time>
        </div>

        {/* Headline + standfirst — serif publication voice */}
        <h1 className="nl-headline">{issue.title}</h1>
        <p className="nl-standfirst">{issue.summary}</p>

        {/* Byline */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          padding: "16px 0", borderTop: "1px solid var(--tm-border-soft)", borderBottom: "1px solid var(--tm-border-soft)", marginBottom: 48,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden="true" style={{
              width: 36, height: 36, borderRadius: "50%", background: "var(--tm-int-bg-wash)",
              border: "1px solid var(--tm-int-border)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--tm-interactive)", flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tm-text)" }}>{authorName}</div>
              <div style={{ fontSize: 12, color: "var(--tm-text-faint)", marginTop: 2 }}>
                Issue {issueNum} · {series} · {mins}-minute read
              </div>
            </div>
          </div>
          <ShareButton url={canonicalUrl} title={issue.title} />
        </div>

        {/* MDX content */}
        <div className="mdx-prose newsletter-prose">
          <MDXRemote source={issue.content} options={mdxOptions} components={mdxComponents} />
        </div>

        {/* Bottom CTA */}
        <div style={{
          background: "rgba(0, 245, 212, 0.04)",
          border: "1px solid rgba(0, 245, 212, 0.15)",
          borderTop: "2px solid #22d3a8",
          borderRadius: "var(--tm-radius-lg)", padding: "28px 32px",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, marginTop: 40,
          boxShadow: "0 0 32px rgba(0, 245, 212, 0.06)",
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3, margin: 0 }}>
            Track these jobs as you apply
          </p>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <Link
              href={`/signup?utm_source=newsletter&utm_campaign=${issue.slug}`}
              className="nl-cta-btn"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 14, fontWeight: 600, color: "var(--tm-interactive-fg)",
                background: "#22d3a8", padding: "10px 22px",
                borderRadius: "var(--tm-radius)", textDecoration: "none",
                boxShadow: "0 0 8px rgba(0, 245, 212, 0.18)",
                transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
              }}
            >
              Sign up to track jobs
            </Link>
            <ShareButton url={canonicalUrl} title={issue.title} />
          </div>
        </div>

        </article>
        </div>

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

          {moreIssues.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--tm-text-faint)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
                More issues
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {moreIssues.map((m) => (
                  <Link
                    key={m.slug}
                    href={`/newsletter/${m.slug}`}
                    style={{ display: "block", textDecoration: "none", padding: "10px 0", borderTop: "1px solid var(--tm-border-soft)" }}
                  >
                    <div style={{ fontSize: 10, color: "var(--tm-interactive)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, fontWeight: 500 }}>
                      {themeLabel(m.theme)}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.35 }}>
                      {m.title}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
       </div>
      </div>
    </>
  )
}
