from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def test_priority_intent_is_persisted_and_indexed_per_user() -> None:
    migrations = sorted(MIGRATIONS.glob("*_job_application_priority.sql"))
    assert migrations, "job application priority migration is missing"
    sql = migrations[-1].read_text().lower()

    assert "add column if not exists is_priority boolean not null default false" in sql
    assert "add column if not exists priority_marked_at timestamptz" in sql
    assert "idx_job_applications_priority_queue" in sql
    assert "on public.job_applications (user_id, priority_marked_at desc)" in sql
    assert "where is_priority = true" in sql
