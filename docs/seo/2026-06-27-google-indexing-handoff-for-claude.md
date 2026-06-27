# Google Indexing Handoff for Claude

Date: 2026-06-27
Site: `https://www.himyro.com`
Search Console property: `sc-domain:himyro.com`

## Ask

Use Claude's SEO audit/fix skills to make Myro's public growth surfaces crawlable and indexable:

- newsletter index and issue pages
- marketing/public pages
- company/job-intel pages under `/companies`
- public job-data discovery through `/intel`

This handoff is intentionally root-cause first. Do not patch symptoms. Fix the indexing contract across sitemap, robots, canonical metadata, and server-rendered public content.

Do not implement Googlebot-only redirects or bot-specific content. Direct crawlers through normal SEO signals: submitted sitemap, crawlable internal links, robots allow rules, canonical URLs, and server-rendered public pages.

## Search Console Evidence

Private Search Console was checked after login.

Page Indexing report:

- Last update: `2026-06-12`
- Indexed: `4`
- Not indexed: `6`
- Indexed examples: `/newsletter`, `/`, `/intel`, `/about`
- Not indexed reason 1: `Page with redirect`, `3` URLs, validation failed
- Not indexed reason 2: `Blocked by robots.txt`, `3` URLs, validation not started

`Page with redirect` examples:

- `http://www.himyro.com/`
- `http://himyro.com/`
- `https://himyro.com/`

Those are normal host/protocol canonicalization redirects to `https://www.himyro.com/`.

`Blocked by robots.txt` examples:

- `https://www.himyro.com/login`
- `https://www.himyro.com/signup?next=/cv?upload%3D1`
- `https://www.himyro.com/signup`

Those are intentionally private/signup surfaces. They do not explain company/newsletter discovery failure.

Sitemaps report:

- Submitted sitemaps: `0`
- `https://www.himyro.com/sitemap.xml` exists live, but it has not been submitted in Search Console.

## Executive Summary

Google can crawl and index the main site and newsletter pages, but the company/job SEO path is internally contradictory:

1. Search Console has no submitted sitemap, so Google only knows `10` URLs in the current Page Indexing report.
2. Live `sitemap.xml` submits 264 `/companies/{name}` URLs.
3. Live `robots.txt` blocks every `/companies/{name}` URL with `Disallow: /companies/`.
4. `/companies/{name}` pages return `200`, but server HTML is only a client loading shell.
5. `/companies/{name}` pages inherit homepage/default metadata, have no self-canonical, and use homepage `og:url`.

So Google has not been formally given the sitemap in Search Console, and the live sitemap/robots contract is self-contradictory for company pages.

## Live Evidence

### `robots.txt`

Live key lines from `frontend/app/robots.ts`:

- `Allow: /newsletter`
- `Allow: /intel`
- `Disallow: /companies/`
- `Disallow: /login`
- `Disallow: /signup`
- `Sitemap: https://www.himyro.com/sitemap.xml`

### `sitemap.xml`

Live sitemap count: `283` URLs.

Breakdown:

- `/companies`: `265` sitemap entries total
- `/companies/{name}`: `264` detail pages
- `/newsletter`: `11` entries total
- `/newsletter/{slug}`: `10` issue pages
- static entries: `/`, `/intel`, `/companies`, `/institutions`, `/myrology`, `/newsletter`, `/docs`, `/privacy`, `/terms`

Not currently in sitemap despite public/indexable metadata:

- `/taxonomy`
- `/security`
- `/cv-preview`

Source files: `frontend/app/sitemap.ts`, `frontend/lib/site-routes.ts`

### Sample Live Page Metadata

`https://www.himyro.com/companies/Accenture`

- HTTP status: `200`
- meta robots: `index, follow`
- title: `Myro - One hub for every CV version`
- description: default homepage/CV description
- canonical: missing
- `og:url`: `https://www.himyro.com`
- server HTML visible content: `Loading company jobs...`

This is not a company-specific SEO page in the initial HTML.

`https://www.himyro.com/companies`

- HTTP status: `200`
- meta robots: `index, follow`
- canonical: `https://www.himyro.com/companies`
- server HTML includes company list and links, including `Accenture`

But those links point into `/companies/{name}`, which robots currently blocks.

Live company data conclusion: `/companies` is a useful crawl hub, but `/companies/{name}` must become normal crawlable SSR/ISR content before Google is sent there at scale.

`https://www.himyro.com/newsletter/2026-06-bfsi-beats-tech-hiring`

- HTTP status: `200`
- meta robots: `index, follow`
- canonical: `https://www.himyro.com/newsletter/2026-06-bfsi-beats-tech-hiring`
- `og:url`: same canonical
- server HTML includes full article text and JSON-LD

Newsletter pages look crawlable and indexable.

Newsletter conclusion: the article structure is healthy. Keep issue pages linked from `/newsletter`, RSS/feed, and related internal pages; the missing step is Search Console sitemap submission.

`https://www.himyro.com/taxonomy`

- HTTP status: `200`
- meta robots: `index, follow`
- canonical: `https://www.himyro.com/taxonomy`
- not in sitemap because `frontend/lib/site-routes.ts` has no `sitemap` block for it

`https://www.himyro.com/security`

- HTTP status: `200`
- meta robots: `index, follow`
- canonical: `https://www.himyro.com/security`
- not in sitemap because `frontend/lib/site-routes.ts` has no `sitemap` block for it

## Root Causes

### P0: Sitemap is not submitted in Search Console

Search Console > Sitemaps shows `0` submitted sitemaps. The live robots file advertises:

```txt
Sitemap: https://www.himyro.com/sitemap.xml
```

But Search Console's Page Indexing report currently knows only `10` URLs. Submit `https://www.himyro.com/sitemap.xml` after fixing the sitemap/robots contradiction below, otherwise Google may keep discovering the site slowly through links only.

### P1: Sitemap/robots contradiction for company detail pages

`frontend/app/sitemap.ts` intentionally emits every tracked company URL:

```ts
url: `${BASE}/companies/${encodeURIComponent(c.name)}`
```

But `frontend/app/robots.ts` blocks:

```ts
Disallow: /companies/
```

Google's robots matching treats `/companies/` as a folder prefix. It blocks `/companies/Accenture` while still allowing `/companies` because `/companies` has no trailing slash. This explains a likely Search Console status such as "Submitted URL blocked by robots.txt" for company URLs.

### P2: Company detail pages are client-only and metadata-empty

`frontend/app/companies/[slug]/page.tsx` is a `"use client"` page. It fetches company jobs via TanStack Query after hydration:

```ts
const { data, isLoading, isFetching } = useQuery({
  queryKey: ["company-jobs", companyName, page],
  queryFn: () => fetchCompanyJobs(companyName, page),
})
```

Initial server HTML is a loading state. Google can render JavaScript, but these pages are currently public SEO targets and should not depend on client rendering for their core content.

The same file does not export `generateMetadata`, so detail pages inherit the root metadata from `frontend/app/layout.tsx`.

### P3: Public route registry omits several indexable pages from sitemap

`frontend/lib/site-routes.ts` marks these as public routes but without `sitemap`:

```ts
{ path: "/cv-preview", label: "CV Hub", footer: "Product", route: true },
{ path: "/taxonomy", label: "Skill Taxonomy", footer: "Learn", route: true },
{ path: "/security", label: "Security", route: true },
```

If they are intended acquisition pages, add sitemap entries. If not, their metadata should match the non-indexing intent.

### P4: Invalid newsletter slug behavior may leak confusing metadata

`https://www.himyro.com/newsletter/issue-010` returns `200` with default metadata and includes a `noindex` meta tag in the HTML. That URL is not in the sitemap, but the behavior is messy. Confirm whether unknown newsletter slugs should hard 404 or consistently noindex.

## Recommended Fix Plan

1. Decide which company URLs should be indexed.
   - If company detail pages are SEO surfaces, remove `Disallow: /companies/`.
   - If they are not SEO surfaces, remove `/companies/{name}` from `sitemap.xml`.
   - Product intent says they are SEO/job-intel surfaces, so preferred fix is to allow them.

2. Convert `/companies/[slug]` into an SEO-valid server-rendered page.
   - Keep interactive save/comments in a client child component if needed.
   - Fetch first page of company jobs server-side from backend/public repository/API.
   - Render company name, open-role count, first 20-50 jobs, locations, and primary skills in the server HTML.
   - Preserve current public nav/footer.

3. Add `generateMetadata` for `/companies/[slug]`.
   - Title: `{Company} jobs and hiring signals | Myro`
   - Description: `Explore {count} open roles at {Company}, with locations and skill signals from Myro's live job database.`
   - Canonical: `https://www.himyro.com/companies/{encodedCompany}`
   - OG/Twitter URL: same canonical
   - Robots: `index, follow`

4. Add structured data only if it matches rendered content.
   - `CollectionPage` or `ItemList` for listed jobs is safer than inventing `JobPosting` details if the page does not render full job descriptions and source URLs.
   - Do not invent salary, employment type, or application data.

5. Add sitemap coverage for intentional public pages.
   - Add `sitemap` blocks for `/taxonomy`, `/security`, and likely `/cv-preview`.
   - Consider whether `/newsletter/feed.json` and `/newsletter/rss.xml` should be explicitly linked in the sitemap or just robots/nav/discovery. They are currently allowed but not in sitemap.

6. Add route-level SEO tests.
   - `robots.txt` must not disallow any URL emitted by `sitemap.xml`, except intentionally documented noindex/private cases.
   - Company detail HTML should include company-specific title/canonical and at least one company/job text marker in server output.
   - Newsletter unknown slug should produce the intended status/indexing behavior.

7. After deploy, inspect live `robots.txt` and `sitemap.xml`, submit the sitemap in Search Console, run URL Inspection for `https://www.himyro.com/companies/Accenture`, then request indexing after "Page is crawlable" is true.

8. Direct crawlers toward public growth surfaces without cloaking.
   - Keep footer/nav links to `/newsletter`, `/intel`, and `/companies`.
   - Add contextual newsletter links into relevant `/companies/{name}` pages only after those detail pages are crawlable.
   - Consider a small server-rendered "latest hiring signals" block on `/intel` linking to top company pages.
   - Avoid user-agent-specific redirects or content. Googlebot should see the same public page users see.

## Useful Commands

```bash
curl -sS https://www.himyro.com/robots.txt
curl -sS https://www.himyro.com/sitemap.xml | rg '<loc>https://www.himyro.com/companies/'
curl -sS https://www.himyro.com/companies/Accenture | rg -o '<title>[^<]*|<meta name="robots" content="[^"]*"|<link rel="canonical" href="[^"]*"|<meta property="og:url" content="[^"]*"|Loading company jobs|Accenture'
curl -sS https://www.himyro.com/newsletter/2026-06-bfsi-beats-tech-hiring | rg -o '<title>[^<]*|<meta name="robots" content="[^"]*"|<link rel="canonical" href="[^"]*"|<meta property="og:url" content="[^"]*"'
```

## External References

- Google robots docs: disallowed pages can appear without content/snippets, and to fix a blocked result you remove the blocking robots entry.
  `https://developers.google.com/search/docs/crawling-indexing/robots/intro`
- Google JavaScript SEO docs: if robots disallows a URL, Googlebot skips the URL and does not render JavaScript on it; app-shell pages require rendering before Google can see content.
  `https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics`
- Google canonical docs: sitemap inclusion is only a weak canonical signal; `rel="canonical"` is stronger, and client-rendered canonical signals should be clear in source HTML.
  `https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls`
- Google robots specification: `/companies/` matches everything in that folder; most-specific matching applies.
  `https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec`

## Short Claude Prompt

Fix Myro's public indexing pipeline from this audit: `docs/seo/2026-06-27-google-indexing-handoff-for-claude.md`.

Primary target: make `/companies/{name}` crawlable and indexable, or remove it from sitemap if product intent changes. Preferred product intent is crawlable/indexable.

Constraints:

- Work on `Develop`, never `main`.
- Long-term root-cause fix only.
- Do not hardcode secrets.
- Keep public SEO pages server-rendered enough for Googlebot.
- Preserve privacy decisions: CVs, emails, user skills, profile details, and private app data never leak.
- Run `pytest backend/tests`, frontend typecheck, frontend lint, and relevant route/SEO tests before completion.
