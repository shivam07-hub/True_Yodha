"""Company skill demand is refreshed in the database, from live enriched jobs.

Measured 2026-10-29: "What skills is X hiring for?" on every company page read
`company_skill_profiles`, last written 2026-07-11. The scraper built those rows
from a run's own skills, but production imports run `--source-only` — skills are
extracted later, by our worker — so it rightly writes none, and nothing else did.
The 4 company ids that held 10 employers also mixed their skills.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
DEFINITION = MIGRATIONS / "20261029130000_company_skill_demand_refresh.sql"


def _code(path: Path) -> str:
    return re.sub(r"--[^\n]*", "", path.read_text())


def _function(text: str, name: str) -> str:
    start = re.search(rf"create\s+or\s+replace\s+function\s+public\.{name}\s*\(", text, re.I)
    assert start, f"public.{name} is defined"
    tag = re.compile(r"\$[a-z_]*\$", re.I).search(text, start.end())
    assert tag, f"public.{name} has a body"
    end = text.find(tag.group(0), tag.end())
    return text[start.start(): end]


def _tasks(body: str) -> set[str]:
    allowed = re.search(r"p_task\s+not\s+in\s*\(([^)]*)\)", body, re.I)
    assert allowed, "run_snapshot_sql_refresh names its tasks"
    return set(re.findall(r"'([a-z_]+)'", allowed.group(1)))


def test_the_refresh_counts_live_jobs_and_their_extracted_skills() -> None:
    body = _function(_code(DEFINITION), "refresh_company_skill_demand")
    assert "public.listing_is_live(" in body
    assert "public.job_skills" in body
    # Trend is this observation against the last one, on the scraper's thresholds.
    assert "1.25" in body and "0.75" in body
    assert "'dormant'" in body


def test_it_runs_on_the_snapshot_lease_and_keeps_every_other_task() -> None:
    """Joining the lease is what puts it under the snapshot dead-man."""
    previous = None
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path >= DEFINITION:
            break
        text = _code(path)
        if re.search(r"create\s+or\s+replace\s+function\s+public\.run_snapshot_sql_refresh\s*\(", text, re.I):
            previous = _tasks(_function(text, "run_snapshot_sql_refresh"))
    assert previous, "an earlier migration defines run_snapshot_sql_refresh"
    current = _tasks(_function(_code(DEFINITION), "run_snapshot_sql_refresh"))
    assert current == previous | {"company_skill_demand"}


def test_it_is_scheduled_daily() -> None:
    text = _code(DEFINITION)
    assert re.search(r"cron\.schedule\(", text)
    assert "run_snapshot_sql_refresh('company_skill_demand'" in text
    assert re.search(r"insert\s+into\s+public\.snapshot_refresh_state", text, re.I)
