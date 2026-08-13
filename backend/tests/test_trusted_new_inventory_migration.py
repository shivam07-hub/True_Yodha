from pathlib import Path


MIGRATIONS = Path(__file__).parents[2] / "database" / "migrations"


def test_new_inventory_count_matches_the_trusted_browse_corpus() -> None:
    paths = sorted(MIGRATIONS.glob("*trusted_new_inventory_count.sql"))
    assert len(paths) == 1
    sql = paths[0].read_text(encoding="utf-8").lower()

    assert "create or replace function public.count_new_jobs_for_user" in sql
    assert "j.is_active is true" in sql
    assert "j.listing_confidence = 'active'" in sql
    assert "j.ingested_at > m.ran_at" in sql
    assert "idx_jobs_trusted_ingested_at" in sql
    assert "where is_active is true" in sql
    assert "listing_confidence = 'active'" in sql


def test_new_inventory_count_is_owner_scoped_without_security_definer() -> None:
    path = next(MIGRATIONS.glob("*trusted_new_inventory_count.sql"))
    sql = path.read_text(encoding="utf-8").lower()

    assert "security definer" not in sql
    assert "from public, anon, authenticated" in sql
    assert "to authenticated, service_role" in sql


def test_unread_projection_repair_rederives_and_invalidates_zero() -> None:
    path = next(MIGRATIONS.glob("*rederive_unread_new_inventory.sql"))
    sql = path.read_text(encoding="utf-8").lower()

    assert "count_new_jobs_for_user(n.user_id)" in sql
    assert "when live.live_count <= 0 then now()" in sql
    assert "n.id = live.id" in sql
    assert "n.user_id = live.user_id" in sql
