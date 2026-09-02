from __future__ import annotations

import re
from pathlib import Path

from app.security import redact_sensitive_text
from app.schemas import AuthResponse, ExtensionSessionResponse, PostSigninResponse, UserProfileResponse

ROOT = Path(__file__).resolve().parents[2]


def test_error_redaction_removes_credentials_and_connection_passwords() -> None:
    bearer = ".".join(("test" * 8, "segment" * 4, "tail" * 4))
    db_password = "db-" + "password"
    raw = f"Authorization: Bearer {bearer} postgresql://db-user:{db_password}@db.example.test:5432/myro"

    safe = redact_sensitive_text(raw)

    assert db_password not in safe
    assert bearer not in safe
    assert "REDACTED" in safe


def test_error_redaction_removes_personal_identifiers() -> None:
    raw = (
        "user=7f3b8f35-1e25-4e3e-a17f-41f67289a2b7 "
        "email=student@example.com phone=+91 98765 43210 "
        "client=203.0.113.42"
    )

    safe = redact_sensitive_text(raw)

    assert "7f3b8f35-1e25-4e3e-a17f-41f67289a2b7" not in safe
    assert "student@example.com" not in safe
    assert "98765 43210" not in safe
    assert "203.0.113.42" not in safe
    assert safe.count("[REDACTED]") >= 4


def test_client_identity_responses_exclude_internal_user_ids() -> None:
    forbidden = {"id", "user_id", "referred_by_user_id"}

    for schema in (AuthResponse, ExtensionSessionResponse, PostSigninResponse, UserProfileResponse):
        assert forbidden.isdisjoint(schema.model_fields)


def test_access_log_record_survives_redaction_filter() -> None:
    """uvicorn's AccessFormatter unpacks record.args as a 5-tuple; the
    redaction filter must preserve that contract (regression: flattening
    args to () made EVERY access line raise 'Logging error' in prod)."""
    import logging

    from uvicorn.logging import AccessFormatter

    from app.security.redaction import _SensitiveLogFilter

    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg='%s - "%s %s HTTP/%s" %d',
        args=("100.64.0.20:21430", "GET", "/jobs/analytics", "1.1", 200),
        exc_info=None,
    )

    assert _SensitiveLogFilter().filter(record) is True
    rendered = AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s').format(record)
    assert '"GET /jobs/analytics HTTP/1.1" 200' in rendered
    assert "100.64.0.20" not in rendered


def test_redaction_filter_still_redacts_secrets_inside_args() -> None:
    import logging

    from app.security.redaction import _SensitiveLogFilter

    secret = "sk_live_" + "abcdefgh12345678"
    record = logging.LogRecord(
        name="app.some_module",
        level=logging.WARNING,
        pathname=__file__,
        lineno=0,
        msg="upstream said %s",
        args=(f"api_key={secret}",),
        exc_info=None,
    )

    assert _SensitiveLogFilter().filter(record) is True
    rendered = record.getMessage()
    assert secret not in rendered
    assert "REDACTED" in rendered


def test_redaction_filter_redacts_exception_trace_via_exc_text() -> None:
    import logging

    from app.security.redaction import _SensitiveLogFilter

    secret = "sk_live_" + "abcdefgh12345678"
    try:
        raise RuntimeError(f"api_key={secret}")
    except RuntimeError:
        import sys

        record = logging.LogRecord(
            name="app.some_module",
            level=logging.ERROR,
            pathname=__file__,
            lineno=0,
            msg="boom",
            args=(),
            exc_info=sys.exc_info(),
        )

    assert _SensitiveLogFilter().filter(record) is True
    assert record.exc_info is None
    assert record.exc_text is not None
    assert secret not in record.exc_text
    rendered = logging.Formatter().format(record)
    assert secret not in rendered
    assert "RuntimeError" in rendered


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

    # Strip `--` comments before scanning. Migrations here carry long prose
    # headers by house style, and this scanner read one: a note saying
    # "re-running that file's CREATE TABLE block restores it" was matched as a
    # table named `block`, failing the suite over a sentence. A comment is not a
    # declaration.
    comment = re.compile(r"--[^\n]*")

    tables: set[str] = set()
    rls_tables: set[str] = set()
    for path in (ROOT / "database").rglob("*.sql"):
        sql = comment.sub("", path.read_text(encoding="utf-8"))
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


def test_account_deletion_migration_is_self_scoped_and_not_public() -> None:
    migration = (ROOT / "database/migrations/20260725101706_account_data_deletion.sql").read_text(
        encoding="utf-8"
    ).lower()

    assert "auth.uid()" in migration
    assert "security definer" in migration
    assert "revoke all on function public.delete_my_account_data()" in migration
    assert "grant execute on function public.delete_my_account_data() to authenticated" in migration
    assert "delete from public.user_profiles where id = v_user_id" in migration


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
