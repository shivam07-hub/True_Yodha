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


def test_refreshes_over_eight_seconds_run_inside_the_database() -> None:
    """role_families (58s), skill_closeness (23s) and company_pulse (16s) failed
    every HTTP-rail run for weeks: `authenticator` refuses a WHERE-less DELETE
    and stops at 8s. They run on pg_cron as postgres, and only there."""
    sql = (MIGRATIONS / "20261004100000_tier0_refreshes_in_database.sql").read_text(
        encoding="utf-8"
    ).lower()
    rail = sql.split("create or replace function public.run_snapshot_sql_refresh")[1]
    rail = rail.split("$function$;")[0]
    for task, fn in (
        ("role_families", "refresh_role_family_labels"),
        ("skill_closeness", "refresh_skill_closeness"),
        ("company_pulse", "refresh_company_pulse"),
    ):
        assert f"'{task}'" in rail
        assert f"public.{fn}()" in rail
        assert f"run_snapshot_sql_refresh('{task}'" in sql
        # Over PostgREST they can only fail; nobody may wire that path back.
        assert (
            f"revoke all on function public.{fn}()\n  from public, anon, authenticated, service_role"
            in sql
        )
    # core_skills is read from the profile the labels refresh rebuilds.
    labels = rail.index("public.refresh_role_family_labels()")
    assert rail.index("public.refresh_direction_core_skills()") > labels


def test_a_daily_refresh_is_due_before_a_day_has_passed() -> None:
    """`< now() - 24h` against yesterday's 06:15:08 success is false at 06:15:00,
    so the daily HTTP cron refreshed analytics every other day."""
    sql = (MIGRATIONS / "20261004100000_tier0_refreshes_in_database.sql").read_text(
        encoding="utf-8"
    ).lower()
    request = sql.split("create or replace function public.request_snapshot_refresh(")[1]
    request = request.split("$function$;")[0]
    assert "interval '20 hours'" in request
    assert "interval '24 hours'" not in request
