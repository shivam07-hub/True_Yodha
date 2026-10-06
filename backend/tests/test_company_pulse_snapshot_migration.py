from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260917120000_company_pulse_snapshot.sql"
)


def test_company_pulse_snapshot_is_tier0_and_public() -> None:
    sql = MIGRATION.read_text()
    assert "create table if not exists public.company_pulse_snapshot" in sql
    assert "sort_key       text primary key" in sql
    assert "inflow_by_day  integer[]" in sql
    assert "cardinality(inflow_by_day) = 30" in sql
    assert "alter table public.company_pulse_snapshot enable row level security" in sql
    assert "company demand pulse is public" in sql
    assert (
        "grant select on public.company_pulse_snapshot to anon, authenticated, service_role"
        in sql
    )
    assert "it never scans jobs" in sql


def test_refresh_aggregates_markers_not_a_request_scan() -> None:
    sql = MIGRATION.read_text()
    assert "create or replace function public.refresh_company_pulse()" in sql
    assert "security definer" in sql
    assert "from public.jobs as j" in sql
    assert "v_today - 21" in sql
    assert "v_today - 7" in sql
    assert "v_today - 29" in sql
    assert "grant execute on function public.refresh_company_pulse() to service_role" in sql
    assert "select public.refresh_company_pulse();" in sql


def test_refresh_registers_on_the_existing_lease() -> None:
    sql = MIGRATION.read_text()
    assert "'company_pulse'" in sql
    assert "snapshot_refresh_state_task_check" in sql
    assert "skill_closeness" in sql
    assert "notify pgrst, 'reload schema'" in sql


LIVE_ROLES = MIGRATION.parent / "20261004120000_company_pulse_counts_live_roles.sql"


def _refresh_body(sql: str) -> str:
    body = sql.split("create or replace function public.refresh_company_pulse()")[1]
    return body.split("$$;")[0]


def test_open_roles_is_the_directory_live_count_not_a_crawl_window() -> None:
    """Pulse said Axis Bank had 10,496 open roles; the row under it on /companies
    said 14,259. `last_seen` is retired; live has one predicate, the directory's."""
    body = _refresh_body(LIVE_ROLES.read_text())
    assert "(j.is_active is true and j.listing_confidence = 'active') as is_live" in body
    assert "count(*) filter (where is_live)::integer as open_roles" in body
    assert "v_fresh" not in body
    assert "last_seen >=" not in body
    # Weekly inflow and the 30-day series keep their first_seen windows.
    assert "first_seen >= v_week" in body
    assert "v_today - 7" in body
    assert "v_today - 29" in body
    assert "security definer" in body


def test_live_roles_refresh_stays_on_the_database_rail() -> None:
    sql = LIVE_ROLES.read_text()
    assert "grant execute" not in sql
    assert (
        "revoke all on function public.refresh_company_pulse()\n"
        "  from public, anon, authenticated, service_role"
    ) in sql
    # Seeds through the lease, queuing this task alone — force would queue all.
    assert "select public.request_snapshot_refresh(" not in sql
    assert "where task = 'company_pulse'" in sql
    assert "select public.run_snapshot_sql_refresh('company_pulse'" in sql
    assert "notify pgrst, 'reload schema'" in sql


CHECKED = MIGRATION.parent / "20261006090000_company_pulse_freshness_is_a_check.sql"


def test_freshness_is_the_last_check_on_a_live_row_not_a_crawl_marker() -> None:
    """Wipro, 2026-10-06: 2,768 live roles, 1,105 checked that week, freshness 0
    off a 09-09 crawl marker. Freshness ages listing_trust's "checked": the
    verifier opened a live role and a live posting answered."""
    body = _refresh_body(CHECKED.read_text())
    assert (
        "max(last_conclusive_verification_at) filter (where is_live) as last_checked_at"
        in body
    )
    # Not the crawler's marker, nor the stamp the crawler also writes, nor receipt.
    assert "last_seen" not in body
    assert "last_verified_live_at" not in body
    assert "ingested_at" not in body
    # One name, one meaning: the upsert writes the new column only.
    assert "last_checked_at = excluded.last_checked_at" in body
    assert "last_seen_at" not in body


def test_checked_refresh_keeps_open_roles_weekly_and_series() -> None:
    body = _refresh_body(CHECKED.read_text())
    assert "(j.is_active is true and j.listing_confidence = 'active') as is_live" in body
    assert "count(*) filter (where is_live)::integer as open_roles" in body
    assert "first_seen >= v_week" in body
    assert "v_today - 7" in body
    assert "v_today - 29" in body
    assert "delete from public.company_pulse_snapshot where refreshed_at <> v_now" in body
    assert "security definer" in body
    assert "set search_path = ''" in body


def test_checked_column_is_additive_and_refresh_stays_on_the_database_rail() -> None:
    sql = CHECKED.read_text()
    assert (
        "alter table public.company_pulse_snapshot\n"
        "  add column if not exists last_checked_at timestamptz"
    ) in sql
    # The retired column waits for main to carry the new reader; never dropped here.
    assert "drop column" not in sql
    assert "grant execute" not in sql
    assert (
        "revoke all on function public.refresh_company_pulse()\n"
        "  from public, anon, authenticated, service_role"
    ) in sql
    # Seeds through the lease, queuing this task alone — force would queue all.
    assert "select public.request_snapshot_refresh(" not in sql
    assert "where task = 'company_pulse'" in sql
    assert "select public.run_snapshot_sql_refresh('company_pulse'" in sql
    assert "notify pgrst, 'reload schema'" in sql
