import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getAllIssues, getIssueBySlug } from "@/lib/newsletter"
import { NewsletterCTA } from "@/components/newsletter/issue-cta"

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) return {}
  const title = `${issue.title} | Myro Weekly`
  return {
    title,
    description: issue.summary,
    openGraph: {
      title,
      description: issue.summary,
      type: "article",
      publishedTime: issue.publishedAt,
      ...(issue.ogImage && { images: [issue.ogImage] }),
    },
    other: {
      "script:ld+json": JSON.stringify([
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: issue.title,
          datePublished: issue.publishedAt,
          description: issue.summary,
          author: { "@type": "Person", name: "Shivam Pathak" },
          publisher: { "@type": "Organization", name: "Myro" },
          ...(issue.ogImage && { image: issue.ogImage }),
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://truemirror.vercel.app" },
            { "@type": "ListItem", position: 2, name: "Newsletter", item: "https://truemirror.vercel.app/newsletter" },
            { "@type": "ListItem", position: 3, name: issue.title },
          ],
        },
      ]),
    },
  }
}

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } }

export default async function IssuePage({ params }: Props) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) notFound()

  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })

  return (
    <article style={{ maxWidth: 720, margin: "0 auto", padding: "48px var(--tm-page-px)" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--tm-accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {issue.theme}
          </span>
          <span style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>·</span>
          <time dateTime={issue.publishedAt} style={{ fontSize: 11, color: "var(--tm-text-faint)" }}>{date}</time>
        </div>
        <h1 style={{ fontSize: "var(--tm-fs-title)", fontWeight: 700, color: "var(--tm-text)", letterSpacing: "var(--tm-tracking-tight)", marginBottom: 12 }}>
          {issue.title}
        </h1>
        <p style={{ fontSize: 16, color: "var(--tm-text-muted)", lineHeight: 1.65 }}>{issue.summary}</p>
      </div>

      <div className="mdx-prose">
        <MDXRemote source={issue.content} options={mdxOptions} components={{ NewsletterCTA }} />
      </div>

      <NewsletterCTA role={issue.ctaRole} issueSlug={issue.slug} />
    </article>
  )
}
