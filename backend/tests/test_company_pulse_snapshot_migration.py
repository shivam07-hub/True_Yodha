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
