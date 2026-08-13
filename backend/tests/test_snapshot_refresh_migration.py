from pathlib import Path


MIGRATIONS = Path(__file__).parents[2] / "database" / "migrations"


def test_snapshot_refresh_migration_is_durable_independent_and_private() -> None:
    paths = sorted(MIGRATIONS.glob("*durable_snapshot_refresh_orchestration.sql"))
    assert len(paths) == 1
    sql = paths[0].read_text(encoding="utf-8").lower()

    assert "create table if not exists public.snapshot_refresh_state" in sql
    assert "request_snapshot_refresh" in sql
    assert "claim_snapshot_refresh" in sql
    assert "finish_snapshot_refresh" in sql
    assert "run_snapshot_sql_refresh" in sql
    assert "refresh_skill_demand_snapshot" in sql
    assert "refresh_job_search_index" in sql
    assert "skill-demand-refresh-retry" in sql
    assert "job-search-refresh-retry" in sql
    assert "for update skip locked" in sql
    assert "enable row level security" in sql
    assert "create policy snapshot_refresh_service_role" in sql
    assert (
        "revoke all on public.snapshot_refresh_state from public, anon, authenticated"
        in sql
    )
    assert "from public, anon, authenticated" in sql


def test_existing_http_cron_is_not_accelerated_before_prod_backend_promotion() -> None:
    path = next(MIGRATIONS.glob("*durable_snapshot_refresh_orchestration.sql"))
    sql = path.read_text(encoding="utf-8").lower()

    # api.himyro.com still runs main. Turning its synchronous endpoint hourly
    # before the async code is promoted would multiply the existing timeout.
    assert "cron:analytics-daily" not in sql
    assert "cron.alter_job" not in sql
