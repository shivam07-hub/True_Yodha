"use client"

import { useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Issue } from "@/lib/newsletter"
import styles from "./issue-card.module.css"

interface IssueCardProps {
  issue: Issue
  featured?: boolean
}

// Archive rows and the lead story share the same contract so the index can
// decide importance without knowing link, date or media rendering details.
export function IssueCard({ issue, featured = false }: IssueCardProps) {
  const router = useRouter()
  const href = `/newsletter/${issue.slug}`

  useEffect(() => {
    router.prefetch(href)
  }, [router, href])

  const date = new Date(issue.publishedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <Link href={href} prefetch className={featured ? styles.featuredCard : styles.card}>
      {featured && issue.ogImage ? (
        <Image
          className={styles.media}
          src={issue.ogImage}
          alt={issue.ogImageAlt ?? ""}
          width={1200}
          height={630}
          sizes="(min-width: 900px) 420px, 100vw"
          priority
        />
      ) : null}

      <div className={styles.body}>
        <div className={styles.meta}>
          {issue.theme} · {date}
        </div>
        <h2 className={styles.title}>{issue.title}</h2>
        <p className={styles.summary}>{issue.summary}</p>
        {featured ? <span className={styles.featuredCta}>Read latest</span> : null}
      </div>

      <span data-nl-chevron aria-hidden="true" className={styles.chevron}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M6.5 4l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  )
}
