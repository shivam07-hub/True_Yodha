#!/usr/bin/env tsx
/**
 * new-issue.ts
 * Scaffolds a new Myro Weekly MDX issue in Myro Newsletter/issues/
 * Usage: tsx scripts/new-issue.ts
 */

import { createInterface } from "readline/promises"
import fs from "fs"
import path from "path"

const THEMES = {
  mon: "heatmap",
  tue: "skill",
  wed: "trajectory",
  thu: "boom-watch",
  fri: "future-of-work",
} as const

type Theme = (typeof THEMES)[keyof typeof THEMES]

const THEME_LABELS: Record<Theme, string> = {
  "heatmap":       "Mon — Hiring Heatmap",
  "skill":         "Tue — Skill of the Week",
  "trajectory":    "Wed — Career Trajectory",
  "boom-watch":    "Thu — Boom / Layoff Watch",
  "future-of-work":"Fri — Future of Work",
}

const ISSUE_DIR = process.env.NEWSLETTER_SOURCE_DIR
  ?? path.resolve(__dirname, "..", "..", "Myro Newsletter", "issues")

function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function rfcDate(iso: string): string {
  const d = new Date(iso + "T07:00:00Z")
  return d.toUTCString().replace("GMT", "+0000")
}

function buildSlug(keyword: string): string {
  const [y, m] = todayIso().split("-")
  return `${y}-${m}-${toKebab(keyword)}`
}

function scaffold(slug: string, title: string, keyword: string, role: string, theme: Theme): string {
  const today = todayIso()
  return `---
title: "${title}"
slug: "${slug}"
publishedAt: "${today}"
theme: "${theme}"
primaryKeyword: "${keyword}"
ctaRole: "${role}"
summary: "TODO — ≤155 chars, include 'free'. Summarise the hook and the data claim."
pillar: "ai-careers"
---

*5-minute read · ${THEME_LABELS[theme]} · By Shivam Pathak*

One-line hook — the surprising finding this data reveals.

### TL;DR

- **Stat one** — the most counter-intuitive number.
- **Stat two** — the thing that proves your point.
- **Stat three** — the so-what for the reader.

<ChartEmbed src="/newsletter/charts/dashboard1_volume_activity.html" title="Job Volume & Activity" />

---

## The Hook

50–100 words. One contrarian claim backed by one number. Don't bury the lede.

## The Data

300–500 words. Heatmap / chart / role breakdown. Tables, bullet lists, one headline finding per section.

| Column A | Column B |
|---|---|
| Row | Value |

<ChartEmbed src="/newsletter/charts/dashboard2_industry_domain.html" title="Industry Breakdown" />

<NewsletterCTA role="${role}" issueSlug="${slug}" />

## What this means for you

**Early-career (0–3 yrs):** One sentence. One concrete action.

**Mid-career (3–10 yrs) switchers:** One sentence. One pivot move.

**Senior (10+ yrs):** One sentence. One opportunity.

## The one move to make this week

One sentence: the single specific action. Then [run it through Myro](/signup) for your personal gap analysis.

## Methodology

Data source, date window, scope. Numbers re-pulled before publish.

---

*[Get your free Myro Score →](/signup) · Upload your CV in 60 seconds.*
`
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  console.log("\n🗞  New Myro Weekly Issue\n")

  // Theme
  console.log("Theme (pick a day):")
  Object.entries(THEMES).forEach(([day, theme]) => console.log(`  ${day}  →  ${THEME_LABELS[theme]}`))
  const dayInput = (await rl.question("\nDay [mon/tue/wed/thu/fri]: ")).trim().toLowerCase() as keyof typeof THEMES
  const theme: Theme = THEMES[dayInput] ?? "heatmap"

  const title = (await rl.question("Title (H1): ")).trim()
  const keyword = (await rl.question("Primary keyword: ")).trim()
  const role = (await rl.question("CTA role (e.g. AI Engineer): ")).trim()

  rl.close()

  const slug = buildSlug(keyword)
  const outPath = path.join(ISSUE_DIR, `${slug}.mdx`)

  if (fs.existsSync(outPath)) {
    console.error(`\nError: ${outPath} already exists. Choose a different keyword or rename.\n`)
    process.exit(1)
  }

  fs.mkdirSync(ISSUE_DIR, { recursive: true })
  fs.writeFileSync(outPath, scaffold(slug, title, keyword, role, theme), "utf8")

  console.log(`\n✓ Scaffolded: ${outPath}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Fill in the article body in: ${outPath}`)
  console.log(`  2. Update the summary field (≤155 chars, include "free")`)
  console.log(`  3. Run:  cd frontend && npm run newsletter:sync`)
  console.log(`  4. Commit and push.\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
