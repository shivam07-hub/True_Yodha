from pathlib import Path

from myro_ops.tools.release_digest import collect_recent_migrations, parse_commit_log


def test_parse_commit_log_ignores_blank_lines() -> None:
    commits = parse_commit_log("abc123 feat: one\n\n def456 fix: two \n")

    assert commits == ["abc123 feat: one", "def456 fix: two"]


def test_collect_recent_migrations_returns_latest_names(tmp_path: Path) -> None:
    migration_dir = tmp_path / "database" / "migrations"
    migration_dir.mkdir(parents=True)
    for name in [
        "20260520_feedback_hub.sql",
        "20260526_user_job_matches_weekly_uniqueness.sql",
        "20260525_cv_upload.sql",
    ]:
        (migration_dir / name).write_text("-- migration", encoding="utf-8")

    migrations = collect_recent_migrations(tmp_path, limit=2)

    assert migrations == [
        "database/migrations/20260526_user_job_matches_weekly_uniqueness.sql",
        "database/migrations/20260525_cv_upload.sql",
    ]
