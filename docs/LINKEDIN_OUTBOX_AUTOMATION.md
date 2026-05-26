# LinkedIn Outbox Automation (Company Page)

This runbook wires `Myro Newsletter/growth-agent/outbox/` to Myro's LinkedIn company page publishing flow.

## What gets automated

- Reads LinkedIn drafts from `Myro Newsletter/growth-agent/outbox/*.md`.
- Validates required fields + UTM alignment.
- Enforces review-window policy (2h normal, 24h sensitive terms).
- Publishes only `Status: scheduled` posts whose publish time is due.
- Writes publish metadata back into the same outbox file:
  - `Status: published`
  - `LinkedIn post URN: ...`
  - `Published at: ...`

## Required outbox fields

Use this structure in each LinkedIn outbox file:

```text
Channel: linkedin
Publish time: 2026-05-27T10:00:00+05:30
Review deadline: 2026-05-27T08:00:00+05:30
Status: scheduled
CTA URL: https://www.himyro.com/signup?utm_source=linkedin&utm_medium=social&utm_campaign=phase0-day10-adjacent-role&utm_content=founder-post
UTM source: linkedin
UTM medium: social
UTM campaign: phase0-day10-adjacent-role
UTM content: founder-post
Source claim: Adjacent-role guidance from today's Myro role-map draft.
Copy: First line hook...
```

Optional:

- `Review window hours: 24` (overrides inferred 2h/24h rule).

Notes:

- `Copy` must include the exact `CTA URL`.
- Timestamps should be timezone-aware ISO strings.

## Environment variables

Set these in CI secrets and local shell for live publishing:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REFRESH_TOKEN`
- `LINKEDIN_ORGANIZATION_URN` (format: `urn:li:organization:<id>`)
- Optional: `LINKEDIN_API_VERSION` (defaults to current UTC `YYYYMM`)

GitHub Actions secret names match exactly:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REFRESH_TOKEN`
- `LINKEDIN_ORGANIZATION_URN`
- `LINKEDIN_API_VERSION` (optional)

## Commands

From `frontend/`:

```bash
npm run linkedin:lint
npm run linkedin:publish-due
npm run linkedin:publish-due:live
```

- `linkedin:lint` validates outbox structure and review policy.
- `linkedin:publish-due` is dry-run.
- `linkedin:publish-due:live` performs API publishing and updates outbox status.

## GitHub workflow

- File: `.github/workflows/linkedin-outbox-publisher.yml`
- Schedule: every 15 minutes.
- Manual run: `workflow_dispatch`
  - `execute=false` (default): dry-run only
  - `execute=true`: live publish run

## Safety model

- If review window is not satisfied, publish exits non-zero.
- If required UTM parameters do not match `CTA URL`, publish exits non-zero.
- If LinkedIn API call fails, file status remains unchanged.
