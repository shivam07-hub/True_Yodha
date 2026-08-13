from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813170000_company_lookup_fast_path.sql"
)


def test_company_lookup_fast_path_is_tracked_and_bounded() -> None:
    sql = MIGRATION.read_text().lower()

    assert "idx_jobs_lower_company_active_jobid" in sql
    assert "idx_jobs_lower_company_first_seen" in sql
    assert "security invoker" in sql
    assert "limit least(greatest(coalesce(p_limit" in sql
    assert "revoke all on function public.company_open_roles_page" in sql
    assert "revoke all on function public.company_jobs_for_notes" in sql
