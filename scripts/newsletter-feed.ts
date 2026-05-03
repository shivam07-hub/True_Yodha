#!/usr/bin/env tsx
/**
 * newsletter-feed.ts
 * Generates frontend/public/newsletter/rss.xml (RSS 2.0)
 *             and frontend/public/newsletter/feed.json (JSON Feed 1.1)
 * Reads from frontend/content/newsletter/issues/ (the committed mirror).
 * Usage: tsx scripts/newsletter-feed.ts
 */

import fs from "fs"
import path from "path"

const REPO_ROOT = path.resolve(__dirname, "..")
const ISSUES_DIR = path.resolve(REPO_ROOT, "frontend", "content", "newsletter", "issues")
const OUT_DIR = path.resolve(REPO_ROOT, "frontend", "public", "newsletter")
const BASE = "https://truemirror.vercel.app"
const FEED_TITLE = "Myro Weekly"
const FEED_DESCRIPTION = "Free weekly hiring intelligence. Real skill demand data from thousands of live job postings."
const AUTHOR = "Shivam Pathak"

interface IssueMeta {
  title: string
  slug: string
  publishedAt: string
  summary: string
  primaryKeyword: string
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(": ")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 2).trim().replace(/^["']|["']$/g, "")
    fm[key] = val
  }
  return fm
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toRfc2822(iso: string): string {
  return new Date(iso + "T07:00:00Z").toUTCString().replace("GMT", "+0000")
}

function loadIssues(): IssueMeta[] {
  if (!fs.existsSync(ISSUES_DIR)) return []
  return fs
    .readdirSync(ISSUES_DIR)
    .filter(f => f.endsWith(".mdx") && !f.startsWith("_"))
    .map(f => {
      const content = fs.readFileSync(path.join(ISSUES_DIR, f), "utf8")
      return parseFrontmatter(content) as IssueMeta
    })
    .filter(m => m.slug && m.publishedAt)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

function buildRss(issues: IssueMeta[]): string {
  const items = issues.map(i => `
    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${BASE}/newsletter/${i.slug}</link>
      <guid isPermaLink="true">${BASE}/newsletter/${i.slug}</guid>
      <description>${escapeXml(i.summary)}</description>
      <pubDate>${toRfc2822(i.publishedAt)}</pubDate>
      <author>${escapeXml(AUTHOR)}</author>
    </item>`).join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${BASE}/newsletter</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <atom:link href="${BASE}/newsletter/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${toRfc2822(issues[0]?.publishedAt ?? new Date().toISOString().slice(0, 10))}</lastBuildDate>
${items}
  </channel>
</rss>
`
}

function buildJsonFeed(issues: IssueMeta[]): string {
  const items = issues.map(i => ({
    id: `${BASE}/newsletter/${i.slug}`,
    url: `${BASE}/newsletter/${i.slug}`,
    title: i.title,
    summary: i.summary,
    date_published: new Date(i.publishedAt + "T07:00:00Z").toISOString(),
    authors: [{ name: AUTHOR }],
  }))

  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: FEED_TITLE,
    home_page_url: `${BASE}/newsletter`,
    feed_url: `${BASE}/newsletter/feed.json`,
    description: FEED_DESCRIPTION,
    language: "en",
    authors: [{ name: AUTHOR }],
    items,
  }, null, 2)
}

function run() {
  const issues = loadIssues()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const rssPath = path.join(OUT_DIR, "rss.xml")
  fs.writeFileSync(rssPath, buildRss(issues), "utf8")

  const jsonPath = path.join(OUT_DIR, "feed.json")
  fs.writeFileSync(jsonPath, buildJsonFeed(issues), "utf8")

  console.log(`✓ RSS:       ${rssPath} (${issues.length} item${issues.length !== 1 ? "s" : ""})`)
  console.log(`✓ JSON Feed: ${jsonPath}`)
}

run()
