# Keep The Firecrawl Jobs Crawler External Behind The Job Feed Contract

Status: accepted

The `firecrawl_Supabase` jobs crawler remains an external operational codebase at `/Users/incognito/Mirror CV/firecrawl_Supabase`; Mirror will not bulk-copy that folder into the main app repo. Mirror owns the deep **Job Feed** module at `backend/app/services/job_feed/`, whose interface normalizes crawler rows, checks Lightcast taxonomy compatibility, produces quality reports, and writes through a Supabase upsert adapter.

This keeps the crawler's scraping cadence, local `.env`, generated dumps, Archon state, and Firecrawl-specific implementation outside production app code, while giving Mirror locality over the `public.jobs` contract that the product depends on. Future crawler improvements should either happen inside `firecrawl_Supabase` or cross the Job Feed seam through tested adapters; production matching, scoring, and Application Path code should depend on `public.jobs`, not crawler internals.

## Considered Options

- Copy the whole crawler into Mirror: rejected because generated outputs, local secrets, upstream Firecrawl code, and operational workflow state would pollute the product repo.
- Leave the crawler fully implicit: rejected because schema drift in `job_id`, `industry`/`Industry`, `location`/`Location`, skills arrays, `batch_date`, and taxonomy files would keep leaking into app code.
- Keep the crawler external and deepen the Job Feed module: accepted because it gives leverage at a small interface and concentrates schema/taxonomy drift in one module.

