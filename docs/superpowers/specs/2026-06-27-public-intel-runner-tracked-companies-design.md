# Public Intel Runner Tracked Companies Design

## Context

The public `/intel` hero has a dark "LLM RUNNER" console. Its current rows come
from cosmetic seed data in `frontend/components/public/intel/intel-data.ts`.
Those rows include companies and URLs that are not guaranteed to exist in the
current Myro jobs corpus, which makes the public market surface look ungrounded.

The backend already exposes the correct source of truth through
`GET /jobs/analytics`: `by_company` is compiled from real `jobs.company_name`
values, with open job counts and scrape freshness metadata.

## Decision

The console must render only tracked companies from the analytics payload. It
must not use standalone decorative company examples. If analytics is not ready
or contains no companies, the console renders a neutral syncing row rather than
inventing a company.

The runner model label should describe the scraper enrichment model used for
this corpus. The June scrape notes in `AGENTS.md` identify local LM Studio with
`google/gemma-3-4b`, so the console will display that model contract. The Myro
cloud LLM fallback ladder is separate and should not be presented as the scraper
runner.

## User Experience

- Header: `LLM RUNNER` plus model chips for `Local LM Studio` and
  `google/gemma-3-4b`.
- Log rows: real company names exactly as received from analytics, not derived
  from URLs or marketing seed data.
- Row metadata: job count plus last scrape batch when available.
- Footer: throughput stays cosmetic, parsed today stays from analytics, last
  batch replaces the misleading `Last commit` field.
- Mobile: keep the existing hidden console behavior under 640px.

## Implementation

Add a pure console model helper beside the intel components. `IntelPane` passes
`analytics.by_company` and `analytics.latest_batch` into `IntelHero`, and
`IntelHero` builds animated console entries from that real data.

The helper owns:

- model label constants;
- conversion from analytics companies to console seeds;
- the empty syncing seed;
- formatting for count and last-seen metadata.

## Testing

Use frontend contract tests first:

- tracked console seeds preserve exact company names from analytics;
- fallback console seed does not include fake companies;
- the rendered hero source no longer imports `LOG_SEEDS`;
- the model label is `Local LM Studio` / `google/gemma-3-4b`;
- the footer label is batch-oriented, not `Last commit`.

## Out of Scope

- No database migration.
- No crawler repository changes.
- No mobile layout change.
- No change to the Myro cloud LLM provider ladder.
