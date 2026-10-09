"""The closer runs from pg_cron on the production API (Shivam, 2026-10-10).

The GitHub Action stopped being scheduled after 2026-10-06 and nothing said so:
the closer's dead-man could only reach the operator through the digest the
closer sends. pg_cron ran every refresh that week.
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.notice import closer

_ROOT = Path(__file__).resolve().parents[2]
_SCHEDULE = _ROOT / "database/migrations/20261010120000_notice_closer_pg_cron.sql"


def test_the_endpoint_needs_the_cron_secret(monkeypatch) -> None:
    monkeypatch.setenv("MYRO_ANALYTICS_REFRESH_SECRET", "s3cret-value-123")
    with TestClient(app) as client:
        refused = client.post(
            "/internal/notice/close", headers={"X-Myro-Refresh-Secret": "wrong-value-1234"}
        )
    assert refused.status_code == 403


def test_the_closer_runs_on_production_only(monkeypatch) -> None:
    """Dev shares the database but runs Develop: its tests are not proofs on main."""
    monkeypatch.setenv("MYRO_ANALYTICS_REFRESH_SECRET", "s3cret-value-123")
    ran: list[bool] = []
    monkeypatch.setattr(closer, "run_or_alert", lambda: ran.append(True))
    with TestClient(app) as client:
        response = client.post(
            "/internal/notice/close", headers={"X-Myro-Refresh-Secret": "s3cret-value-123"}
        )
    assert response.status_code == 409
    assert ran == []


def test_proofs_come_from_the_deployed_tests() -> None:
    """Production runs main, so a marker in the tests it shipped with is on main."""
    assert closer.TESTS_ROOT == _ROOT / "backend" / "tests"
    assert (closer.TESTS_ROOT / "test_notice_closer_on_pg_cron.py").exists()


def test_a_failed_pass_mails_outside_the_digest(monkeypatch) -> None:
    sent: list[dict[str, str]] = []

    def boom(**_kw: object) -> None:
        raise RuntimeError("store unreachable")

    monkeypatch.setattr(closer, "run", boom)
    monkeypatch.setattr(closer.settings, "ops_alert_email", "ops@example.com")
    monkeypatch.setattr(closer, "send_email", lambda **kw: sent.append(kw) or True)

    closer.run_or_alert()

    assert sent and sent[0]["subject"] == "Myro Notice closer FAILED"
    assert "store unreachable" in sent[0]["text"]


def test_the_schedule_retries_only_a_missed_morning() -> None:
    sql = _SCHEDULE.read_text()

    assert "'notice-closer-daily'" in sql and "'30 2 * * *'" in sql
    assert "'notice-closer-retry'" in sql
    assert "notice_closer_heartbeat" in sql and "interval '20 hours'" in sql
    assert "/internal/notice/close" in sql
    assert not (_ROOT / ".github/workflows/notice-closer.yml").exists()
