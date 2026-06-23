"""Editable target role at point-of-use (issue #145).

Decision A: a role edit routes through the canonical `save_target`, which moves
`target_role_title` + derived `target_roles` clusters in lockstep and enqueues a
score recompute + re-match. A point-of-use "edit role" supplies only the new
role title and must PRESERVE the user's existing seniority + location.
"""
from __future__ import annotations

import pytest

from app.services import onboarding_service


class _FakeUsersRepo:
    def __init__(self, profile: dict) -> None:
        self._profile = profile
        self.updates: dict = {}

    def get_profile(self, _user_id: str) -> dict:
        return self._profile

    def update_profile(self, _user_id: str, updates: dict) -> None:
        self.updates = updates


class _FakeOnboardingRepo:
    def __init__(self) -> None:
        self.patches: list[dict] = []

    def patch_state(self, _user_id: str, updates: dict) -> None:
        self.patches.append(updates)


class _FakeBackground:
    LANE_FAST = "fast"

    def __init__(self) -> None:
        self.enqueued: list[tuple] = []

    def enqueue(self, lane, name, *, payload, correlation_id):
        self.enqueued.append((lane, name, payload, correlation_id))


@pytest.fixture
def wired(monkeypatch):
    users = _FakeUsersRepo(
        {
            "target_role_title": "Data Analyst",
            "target_seniority": "senior",
            "target_locations": ["Bengaluru, India"],
        }
    )
    onboarding = _FakeOnboardingRepo()
    bg = _FakeBackground()
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: users)
    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: onboarding)
    monkeypatch.setattr(onboarding_service, "background", bg)
    return users, onboarding, bg


def test_role_only_edit_preserves_seniority_and_location(wired) -> None:
    users, _onboarding, bg = wired

    onboarding_service.save_target(object(), "u1", role_title="Product Manager")

    # role title + re-derived clusters move in lockstep
    assert users.updates["target_role_title"] == "Product Manager"
    assert users.updates["target_roles"] == ["Product Management"]
    # omitted fields preserved from the existing profile, not wiped
    assert users.updates["target_seniority"] == "senior"
    assert users.updates["target_locations"] == ["Bengaluru, India"]
    # recompute + re-match is enqueued
    assert any(name == "onboarding_target_refresh" for _lane, name, _p, _c in bg.enqueued)


def test_explicit_fields_still_override(wired) -> None:
    users, _onboarding, _bg = wired

    onboarding_service.save_target(
        object(), "u1", role_title="Data Scientist", seniority="entry", location="Remote, India"
    )

    assert users.updates["target_role_title"] == "Data Scientist"
    assert users.updates["target_roles"] == ["Data Science"]
    assert users.updates["target_seniority"] == "entry"
    assert users.updates["target_locations"] == ["Remote, India"]
