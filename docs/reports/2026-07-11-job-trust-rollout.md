# Job Trust Rollout — 2026-07-11

## Live Supabase result

Project: `gipvxuugajkugntwkeiz`

Applied migrations:

- `trusted_job_lifecycle`
- `company_skill_intelligence`
- `job_history_safe_retirement`
- `job_trust_metrics`
- `job_trust_rollout_bootstrap`
- `job_verification_queue_index`
- `job_trust_boundary_hardening`

Post-rollout inventory:

| Signal | Count |
|---|---:|
| Jobs | 52,951 |
| Trusted active | 12,994 |
| Uncertain | 33,179 |
| Likely closed | 14 |
| Closed | 6,764 |
| Active verified within 21 days | 11,099 |
| Active missing verification timestamp | 0 |
| Company entities | 327 |
| Company-skill profiles | 26,996 |
| Companies with trusted skill profiles | 168 |
| Retirement eligible now | 0 |
| Physically retired | 0 |

The 39,957 non-active listings are unloaded from public Supabase reads and all
Myro discovery/matching surfaces. They remain in the service-role evidence store
until the source-proof and quarantine contract permits physical deletion.

Existing match rows are intentionally retained for audit/history: 820 of 1,550
currently reference trusted active jobs; the 730 untrusted matches are filtered
at read time and will not be shown or re-ranked.

## Live verifier canary

The first successful bounded sweep checked 20 listing URLs:

- 1 strong live listing reactivated;
- 14 generic 404 closure signals moved to `likely_closed`;
- 5 weak/error responses remained non-active and did not start deletion;
- 0 jobs retired.

Across the migration backfill plus canary, the evidence ledger held 27
observations: 18 closure observations, 8 weak errors, and 1 strong live result.

The canary first exposed a PostgREST target-query timeout. A covering queue index
and pre-limit URL filter fixed the root cause; the rerun completed normally.

## Advisor result

New evidence and company-intelligence tables are service-role only: RLS is on,
anonymous/authenticated grants are revoked, and no public policies are present.
Supabase reports this deliberate deny-by-default design as informational
`RLS enabled, no policy` notices. Newly introduced foreign keys now have covering
indexes. Newly created operational indexes may appear as unused until scheduled
traffic accumulates.

The legacy public jobs policy was narrowed from `true` to only trusted active
listings, so direct database reads now obey the same trust gate as the API.

## Remaining deployment action

The Railway cron service could not be created during this rollout because both
the CLI and Railway MCP OAuth session returned `invalid_grant` / unauthorized.
The runnable worker and `backend/railway-verifier.json` are ready. After
`railway login`, create the isolated cron service described in the runbook and
verify its first deployment log contains `metric job_verifier.sweep`.
