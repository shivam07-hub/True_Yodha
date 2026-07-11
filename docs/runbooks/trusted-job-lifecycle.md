# Trusted Job Lifecycle Runbook

## Outcome

Myro only recommends listings with `listing_confidence = 'active'` and
`is_active = true`. Uncertain and closed rows stay available to service-role
history and evidence workflows, but are unavailable through the public jobs RLS
policy and all discovery queries.

Physical deletion is deliberately delayed. A job is unloadable only when:

1. a complete company source run recorded the exact missing listing;
2. that run is stored as the job's `last_source_run_id`;
3. the listing accumulated three consecutive complete-run misses;
4. its 30-day quarantine and `deletion_eligible_at` have elapsed; and
5. user application/CV/milestone history has been snapshotted.

Blocked, partial, failed, historical, or low-coverage runs never create absence
evidence. User confirmation that an application link works immediately clears
quarantine and reactivates the listing.

## Continuous loop

### Source ingestion (`firecrawl_Supabase`)

For every company run:

1. Open a `job_source_runs` row and classify completeness.
2. Upsert observed jobs and append listing observations.
3. For complete runs only, increment misses for absent jobs and transition
   `active -> uncertain -> likely_closed -> closed`.
4. Write company-skill point-in-time facts, including zero-count facts for
   skills that disappeared.
5. Refresh longitudinal company skill profiles.
6. Call `retire_closed_jobs`; normally this returns zero until quarantine ends.

The retired `--allow-large-deactivation` option cannot bypass these rules.

### ATS verifier (`True_Yodha`)

The bounded worker command is:

```bash
JOB_VERIFY_LIMIT=500 JOB_VERIFY_CONCURRENCY=15 \
  python -m app.workers.job_listing_verifier
```

The declarative Railway cron configuration is
`backend/railway-verifier.json`: minute 17 every six hours, no restart loop.
It should run as its own service, root `/backend`, branch `Develop`, with the
config file path `railway-verifier.json`. Set `JOB_VERIFY_LIMIT=500` and
`JOB_VERIFY_CONCURRENCY=15`; copy/reference the same Supabase variables used by
the backend. It needs no domain.

Strong ATS 404/410 responses and explicit closed-page text start quarantine.
Generic 404s become `likely_closed`. Rate limits, authentication blocks,
timeouts, Workday maintenance pages, and pages without role evidence remain
weak observations and never close a job.

## Operations

### Daily trust checks

```sql
SELECT listing_confidence, count(*)
FROM public.jobs
GROUP BY listing_confidence;

SELECT *
FROM public.job_trust_exposure_daily
ORDER BY metric_date DESC, surface;

SELECT *
FROM public.job_apply_liveness_daily
ORDER BY metric_date DESC, surface;
```

North star: verified-live recommendation exposure rate. Guardrails: dead-click
rate, untrusted rows emitted by any discovery path (target zero), verifier weak
response rate, reactivation rate, and retirement count.

### Retirement preview

Run this before every unload:

```sql
SELECT count(*) AS eligible
FROM public.jobs j
JOIN public.job_source_runs sr
  ON sr.id = j.last_source_run_id
 AND sr.company_id = j.company_id
 AND sr.status = 'complete'
 AND sr.completed_at >= j.quarantined_at
WHERE j.listing_confidence = 'closed'
  AND j.quarantined_at IS NOT NULL
  AND j.quarantine_until <= now()
  AND j.deletion_eligible_at <= now();
```

Then use the service-role RPC in bounded batches:

```sql
SELECT * FROM public.retire_closed_jobs(500);
```

Verify `job_retirement_events` and representative application/CV snapshots
after each batch. Stop if deleted count differs from the preview.

## Company skill intelligence

`company_skill_run_facts` is append-only, per complete source run.
`company_skill_profiles` is the durable read model with latest and peak demand,
first/last seen, observation count, required level, and
`emerging|steady|declining|dormant` trend. The Myro API and company page use the
profile, and `newsletter_summary` is a source-ready company intelligence brief.

Do not derive the newsletter from raw or uncertain jobs. A report may summarize
profile evidence, but editorial distribution remains review-gated.
