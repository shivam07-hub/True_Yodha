from __future__ import annotations

import re
from pathlib import Path

from app.security import redact_sensitive_text

ROOT = Path(__file__).resolve().parents[2]


def test_error_redaction_removes_credentials_and_connection_passwords() -> None:
    bearer = ".".join(("test" * 8, "segment" * 4, "tail" * 4))
    db_password = "db-" + "password"
    raw = f"Authorization: Bearer {bearer} postgresql://db-user:{db_password}@db.example.test:5432/myro"

    safe = redact_sensitive_text(raw)

    assert db_password not in safe
    assert bearer not in safe
    assert "REDACTED" in safe


def test_every_declared_table_enables_rls() -> None:
    create = re.compile(
        r"create\s+table\s+(?:if\s+not\s+exists\s+)?"
        r"(?:(?:public|private)\.)?([a-zA-Z_][\w$]*)",
        re.IGNORECASE,
    )
    enable = re.compile(
        r"alter\s+table\s+(?:if\s+exists\s+)?"
        r"(?:(?:public|private)\.)?([a-zA-Z_][\w$]*)\s+"
        r"enable\s+row\s+level\s+security",
        re.IGNORECASE,
    )

    tables: set[str] = set()
    rls_tables: set[str] = set()
    for path in (ROOT / "database").rglob("*.sql"):
        sql = path.read_text(encoding="utf-8")
        tables.update(name.lower() for name in create.findall(sql))
        rls_tables.update(name.lower() for name in enable.findall(sql))

    assert tables - rls_tables == set()


def test_optional_rls_migration_guards_absent_legacy_tables() -> None:
    migration = (ROOT / "database/migrations/20260715_secret_safety_rls.sql").read_text(
        encoding="utf-8"
    )

    for table in (
        "job_feed_run_audits",
        "job_skill_candidates",
        "magic_link_attempts",
        "market_analytics_snapshot",
        "newsletter_subscribers",
        "skill_domains",
        "skill_clusters",
    ):
        assert f"IF to_regclass('public.{table}') IS NOT NULL THEN" in migration


def test_frontend_does_not_reference_server_only_env_values() -> None:
    forbidden = re.compile(
        r"NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|SERVICE|PRIVATE|JWT)",
        re.IGNORECASE,
    )
    matches: list[str] = []
    for path in (ROOT / "frontend").rglob("*.tsx"):
        text = path.read_text(encoding="utf-8")
        matches.extend(forbidden.findall(text))
    for path in (ROOT / "frontend").rglob("*.ts"):
        text = path.read_text(encoding="utf-8")
        matches.extend(forbidden.findall(text))

    assert matches == []
