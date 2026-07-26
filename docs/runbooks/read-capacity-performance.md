# Read-Capacity Performance Runbook

This runbook measures the shared read-capacity seam behind beta reports of slow
loading. It does not replace browser performance tests. It separates:

- client-observed request latency; and
- backend wall time from `X-Process-Time`.

The probe sends GET requests only. It never records response bodies or auth
tokens.

## Prerequisites

1. Use a dedicated test account with a representative CV, score, matches, and
   applications.
2. Put its short-lived access token in an environment variable:

   ```bash
   export MYRO_LOAD_AUTH_TOKEN='...'
   ```

3. Confirm the target environment is healthy before testing. Do not use the
   current dev backend while its Railway deployment is crashed.
4. Capture Railway service metrics and Supabase database/pooler signals over
   the same time window as the probe.

## Scenarios

| Scenario | Reads |
|---|---|
| `login_bootstrap` | profile, home bootstrap, first-success checklist |
| `jobs_browse` | feed, matches, applications, unread notifications |
| `cv_library` | CV versions, evidence, score map |
| `company_page` | company summary and paginated jobs |
| `analytics_isolated` | analytics summary and skill heatmap |

Analytics is intentionally separate from login and ordinary browsing. A
regression in analytics must not stall identity, CV, score, or Jobs reads.

## Baseline Command

```bash
PYTHONPATH=backend .venv/bin/python \
  -m scripts.run_read_load_probe \
  --base-url https://truemirror.up.railway.app \
  --scenario jobs_browse \
  --users 4 \
  --waves 5 \
  --output tmp/performance/jobs-browse.json
```

Company pages require a scenario variable:

```bash
PYTHONPATH=backend .venv/bin/python \
  -m scripts.run_read_load_probe \
  --base-url https://truemirror.up.railway.app \
  --scenario company_page \
  --var 'company=Bain & Company' \
  --users 4 \
  --waves 5 \
  --output tmp/performance/company-page.json
```

The harness caps a run at 500 requests. Production is blocked unless
`--allow-production` is explicit. Begin any approved production measurement at
one user and one wave, then increase gradually while watching saturation.

## Initial SLO Gate

The default gate is:

- client p95 at or below 2,000 ms;
- backend p95 at or below 1,000 ms; and
- zero failed requests.

A non-passing report exits with code 2, making it suitable for a release gate.
Targets can be overridden explicitly while establishing a baseline, but the
report records both targets and observations.

## Diagnosis Sequence

1. Reproduce the same scenario three times and compare p50/p95/p99.
2. Correlate the probe window with `metric route.slow` logs.
3. Inspect AnyIO borrowed tokens and HTTP connection-pool wait time.
4. Inspect Supabase pooler utilization and Postgres wait events.
5. Count server-side reads per route and remove duplicated/fan-out reads.
6. Repeat the same probe after each change.

Do not raise thread, HTTP, or database pool limits independently. Verify the
downstream ceiling first; otherwise higher concurrency moves the queue rather
than removing it.
