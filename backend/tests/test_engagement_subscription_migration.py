from pathlib import Path


def test_engagement_subscription_migration_is_additive() -> None:
    sql = (
        Path(__file__).parents[2]
        / "database/migrations/20260917120000_engagement_subscription.sql"
    ).read_text()
    assert "ADD COLUMN IF NOT EXISTS razorpay_subscription_id" in sql
    assert "ADD COLUMN IF NOT EXISTS subscription_status" in sql
    assert "DROP CONSTRAINT IF EXISTS job_switch_plan_reviews_no_chk" in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql
    assert "DROP TABLE" not in sql.upper().replace("DROP CONSTRAINT", "")
