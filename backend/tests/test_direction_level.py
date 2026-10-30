"""A direction is a role and a level (Shivam, 2026-10-27).

41 people held a role with no level — 31 with none, 10 with `any`, all set before
September. Matching ran for them, but the snapshot needs a level, so Career Path
and the `/market` gate sent them back through the whole Direction journey to
pick the role they had already chosen. They are asked the level and nothing else,
and the answer goes through `targeting_write.commit`, which mints the snapshot.
CONTEXT.md → Targeting Brief.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.services import career_skill_path_read, career_target, onboarding_service


# ── the snapshot: a picked family's name is its title ───────────────────────

def test_a_family_and_a_level_are_a_canonical_direction() -> None:
    """6 of the 41 have a family and no title. The picker stores the family's
    name AS the title (CONTEXT → Targeting Brief), so a missing title is not a
    reason to refuse the snapshot once the level arrives."""
    profile = {"target_roles": ["Sales Management"], "target_seniority": "mid"}
    assert career_target.is_canonical_direction(profile) is True


def test_no_level_is_not_canonical() -> None:
    assert career_target.is_canonical_direction(
        {"target_roles": ["Sales Management"], "target_role_titles": ["Sales Management"]}
    ) is False


def test_the_snapshot_title_falls_back_to_the_family(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    class _Rpc:
        def execute(self) -> None:
            return None

    class _Admin:
        def rpc(self, _name: str, params: dict[str, Any]) -> _Rpc:
            calls.append(params)
            return _Rpc()

    monkeypatch.setattr(career_target, "get_supabase_admin", lambda: _Admin())
    career_target.record_from_profile(
        "u1", {"target_roles": ["Sales Management"], "target_seniority": "mid"}
    )
    assert calls[0]["p_role_title"] == "Sales Management"
    assert calls[0]["p_family"] == "Sales Management"
    assert calls[0]["p_seniority"] == "mid"


# ── the write: the level, through the one writer ────────────────────────────

class _Commit:
    def __init__(self) -> None:
        self.profile = {"target_seniority": "mid"}
        self.direction_changed = True
        self.leans_changed = False


@pytest.fixture
def committed(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    from app.repositories import users as users_repo_module
    from app.services import targeting_write

    patches: list[dict[str, Any]] = []
    profile = {"target_roles": ["Sales Management"], "target_seniority": None}
    monkeypatch.setattr(users_repo_module.UsersRepository, "get_profile", lambda self, uid: dict(profile))
    monkeypatch.setattr(
        targeting_write, "commit", lambda repo, uid, patch: patches.append(patch) or _Commit()
    )
    monkeypatch.setattr(onboarding_service.background, "enqueue", lambda *a, **k: None)
    return patches


def test_the_level_is_written_through_commit(committed: list[dict[str, Any]]) -> None:
    onboarding_service.save_level(object(), "u1", seniority="mid", years_experience=3.5)
    assert committed == [{
        "target_seniority": "mid",
        "years_experience": 3.5,
        "years_experience_source": "user",
    }]


def test_unknown_years_are_left_alone(committed: list[dict[str, Any]]) -> None:
    onboarding_service.save_level(object(), "u1", seniority="senior")
    assert committed == [{"target_seniority": "senior"}]


def test_a_level_without_a_role_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    """The level is asked only of someone who chose the work."""
    from app.repositories import users as users_repo_module

    monkeypatch.setattr(users_repo_module.UsersRepository, "get_profile", lambda self, uid: {})
    with pytest.raises(ValueError):
        onboarding_service.save_level(object(), "u1", seniority="mid")


def test_the_route_saves_the_level(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import onboarding as router

    seen: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(router, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        router.onboarding_service, "save_level",
        lambda _db, uid, **kw: seen.append((uid, kw)),
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email=None)
    try:
        with TestClient(app) as client:
            ok = client.put("/onboarding/target/level", json={"seniority": "mid", "years_experience": 4})
            bad = client.put("/onboarding/target/level", json={"seniority": "any"})
    finally:
        app.dependency_overrides.clear()
    assert ok.status_code == 204
    assert seen == [("u1", {"seniority": "mid", "years_experience": 4.0})]
    assert bad.status_code == 422


# ── Career Path says what is missing ────────────────────────────────────────

def _assemble(monkeypatch: pytest.MonkeyPatch, profile: dict[str, Any]) -> dict[str, Any]:
    from app.repositories.cv import CVVersionsRepository
    from app.repositories.users import UsersRepository

    monkeypatch.setattr(career_skill_path_read, "current_snapshot", lambda _db, _uid: None)
    monkeypatch.setattr(CVVersionsRepository, "latest_baseline", lambda self, uid: {"id": 7})
    monkeypatch.setattr(UsersRepository, "get_profile", lambda self, uid: profile)
    monkeypatch.setattr(
        onboarding_service, "_awaiting_target_payload",
        lambda *_a, **_k: {"kind": "awaiting_target"},
    )
    return career_skill_path_read.assemble(object(), "u1")


def test_a_role_without_a_level_is_missing_the_level(monkeypatch: pytest.MonkeyPatch) -> None:
    out = _assemble(monkeypatch, {"target_roles": ["Sales Management"], "target_seniority": "any"})
    assert out["needs_target"] is True
    assert out["missing"] == "level"
    assert out["target_flow"] == {"kind": "awaiting_target"}


def test_no_role_is_missing_the_role(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _assemble(monkeypatch, {})["missing"] == "role"
