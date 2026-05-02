# Newsletter Authoring Guide

Single source of truth: `Myro Newsletter/issues/`. Never edit `frontend/content/newsletter/` by hand.

---

## Frontmatter spec

```yaml
---
title: "AI Hiring April 2026: Banks Beat Big Tech"   # ≤60 chars, year + primary keyword
slug: "2026-04-ai-hiring-heatmap"                    # must match filename, see Slug rules below
publishedAt: "2026-04-28"                            # ISO date, used for sort + RSS pubDate
theme: "heatmap"                                     # see Theme values below
primaryKeyword: "AI hiring 2026"                     # target search query
ctaRole: "AI Engineer"                               # populates <NewsletterCTA role="…">
summary: "Real April 2026 hiring data: …"            # ≤155 chars, include the word "free"
pillar: "ai-careers"                                 # see Pillar values below
ogImage: "/og/2026-04-ai-hiring-heatmap.png"         # optional — absolute or root-relative path
---
```

### Theme values
| Value | Day | SEO target |
|---|---|---|
| `heatmap` | Mon | "where is [industry] hiring 2026" |
| `skill` | Tue | "[skill] jobs", "is [skill] worth learning" |
| `trajectory` | Wed | "how to become a [role]", "[role] career path" |
| `boom-watch` | Thu | "[company] layoffs", "fastest growing companies hiring" |
| `future-of-work` | Fri | "future of [job]", "will AI replace [role]" |

### Pillar values
`ai-careers` · `career-trajectories` · `career-switching` · `in-demand-skills`

---

## Slug rules

Pattern: `YYYY-MM-{keyword-slug}`

- Derived from publishedAt month + primary keyword kebab-cased.
- Filename must equal the slug: `2026-04-ai-hiring-heatmap.mdx`
- Slug must match `frontmatter.slug` exactly — the sync script validates this.

---

## MDX body structure (Page anatomy)

```
[Auto-rendered by page: H1 from title, summary as subhead]

*5-min read · {theme label} · By Shivam Pathak*

Opening hook — one surprising stat or contrarian claim.

### TL;DR
- Bullet 1 — most counter-intuitive number
- Bullet 2 — supporting evidence
- Bullet 3 — so-what for reader

<ChartEmbed src="/newsletter/charts/dashboard1_volume_activity.html" title="…" />

---

## [Body section] (repeat ~1 H2 per 200w)

Tables, data, analysis.

<NewsletterCTA role="{ctaRole}" issueSlug="{slug}" />

## What this means for you

**Early-career (0–3 yrs):** …
**Mid-career (3–10 yrs):** …
**Senior (10+ yrs):** …

## The one move to make this week

One sentence. Link to [/signup](/signup).

## Methodology

Data source, date window, scope.
```

### Available MDX components

| Component | Usage |
|---|---|
| `<NewsletterCTA role="AI Engineer" issueSlug="2026-04-ai-hiring-heatmap" />` | CTA block — links to /signup with UTM |
| `<ChartEmbed src="/newsletter/charts/dashboard1_volume_activity.html" title="…" />` | Dashboard iframe (lazy-loaded) |

Dashboard filenames: `dashboard1_volume_activity.html` · `dashboard2_industry_domain.html` · `dashboard3_skills_demand.html` · `dashboard4_company_activity.html` · `dashboard5_location_scraper.html`

---

## Pre-publish checklist

- [ ] `title` ≤60 chars, contains year + primary keyword
- [ ] `summary` ≤155 chars, contains the word "free"
- [ ] `slug` matches filename
- [ ] H1 not duplicated in MDX body (page renders it from frontmatter)
- [ ] TL;DR present near top (featured-snippet bait)
- [ ] One H2 per ~200 words
- [ ] `<NewsletterCTA>` appears at least once in body
- [ ] Internal links to ≥2 Myro pages (`/signup`, `/`, or other issues)
- [ ] Article JSON-LD in `generateMetadata` ← auto-handled by `[slug]/page.tsx`

---

## Publish workflow

```bash
# 1. Scaffold (optional — fills the template)
cd frontend && npm run new:issue

# 2. Edit in: Myro Newsletter/issues/{slug}.mdx

# 3. Sync to frontend
cd frontend && npm run newsletter:sync

# 4. Verify parity
npm run newsletter:check     # exits 0 = clean

# 5. Commit both folders + push
git add "Myro Newsletter/issues/{slug}.mdx" \
        frontend/content/newsletter/issues/{slug}.mdx \
        frontend/public/newsletter/    # rss.xml + feed.json update on prebuild
git commit -m "feat(newsletter): publish {slug}"
git push origin Develop
```

Vercel auto-deploys from `Develop` → issue is live within ~2 minutes.
