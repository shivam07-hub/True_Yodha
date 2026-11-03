"""The internship list is a tagged index read, not a title scan."""

from pathlib import Path

from app.repositories.live_list import _INTERN_OR

MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20261102240000_internships_read_the_index.sql"
)


def test_the_list_does_not_scan_titles() -> None:
    assert "ilike" not in _INTERN_OR
    assert "employment_kind.eq.internship" in _INTERN_OR
    assert "seniority_level.eq.intern" in _INTERN_OR
    assert "listing_venue.eq.myro" in _INTERN_OR


def test_the_role_list_and_the_companies_list_stop_in_the_database() -> None:
    sql = (
        Path(__file__).parents[2] / "database/migrations/20261103001000_live_list.sql"
    ).read_text()
    assert "function public.live_jobs_for_families" in sql
    assert "idx_jobs_live_family_verified" in sql
    assert "security definer" in sql
    assert "j.role_family = any(p_families)" in sql
    assert "order by j.last_verified_live_at desc nulls last" in sql
    assert "if p_kind = 'city'" in sql
    assert "if p_kind = 'industry'" in sql
    assert "j.location_city = p_value" in sql
    assert "j.industry_group = p_value" in sql


def test_the_index_matches_the_list_predicate() -> None:
    sql = MIGRATION.read_text()
    assert "idx_jobs_live_intern_first_seen" in sql
    assert "first_seen desc" in sql
    assert "is_active is true" in sql
    assert "listing_confidence = 'active'" in sql
    assert "employment_kind = 'internship'" in sql
    assert "seniority_level = 'intern'" in sql
    assert "listing_venue = 'myro'" in sql
    index = sql.split("create index", 1)[1]
    assert "ilike" not in index
