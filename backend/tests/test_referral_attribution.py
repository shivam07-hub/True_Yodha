"""Tests for myro_ref cookie → referred_by_user_id attribution.

Covers user_provisioning.ensure_user_provisioned end-to-end behavior:
  - Fresh insert: generates ninja_name, writes referred_by from cookie.
  - Self-referral guard: cookie pointing at own ninja_name → ignored.
  - Idempotency: second call with same user_id never overwrites ninja_name.
  - Unknown ninja in cookie → silently dropped (no error, no write).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import user_provisioning


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Spy:
    """Records every payload that hits user_profiles."""

    def __init__(self, *, existing_user_ids: set[str], ninja_to_user: dict[str, str]) -> None:
        self._existing = set(existing_user_ids)
        self._ninja_to_user = ninja_to_user
        self.upserts: list[dict[str, Any]] = []
        self.updates: list[dict[str, Any]] = []
        self._cur_table: str | None = None
        self._cur_filter: tuple[str, Any] | None = None
        self._cur_action: str | None = None
        self._cur_payload: dict[str, Any] | None = None

    def table(self, name: str) -> "_Spy":
        self._cur_table = name
        self._cur_filter = None
        self._cur_action = None
        self._cur_payload = None
        return self

    def select(self, *_a: Any, **_kw: Any) -> "_Spy":
        self._cur_action = "select"
        return self

    def upsert(self, payload: dict, **_kw: Any) -> "_Spy":
        self._cur_action = "upsert"
        self._cur_payload = payload
        return self

    def update(self, payload: dict, **_kw: Any) -> "_Spy":
        self._cur_action = "update"
        self._cur_payload = payload
        return self

    def insert(self, payload: dict, **_kw: Any) -> "_Spy":
        self._cur_action = "insert"
        self._cur_payload = payload
        return self

    def eq(self, col: str, val: Any) -> "_Spy":
        self._cur_filter = (col, val)
        return self

    def limit(self, _n: int) -> "_Spy":
        return self

    def maybe_single(self) -> "_Spy":
        self._maybe_single = True
        return self

    def execute(self) -> _Result:
        single = getattr(self, "_maybe_single", False)
        self._maybe_single = False
        if self._cur_action == "select" and self._cur_filter and self._cur_filter[0] == "id":
            uid = self._cur_filter[1]
            row = {"id": uid} if uid in self._existing else None
            return _Result(row if single else ([row] if row else []))
        if self._cur_action == "select" and self._cur_filter and self._cur_filter[0] == "ninja_name":
            slug = self._cur_filter[1]
            uid = self._ninja_to_user.get(slug)
            row = {"id": uid} if uid else None
            return _Result(row if single else ([row] if row else []))
        if self._cur_action == "upsert" and self._cur_payload is not None:
            self.upserts.append(self._cur_payload)
            return _Result([self._cur_payload])
        if self._cur_action == "update" and self._cur_payload is not None:
            self.updates.append(self._cur_payload)
            return _Result([self._cur_payload])
        return _Result(None)


def test_fresh_signup_writes_ninja_and_referrer(monkeypatch: Any) -> None:
    spy = _Spy(existing_user_ids=set(), ninja_to_user={"alpha-fox-1234": "owner-u"})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    # Bypass random generation so the assertion is deterministic.
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "brand-new-name-zzzz")

    user_provisioning.ensure_user_provisioned(
        "new-u", "a@b.co", full_name="A", myro_ref="alpha-fox-1234",
    )

    assert len(spy.upserts) == 1
    row = spy.upserts[0]
    assert row["id"] == "new-u"
    assert row["ninja_name"] == "brand-new-name-zzzz"
    assert row["referred_by_user_id"] == "owner-u"


def test_self_referral_is_dropped(monkeypatch: Any) -> None:
    spy = _Spy(existing_user_ids=set(), ninja_to_user={"my-own-name-1234": "self-u"})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "gen-name-xxxx")

    user_provisioning.ensure_user_provisioned(
        "self-u", "s@b.co", full_name="S", myro_ref="my-own-name-1234",
    )

    assert len(spy.upserts) == 1
    assert "referred_by_user_id" not in spy.upserts[0]


def test_unknown_referrer_is_dropped(monkeypatch: Any) -> None:
    spy = _Spy(existing_user_ids=set(), ninja_to_user={})  # no match
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "gen-name-xxxx")

    user_provisioning.ensure_user_provisioned(
        "new-u", "n@b.co", full_name=None, myro_ref="ghost-name-zzzz",
    )

    assert len(spy.upserts) == 1
    assert "referred_by_user_id" not in spy.upserts[0]


def test_existing_user_never_gets_ninja_overwritten(monkeypatch: Any) -> None:
    spy = _Spy(existing_user_ids={"old-u"}, ninja_to_user={})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "should-never-be-called")

    user_provisioning.ensure_user_provisioned("old-u", "o@b.co", full_name="O")

    # Update path — no insert, no ninja_name in payload.
    assert spy.upserts == []
    assert spy.updates and "ninja_name" not in spy.updates[0]


def test_no_email_no_op(monkeypatch: Any) -> None:
    spy = _Spy(existing_user_ids=set(), ninja_to_user={})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    user_provisioning.ensure_user_provisioned("new-u", None, full_name="X")
    assert spy.upserts == []
    assert spy.updates == []


def test_invalid_cookie_name_is_dropped(monkeypatch: Any) -> None:
    """A malformed myro_ref cookie must never poison the insert."""
    spy = _Spy(existing_user_ids=set(), ninja_to_user={})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "gen-name-xxxx")

    user_provisioning.ensure_user_provisioned(
        "new-u", "n@b.co", full_name=None, myro_ref="ADMIN; DROP TABLE",
    )

    assert len(spy.upserts) == 1
    assert "referred_by_user_id" not in spy.upserts[0]


@pytest.mark.parametrize("cookie", ["", "   ", None])
def test_empty_cookie_paths(monkeypatch: Any, cookie: Any) -> None:
    spy = _Spy(existing_user_ids=set(), ninja_to_user={})
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)
    monkeypatch.setattr(user_provisioning.nn, "generate_unique", lambda admin: "gen-name-xxxx")

    user_provisioning.ensure_user_provisioned(
        "new-u", "n@b.co", full_name=None, myro_ref=cookie,
    )

    assert len(spy.upserts) == 1
    assert "referred_by_user_id" not in spy.upserts[0]
