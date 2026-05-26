# Myro Website Ops Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 repo-native Myro Website Ops Agent CLI and run it against the repo health surface.

**Architecture:** The agent is a standalone Python package under `ops-agent/`, outside backend/frontend runtime. It uses a small command router, shared context object, tool registry, report writer, and stdlib-only tools that read repo files and optional public URLs. Generated reports are local artifacts under `ops-agent/reports/`.

**Tech Stack:** Python 3.11+ stdlib, `argparse`, `subprocess`, `urllib.request`, `dataclasses`, `pytest`.

---

## File Structure

- Create `ops-agent/README.md`: usage, command list, safety model, extension guide.
- Create `ops-agent/instructions.md`: loaded behavioral memory.
- Create `ops-agent/.gitignore`: ignore generated reports/cache.
- Create `ops-agent/pyproject.toml`: pytest config for local tests.
- Create `ops-agent/myro_ops/__init__.py`: package marker and version.
- Create `ops-agent/myro_ops/models.py`: `ToolResult` and status helpers.
- Create `ops-agent/myro_ops/context.py`: repo-root discovery and instruction loading.
- Create `ops-agent/myro_ops/redaction.py`: report-safe redaction utilities.
- Create `ops-agent/myro_ops/report_writer.py`: Markdown rendering and daily report writing.
- Create `ops-agent/myro_ops/tool_registry.py`: command-to-tool registry and ask routing.
- Create `ops-agent/myro_ops/cli.py`: argparse entrypoint.
- Create `ops-agent/myro_ops/tools/*.py`: repo status, backend health, feedback digest, CV upload digest, release digest, brief.
- Create `ops-agent/tests/*.py`: focused tests for routing, redaction, report writing, repo parser, and CLI output.

## Task 1: Scaffold Plan And Package Boundary

**Files:**
- Create: `ops-agent/pyproject.toml`
- Create: `ops-agent/.gitignore`
- Create: `ops-agent/README.md`
- Create: `ops-agent/instructions.md`
- Create: `ops-agent/myro_ops/__init__.py`

- [ ] **Step 1: Write initial package files**

Create the package boundary with Python-only runtime, generated reports ignored, and operator memory documented.

- [ ] **Step 2: Verify package files are present**

Run: `find ops-agent -maxdepth 2 -type f | sort`

Expected: files above appear.

- [ ] **Step 3: Commit**

Run:

```bash
git add ops-agent/pyproject.toml ops-agent/.gitignore ops-agent/README.md ops-agent/instructions.md ops-agent/myro_ops/__init__.py
git commit -m "feat(ops): scaffold website ops agent"
```

## Task 2: Core Models, Context, Redaction, Registry, And Reports

**Files:**
- Create: `ops-agent/tests/test_redaction.py`
- Create: `ops-agent/tests/test_report_writer.py`
- Create: `ops-agent/tests/test_tool_registry.py`
- Create: `ops-agent/myro_ops/models.py`
- Create: `ops-agent/myro_ops/context.py`
- Create: `ops-agent/myro_ops/redaction.py`
- Create: `ops-agent/myro_ops/report_writer.py`
- Create: `ops-agent/myro_ops/tool_registry.py`

- [ ] **Step 1: Write failing tests**

Tests cover secret/email/JWT/UUID redaction, report writing, command lookup, and unknown ask behavior.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd ops-agent && python -m pytest tests/test_redaction.py tests/test_report_writer.py tests/test_tool_registry.py -q`

Expected: fails because modules are missing.

- [ ] **Step 3: Implement core modules**

Implement dataclasses and pure helpers only; no production system access.

- [ ] **Step 4: Run tests and verify pass**

Run: `cd ops-agent && python -m pytest tests/test_redaction.py tests/test_report_writer.py tests/test_tool_registry.py -q`

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add ops-agent/tests/test_redaction.py ops-agent/tests/test_report_writer.py ops-agent/tests/test_tool_registry.py ops-agent/myro_ops/models.py ops-agent/myro_ops/context.py ops-agent/myro_ops/redaction.py ops-agent/myro_ops/report_writer.py ops-agent/myro_ops/tool_registry.py
git commit -m "feat(ops): add core agent runtime"
```

## Task 3: Repo Health And Release Tools

**Files:**
- Create: `ops-agent/tests/test_repo_status.py`
- Create: `ops-agent/tests/test_release_digest.py`
- Create: `ops-agent/myro_ops/tools/__init__.py`
- Create: `ops-agent/myro_ops/tools/repo_status.py`
- Create: `ops-agent/myro_ops/tools/backend_health.py`
- Create: `ops-agent/myro_ops/tools/release_digest.py`

- [ ] **Step 1: Write failing tests**

Tests cover git status parsing, missing required path detection, and release digest commit/migration extraction.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd ops-agent && python -m pytest tests/test_repo_status.py tests/test_release_digest.py -q`

Expected: fails because tools are missing.

- [ ] **Step 3: Implement tools**

Implement local checks plus optional URL checks using `MYRO_API_BASE_URL` and `MYRO_WEB_BASE_URL`.

- [ ] **Step 4: Run tests and verify pass**

Run: `cd ops-agent && python -m pytest tests/test_repo_status.py tests/test_release_digest.py -q`

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add ops-agent/tests/test_repo_status.py ops-agent/tests/test_release_digest.py ops-agent/myro_ops/tools/__init__.py ops-agent/myro_ops/tools/repo_status.py ops-agent/myro_ops/tools/backend_health.py ops-agent/myro_ops/tools/release_digest.py
git commit -m "feat(ops): add repo health tools"
```

## Task 4: Feedback, CV Upload, Brief, And CLI

**Files:**
- Create: `ops-agent/tests/test_cli.py`
- Create: `ops-agent/tests/test_digest_tools.py`
- Create: `ops-agent/myro_ops/tools/feedback_digest.py`
- Create: `ops-agent/myro_ops/tools/cv_upload_digest.py`
- Create: `ops-agent/myro_ops/tools/brief.py`
- Create: `ops-agent/myro_ops/cli.py`

- [ ] **Step 1: Write failing tests**

Tests cover CLI command output, supported ask routing, feedback keyword digest, CV upload risk digest, and report creation.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd ops-agent && python -m pytest tests/test_cli.py tests/test_digest_tools.py -q`

Expected: fails because CLI/digest tools are missing.

- [ ] **Step 3: Implement CLI and digest tools**

Implement `brief`, `health`, `feedback`, `cv-upload`, `release`, and deterministic `ask`.

- [ ] **Step 4: Run tests and verify pass**

Run: `cd ops-agent && python -m pytest tests/test_cli.py tests/test_digest_tools.py -q`

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add ops-agent/tests/test_cli.py ops-agent/tests/test_digest_tools.py ops-agent/myro_ops/tools/feedback_digest.py ops-agent/myro_ops/tools/cv_upload_digest.py ops-agent/myro_ops/tools/brief.py ops-agent/myro_ops/cli.py
git commit -m "feat(ops): add website ops cli"
```

## Task 5: Verification And Agent Health Run

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Run full ops-agent test suite**

Run: `cd ops-agent && python -m pytest -q`

Expected: all tests pass.

- [ ] **Step 2: Run git whitespace check**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 3: Run the agent health command**

Run: `cd ops-agent && python -m myro_ops.cli health`

Expected: a Markdown health report prints with repo, branch, dirty state, required path checks, and optional live URL configuration status.

- [ ] **Step 4: Create an ops brief**

Run: `cd ops-agent && python -m myro_ops.cli brief`

Expected: output includes path to `ops-agent/reports/daily/YYYY-MM-DD.md`; generated report remains ignored by git.

- [ ] **Step 5: Update session summary**

Update `AGENTS.md` with commits, validation, and the health run result.

- [ ] **Step 6: Commit**

Run:

```bash
git add AGENTS.md docs/superpowers/plans/2026-05-27-myro-website-ops-agent-implementation.md
git commit -m "docs: record ops agent implementation"
```

## Self-Review Checklist

- Spec coverage: the plan implements the v1 CLI commands, local default, read-only safety, report writing, redaction, tests, and health run.
- Placeholder scan: no task depends on future undefined decisions.
- Type consistency: modules use `ToolResult`, `OpsContext`, and command names consistently.
