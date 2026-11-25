"""The suite never reaches the shared Supabase.

Dev and prod are one database. On 2026-11-24 a morning of gate runs sent it
2,633 requests in under three hours (7,216 s of database time), on top of the
scraper's ingest. The Micro host starved, and the Data API answered 503 for
hours afterwards.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_the_suite_holds_no_database_address() -> None:
    from app.config import settings

    assert settings.supabase_url == ""
    assert settings.supabase_anon_key == ""
    assert settings.supabase_service_key == ""


def test_booting_the_app_builds_no_database_client(monkeypatch: pytest.MonkeyPatch) -> None:
    """`with TestClient(app)` runs every startup hook — the skill-floor
    heartbeat, the orphaned-upload sweep, the reservoir sweep. None of them may
    open a client, or each of the suite's 329 boots is a query on production."""
    from app import database
    from app.main import app

    built: list[str] = []
    monkeypatch.setattr(database, "create_client", lambda url, *_a, **_k: built.append(url))
    database.get_supabase_admin.cache_clear()
    database.get_supabase_admin_batch.cache_clear()

    with TestClient(app):
        pass

    assert built == []
