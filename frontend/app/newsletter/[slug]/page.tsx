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
  const title = `${issue.title} | Myro Weekly`
  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const absoluteOgImage = issue.ogImage
    ? issue.ogImage.startsWith("http") ? issue.ogImage : `${BASE}${issue.ogImage}`
    : undefined
  const isoDate = new Date(issue.publishedAt).toISOString()
  return {
    title,
    description: issue.summary,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: issue.summary,
      type: "article",
      url: canonicalUrl,
      publishedTime: isoDate,
      ...(absoluteOgImage && { images: [absoluteOgImage] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: issue.summary,
      ...(absoluteOgImage && { images: [absoluteOgImage] }),
    },
    other: {
      "script:ld+json": JSON.stringify([
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: issue.title,
          datePublished: isoDate,
          description: issue.summary,
          author: { "@type": "Person", name: issue.authorName ?? "Shivam Pathak" },
          publisher: { "@type": "Organization", name: "Myro", url: BASE },
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
      ]),
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

  const canonicalUrl = `${BASE}/newsletter/${issue.slug}`
  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
  const initials = issue.authorInitials ?? "SP"
  const authorName = issue.authorName ?? "Shivam Pathak"
  const issueNum = issue.issueNumber ? String(issue.issueNumber).padStart(3, "0") : "001"
  const series = issue.seriesLabel ?? "Monday Hiring Heatmap"
  const mins = issue.readMinutes ?? 5

  return (
    <>
      <ReadingProgress />

      <article className="nl-page-enter" style={{ maxWidth: 680, margin: "0 auto", padding: "56px 24px 96px" }}>

        {/* Back link */}
        <Link
          href="/newsletter"
          className="nl-back-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tm-text-muted)", textDecoration: "none", marginBottom: 40, transition: "color var(--tm-dur) var(--tm-ease)" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Newsletter
        </Link>

        {/* Issue tag */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--tm-accent)", background: "var(--tm-accent-wash)",
            border: "1px solid var(--tm-accent-ring)", padding: "3px 10px", borderRadius: "var(--tm-radius-pill)",
          }}>
            {themeLabel(issue.theme)}
          </span>
          <time dateTime={issue.publishedAt} style={{ fontSize: 13, color: "var(--tm-text-faint)", fontFamily: "var(--tm-font-mono)" }}>
            {date}
          </time>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: "2.125rem", lineHeight: 1.18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--tm-text)", margin: "0 0 16px", textWrap: "balance" as never }}>
          {issue.title}
        </h1>
        <p style={{ fontSize: "1.0625rem", lineHeight: 1.65, color: "var(--tm-text-muted)", margin: "0 0 32px", textWrap: "pretty" as never }}>
          {issue.summary}
        </p>

        {/* Byline */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          padding: "16px 0", borderTop: "1px solid var(--tm-border-soft)", borderBottom: "1px solid var(--tm-border-soft)", marginBottom: 48,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div aria-hidden="true" style={{
              width: 36, height: 36, borderRadius: "50%", background: "var(--tm-accent-wash)",
              border: "1px solid var(--tm-accent-ring)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--tm-accent)", flexShrink: 0,
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
          background: "var(--tm-accent-wash)", border: "1px solid var(--tm-accent-ring)",
          borderRadius: "var(--tm-radius-lg)", padding: "28px 32px",
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, marginTop: 40,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tm-accent)" }}>
            Free · No credit card
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.3, margin: 0 }}>
            Get your free Myro Score →
          </p>
          <p style={{ fontSize: 14, color: "var(--tm-text-muted)", lineHeight: 1.55, margin: 0 }}>
            Upload your CV in 60 seconds and see exactly where you stand against this market.
          </p>
          <Link
            href={`/signup?utm_source=newsletter&utm_campaign=${issue.slug}`}
            className="nl-cta-btn"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 14, fontWeight: 600, color: "var(--tm-accent-fg)",
              background: "var(--tm-accent)", padding: "10px 22px",
              borderRadius: "var(--tm-radius)", textDecoration: "none",
              transition: "background var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
            }}
          >
            Get started free
          </Link>
        </div>

      </article>
    </>
  )
}
