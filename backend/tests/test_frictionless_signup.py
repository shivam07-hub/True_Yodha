"""ADR-0006 frictionless signup — backend test coverage.

Covers the post-signin provisioning fan-out and the LinkedIn identity
write path that the auth router orchestrates.

Magic-link rate-limit + DELETE /auth/integrations/{provider} are integration-
shaped against Supabase auth/admin APIs and are exercised live in staging;
unit-level coverage here focuses on the deterministic helper surface.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import user_provisioning


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _LinkedInSpy:
    def __init__(self, *, existing: dict[str, Any]) -> None:
        self._existing = existing
        self.updates: list[dict[str, Any]] = []
        self._cur_table: str | None = None
        self._cur_action: str | None = None
        self._cur_payload: dict[str, Any] | None = None
        self._cur_filter: tuple[str, Any] | None = None

    def table(self, name: str) -> "_LinkedInSpy":
        self._cur_table = name
        self._cur_action = None
        self._cur_filter = None
        self._cur_payload = None
        return self

    def select(self, *_a: Any, **_kw: Any) -> "_LinkedInSpy":
        self._cur_action = "select"
        return self

    def update(self, payload: dict, **_kw: Any) -> "_LinkedInSpy":
        self._cur_action = "update"
        self._cur_payload = payload
        return self

    def eq(self, col: str, val: Any) -> "_LinkedInSpy":
        self._cur_filter = (col, val)
        return self

    def limit(self, _n: int) -> "_LinkedInSpy":
        return self

    def execute(self) -> _Result:
        if self._cur_action == "select":
            return _Result([self._existing])
        if self._cur_action == "update" and self._cur_payload is not None:
            self.updates.append(self._cur_payload)
            return _Result([self._cur_payload])
        return _Result(None)


@pytest.mark.asyncio
async def test_set_linkedin_identity_writes_vanity_url_and_grants_xp_once(monkeypatch: Any) -> None:
    spy = _LinkedInSpy(existing={"linkedin_url": None, "linkedin_xp_granted": False})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    async def fake_grant(user_id: str) -> tuple[int, int]:
        assert user_id == "user-1"
        return (50, 3050)

    monkeypatch.setattr(user_provisioning.xp_service, "grant_linkedin_profile_xp", fake_grant)

    xp_granted, url_set = await user_provisioning.set_linkedin_identity(
        "user-1",
        vanity="shivam",
        headline="Builder",
        verified=True,
    )

    assert xp_granted is True
    assert url_set is True
    assert spy.updates[0]["linkedin_url"] == "https://www.linkedin.com/in/shivam"
    assert spy.updates[0]["linkedin_headline"] == "Builder"
    assert spy.updates[0]["linkedin_verified"] is True


@pytest.mark.asyncio
async def test_set_linkedin_identity_skips_url_when_already_set(monkeypatch: Any) -> None:
    spy = _LinkedInSpy(existing={
        "linkedin_url": "https://www.linkedin.com/in/old-handle",
        "linkedin_xp_granted": True,
    })
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    grants: list[str] = []

    async def fake_grant(user_id: str) -> tuple[int, int]:
        grants.append(user_id)
        return (0, 5000)

    monkeypatch.setattr(user_provisioning.xp_service, "grant_linkedin_profile_xp", fake_grant)

    xp_granted, url_set = await user_provisioning.set_linkedin_identity(
        "user-2",
        vanity="new-handle",
        headline="Updated",
        verified=False,
    )

    assert xp_granted is False  # already granted
    assert url_set is False  # never overwrite
    # Update fired (headline + verified) but NOT linkedin_url
    assert "linkedin_url" not in spy.updates[0]
    assert spy.updates[0]["linkedin_headline"] == "Updated"
    assert spy.updates[0]["linkedin_verified"] is False
    # grant still called (idempotent flag prevents double-credit inside the service)
    assert grants == ["user-2"]


@pytest.mark.asyncio
async def test_set_linkedin_identity_noop_when_no_claims(monkeypatch: Any) -> None:
    spy = _LinkedInSpy(existing={"linkedin_url": None, "linkedin_xp_granted": False})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    xp_granted, url_set = await user_provisioning.set_linkedin_identity(
        "user-3", vanity=None, headline=None, verified=None,
    )

    assert (xp_granted, url_set) == (False, False)
    assert spy.updates == []


def test_vanity_to_url_strips_slashes() -> None:
    assert user_provisioning._vanity_to_url("/shivam/") == "https://www.linkedin.com/in/shivam"
    assert user_provisioning._vanity_to_url(" handle ") == "https://www.linkedin.com/in/handle"


def test_normalize_cv_source_default_and_validation() -> None:
    from app.routers.cv.upload import _normalize_source

    assert _normalize_source(None, default="pdf_upload") == "pdf_upload"
    assert _normalize_source("garbage", default="pdf_upload") == "pdf_upload"
    assert _normalize_source("text_describe", default="pdf_upload") == "text_describe"
    assert _normalize_source("linkedin_pdf", default="pdf_upload") == "linkedin_pdf"
