# Keep The Firecrawl Jobs Crawler External Behind The Job Feed Contract

Status: accepted

The `firecrawl_Supabase` jobs crawler remains an external operational codebase at `/Users/incognito/firecrawl_Supabase`; Mirror will not bulk-copy that folder into the main app repo. Mirror owns the deep **Job Feed** module at `backend/app/services/job_feed/`, whose interface normalizes crawler rows, checks Lightcast taxonomy compatibility, produces quality reports, and writes through a Supabase upsert adapter.

This keeps the crawler's scraping cadence, local `.env`, generated dumps, Archon state, and Firecrawl-specific implementation outside production app code, while giving Mirror locality over the `public.jobs` contract that the product depends on. Future crawler improvements should either happen inside `firecrawl_Supabase` or cross the Job Feed seam through tested adapters; production matching, scoring, and Application Path code should depend on `public.jobs`, not crawler internals.

## Amended 2026-09-17 — where scanning lives

The crawler's path is the one above; it was recorded as `Mirror CV/firecrawl_Supabase`
for months after the folder moved, which is the kind of decoy this ADR exists to stop.

**Myro never calls a job board's API.** Company-portal scanning — the Greenhouse,
Lever, Ashby, Workday, SmartRecruiters and ~50 other adapters, the ATS discovery
probes, and `KNOWN_PORTALS.md` — lives in the crawler repo behind this same Job
Feed seam. Upstream `career-ops` was audited there on 2026-07-12
(`scraper/CAREER_OPS_AUDIT.md`): adopted as a provider reference, rejected as a
pipeline, and seven India boards were promoted from it. A request to "add the
career-ops portals" is a crawler change, not an app change.

## Considered Options

- Copy the whole crawler into Mirror: rejected because generated outputs, local secrets, upstream Firecrawl code, and operational workflow state would pollute the product repo.
- Leave the crawler fully implicit: rejected because schema drift in `job_id`, `industry`/`Industry`, `location`/`Location`, skills arrays, `batch_date`, and taxonomy files would keep leaking into app code.
- Keep the crawler external and deepen the Job Feed module: accepted because it gives leverage at a small interface and concentrates schema/taxonomy drift in one module.

