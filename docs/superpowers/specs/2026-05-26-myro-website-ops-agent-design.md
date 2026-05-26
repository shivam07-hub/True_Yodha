# Myro Website Ops Agent Design

**Date:** 2026-05-26
**Status:** Draft for Shivam review
**Owner:** Shivam
**Branch policy:** Work on `Develop`. Never merge directly to `main`.

---

## Why This Exists

Myro already has a strong product surface, beta feedback loop, telemetry for fragile flows, CI checks, release notes, and a growth agent. What is missing is a repo-native operator that can keep track of website health, user pain, incidents, and release drift without forcing Shivam to manually jump between docs, code, Supabase tables, Railway, Vercel, GitHub, and feedback reports.

The first version should not try to be a fully autonomous Slack or email worker. It should be a local CLI that understands Myro's operational context, runs repeatable read-only checks, writes concise briefs, and grows by adding permanent tools and runbooks as repeated needs appear.

## Goals

1. Build a repo-native CLI called **Myro Website Ops Agent**.
2. Keep v1 read-only against production systems by default.
3. Make website operations queryable from the repo: health, incidents, feedback, telemetry, release state, and open risks.
4. Encode Myro-specific operational rules in an editable memory file.
5. Encode repeated procedures as versioned tools and runbooks.
6. Produce durable local artifacts: daily briefs, incident notes, and tool outputs.
7. Design the agent so future Slack, email, GitHub, Vercel, Railway, and Supabase tools can be added without rewriting the core.

## Non-Goals

- No autonomous production writes in v1.
- No automatic replies to users in v1.
- No direct Slack, WhatsApp, email, Vercel, Railway, or GitHub mutation in v1.
- No hardcoded API keys or service-role keys.
- No replacement for the product code's existing tests, CI, or telemetry endpoints.
- No "agent edits its own production behavior silently." Self-extension must create reviewed repo changes.

## Agent Name And Location

**Agent name:** Myro Website Ops Agent

**Repo location:** `ops-agent/`

Suggested structure:

```text
ops-agent/
  README.md
  instructions.md
  pyproject.toml
  myro_ops/
    __init__.py
    cli.py
    config.py
    context.py
    report_writer.py
    tool_registry.py
    tools/
      __init__.py
      repo_status.py
      backend_health.py
      feedback_digest.py
      cv_upload_digest.py
      route_perf_digest.py
      release_digest.py
  tests/
    test_cli.py
    test_report_writer.py
    test_tool_registry.py
    test_tools_repo_status.py
```

The agent lives outside `backend/` and `frontend/` because it is an internal operator, not user-facing product runtime.

## Three Memories

### Factual Memory

Factual memory is read from current source-of-truth systems:

- `AGENTS.md` for cockpit rules, locked decisions, current backlog, and last session summary.
- `docs/beta-testing/2026-05-24-first-beta-testing-report.md` for canonical beta pain and backlog.
- `docs/session-history/2026-05.md` for recent operational context.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` for approved designs and implementation plans.
- `.github/workflows/` for CI expectations.
- `backend/app/routers/status.py`, `backend/app/routers/telemetry.py`, `backend/app/routers/feedback.py`, and matching migrations for existing signals.
- Optional local environment access to Supabase read-only data, if credentials are present.

The agent should degrade gracefully when live credentials are missing and fall back to repo-only analysis.

### Behavioral Memory

Behavioral memory lives in `ops-agent/instructions.md`. It is loaded on every CLI run and updated only through reviewed repo changes.

It should include:

- Myro-specific operator tone: concise, direct, root-cause oriented.
- Incident rules: identify source of truth, avoid symptom patches, name unknowns.
- Privacy rules: never expose user PII in reports unless explicitly requested and safely scoped.
- Escalation rules: payments, auth, CV upload, public profile privacy, production deploy failures, and legal/company-status items are high priority.
- Report shape: what Shivam needs to know, what changed, what is stuck, what should happen next.

### Procedural Memory

Procedural memory lives as CLI tools and runbooks:

- Tools are Python modules registered in `tool_registry.py`.
- Runbooks are Markdown files under `ops-agent/runbooks/` once needed.
- New repeated tasks become reviewed tools with tests.
- The agent may suggest a new tool when a repeated task appears, but it should not silently generate and use unreviewed code.

## V1 CLI Surface

The CLI should expose a small set of commands:

```bash
python -m myro_ops.cli brief
python -m myro_ops.cli health
python -m myro_ops.cli feedback
python -m myro_ops.cli cv-upload
python -m myro_ops.cli release
python -m myro_ops.cli ask "what changed since the last session?"
```

### `brief`

Creates an ops brief in `ops-agent/reports/daily/YYYY-MM-DD.md`.

The brief includes:

- repo state,
- latest commits,
- uncommitted files,
- backend/frontend validation status if checks were run,
- recent beta feedback pointers,
- route and CV upload risk if available,
- recommended next action.

### `health`

Checks basic local and optional live health:

- current git branch,
- dirty worktree summary,
- presence of required frontend/backend files,
- optional `GET /health` and `/v1/status` against `MYRO_API_BASE_URL`,
- optional frontend URL check against `MYRO_WEB_BASE_URL`.

### `feedback`

Summarizes feedback sources:

- repo beta report,
- local feedback docs,
- optional Supabase `user_feedback` rows through a read-only configured key.

### `cv-upload`

Summarizes the CV upload reliability surface:

- relevant code paths,
- latest known incidents from `AGENTS.md` and beta report,
- optional Supabase `cv_upload_phase_events` recent failure mix.

### `release`

Summarizes release state:

- current branch and local commits,
- latest merge/sync commits,
- CI workflow files,
- migration files added recently,
- likely deployment risks.

### `ask`

V1 `ask` is deterministic, not a general LLM chat. It routes a small set of known question patterns to existing tools:

- "what changed" -> release digest,
- "what broke" -> health + CV upload + feedback,
- "what are users saying" -> feedback digest,
- "what should we do next" -> brief recommendation.

Unknown questions should list supported questions and suggest the closest command.

## Data Access And Security

V1 defaults to local repo only.

Optional environment variables:

```text
MYRO_API_BASE_URL=https://...
MYRO_WEB_BASE_URL=https://...
MYRO_OPS_SUPABASE_URL=https://...
MYRO_OPS_SUPABASE_READ_KEY=...
MYRO_OPS_REPORT_DIR=ops-agent/reports
```

Rules:

- Never read `.env` files into reports.
- Never print secret-looking environment values.
- Never use service-role credentials unless Shivam explicitly approves a future admin tool.
- Redact emails, JWTs, API keys, tokens, and UUID-linked PII in generated reports.
- Prefer aggregate counts over raw rows.
- Keep production writes out of v1.

## Report Output

Reports should be Markdown and optimized for fast scanning:

```markdown
# Myro Ops Brief - 2026-05-26

## Status

Ready / Degraded / Blocked

## What Changed

- ...

## Signals

- ...

## Risks

- ...

## Recommended Next Move

...

## Evidence

- command/source references
```

The report should cite local file paths and commands used. It should not dump long raw logs.

## Self-Extension Model

The agent grows through reviewed repo changes:

1. A user asks for a repeated task the CLI cannot do.
2. The agent answers with the closest current tool and records the missing capability in the brief.
3. The agent proposes a new tool module and test.
4. Codex implements that tool in a normal branch/commit flow.
5. The tool becomes part of `tool_registry.py`.

This preserves the spirit of a self-extending ops agent while keeping Myro's production safety rules intact.

## Error Handling

Errors should explain which source failed and what still ran:

- If live API status fails, report `live_api_unavailable` and continue with repo checks.
- If optional Supabase config is missing, report `live_feedback_unconfigured` and use local docs.
- If a command is unsupported, show supported commands and nearest known command.
- If a report cannot be written, fail loudly with the target path and exception class.

No broad "try everything and swallow everything" behavior. Each tool owns its expected failure modes.

## Testing Strategy

V1 should have focused tests:

- CLI command routing.
- Tool registry lookup and unknown command behavior.
- Report writer path and content generation.
- Repo status parser with sample git output.
- Redaction helper for secrets, emails, JWT-like values, and UUID-linked fields.
- Digest tools with fixture inputs.

The test suite should run from `ops-agent/` with:

```bash
python -m pytest -q
```

If the repo's root venv is used:

```bash
.venv/bin/python -m pytest ops-agent/tests -q
```

## V1 Success Criteria

V1 is done when:

- `python -m myro_ops.cli brief` creates a dated Markdown brief.
- `health`, `feedback`, `cv-upload`, `release`, and supported `ask` queries work locally.
- The CLI works without production credentials.
- Generated reports redact sensitive values.
- Tests pass.
- README explains setup, commands, and how to add a new tool.

## Later Phases

### Phase 2: Live Connectors

- GitHub read-only issue/PR/check digest.
- Vercel deployment and domain uptime digest.
- Railway deployment/log digest.
- Supabase aggregate read-only dashboards.
- Slack command receiver for "ask ops".

### Phase 3: Support And Feedback Loop

- Feedback triage suggestions.
- Support draft generation with mandatory human approval.
- Auto-create GitHub issues from repeated feedback themes.
- Incident timeline generation from logs and telemetry.

### Phase 4: Controlled Automation

- Scheduled daily brief.
- Watchdog checks for landing pages and critical routes.
- Safe notification-only alerts.
- Reviewed tool-authoring workflow for new repeated tasks.

## Open Decisions

1. Whether v1 should use Python only or add a TypeScript wrapper later for sharing frontend contract types. Recommendation: Python only for v1.
2. Whether reports should live in git permanently or remain local ignored artifacts. Recommendation: commit templates and examples, but ignore generated daily reports until Shivam wants an audit log in git.
3. Whether Supabase read-only access should use anon key plus RLS or a dedicated read-only database role. Recommendation: start with no live DB access in v1, then add a dedicated read-only path.
