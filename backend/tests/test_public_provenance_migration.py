"""The provenance counts are a Tier-0 row on the in-database rail.

Migration 20261019090000 (BACKLOG R12, ARCHITECTURE_READ_PATH.md §30). Counted
per cache fill, `verified_live` averaged 3.3s and hit the 8s ceiling; a cold
build ran it 45 times in a minute on the database dev and prod share.
"""

from __future__ import annotations

import re
from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database" / "migrations"
MIGRATION = MIGRATIONS / "20261019090000_public_provenance_tier0.sql"


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def _rail(sql: str) -> str:
    return sql.split("create or replace function public.run_snapshot_sql_refresh")[1].split(
        "$function$;"
    )[0]


def _allowlist(rail: str) -> set[str]:
    return set(re.findall(r"'([a-z_]+)'", rail.split("if p_task not in (")[1].split(")")[0]))


def test_the_rail_runs_the_task_and_only_the_rail_runs_the_refresh() -> None:
    sql = _sql()
    rail = _rail(sql)

    assert "public_provenance" in _allowlist(rail)
    assert "p_task = 'public_provenance'" in rail
    assert "public.refresh_public_provenance()" in rail
    # Over PostgREST it could only fail at 8s; nobody may wire that path back.
    assert (
        "revoke all on function public.refresh_public_provenance()\n"
        "  from public, anon, authenticated, service_role"
    ) in sql


def test_the_rail_keeps_every_task_it_already_ran() -> None:
    """A `create or replace` of the rail that drops a task would stop that
    snapshot refreshing, silently, until its dead-man fired two days later."""
    previous = (MIGRATIONS / "20261010130000_company_directory_in_database.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert _allowlist(_rail(previous)) <= _allowlist(_rail(_sql()))


def test_it_is_scheduled_registered_and_filled_on_apply() -> None:
    sql = _sql()

    assert "'public-provenance-refresh-retry'" in sql
    assert "run_snapshot_sql_refresh('public_provenance', 'cron:public-provenance')" in sql
    assert "values ('public_provenance', 'pending'" in sql
    # The row exists the moment the migration lands; no reader finds it empty.
    assert "select public.run_snapshot_sql_refresh('public_provenance', 'migration_" in sql


def test_the_snapshot_is_the_backends_alone() -> None:
    sql = _sql()

    assert "alter table public.public_provenance_snapshot enable row level security" in sql
    assert "revoke all on public.public_provenance_snapshot from anon, authenticated" in sql
    assert "check (id = 1)" in sql
