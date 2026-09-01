"""Company CV Thread section_order — additive, same grain as hidden_items."""
from pathlib import Path

MIGRATION = Path(__file__).parents[2] / "database/migrations/20260901_cv_section_order.sql"


def test_section_order_is_additive_jsonb() -> None:
    sql = MIGRATION.read_text()
    assert "ADD COLUMN IF NOT EXISTS section_order JSONB" in sql
    assert "DROP COLUMN" not in sql.upper()
    assert "NOTIFY pgrst, 'reload schema'" in sql
