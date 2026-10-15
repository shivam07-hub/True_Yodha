from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def _sql() -> str:
    matches = list(MIGRATIONS.glob("*hosted_listings.sql"))
    assert len(matches) == 1, "expected one hosted listings migration"
    return matches[0].read_text()


def test_hosted_listings_migration_is_additive() -> None:
    sql = _sql()
    assert "ADD COLUMN IF NOT EXISTS listing_venue" in sql
    assert "ADD COLUMN IF NOT EXISTS employment_kind" in sql
    assert "ADD COLUMN IF NOT EXISTS stipend_low_inr" in sql
    assert "ADD COLUMN IF NOT EXISTS duration_months" in sql
    assert "ADD COLUMN IF NOT EXISTS ppo" in sql
    assert "hosted_role" in sql
    assert "internships" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql
    assert "DROP COLUMN" not in sql
    assert "DROP TABLE" not in sql
