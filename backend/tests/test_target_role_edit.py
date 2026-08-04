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

    def update_profile(self, _user_id: str, updates: dict) -> bool:
        # Mirrors the real seam's contract: returns whether the DIRECTION moved.
        # `save_target` reads it to decide whether a full Career-Ops re-run is
        # warranted, so a fake that always says "yes" would hide a re-run the
        # user never asked for.
        changed = any(
            updates.get(key) != self._profile.get(key)
            for key in ("target_role_title", "target_roles", "target_seniority", "target_locations")
            if key in updates
        )
        self.updates = updates
        self._profile.update(updates)
        return changed


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
            "target_roles": ["Data Analysis"],
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
    assert users.updates["target_roles"] == ["Data Analysis"]
    assert users.updates["target_career_band"] == "business_product_operations"
    # omitted fields preserved from the existing profile, not wiped
    assert users.updates["target_seniority"] == "senior"
    assert users.updates["target_locations"] == ["Bengaluru, India"]
    # recompute + re-match is enqueued
    assert any(name == "onboarding_target_refresh" for _lane, name, _p, _c in bg.enqueued)


def test_resubmitting_the_same_direction_does_not_rerun_the_brain(wired) -> None:
    """Back-and-forward through the journey, or a double-tap, must be free.

    The refresh below runs the full Career-Ops pass with `force`, which bypasses
    the cache gate — so re-firing it for a direction the matches already answer
    spends a real LLM pass to arrive exactly where the user already is.
    """
    users, onboarding, bg = wired

    onboarding_service.save_target(
        object(),
        "u1",
        role_title="Data Analyst",
        seniority="senior",
        locations=["Bengaluru, India"],
    )

    assert bg.enqueued == []
    assert onboarding.patches == []


def test_explicit_fields_still_override(wired) -> None:
    users, _onboarding, _bg = wired

    onboarding_service.save_target(
        object(), "u1", role_title="Data Scientist", seniority="entry", location="Remote, India"
    )

    assert users.updates["target_role_title"] == "Data Scientist"
    assert users.updates["target_roles"] == ["Data Analysis"]
    assert users.updates["target_career_band"] == "engineering_data"
    assert users.updates["target_seniority"] == "entry"
    assert users.updates["target_locations"] == ["Remote, India"]


def test_multi_role_titles_project_to_union_clusters_and_primary(wired) -> None:
    users, _onboarding, _bg = wired

    onboarding_service.save_target(
        object(),
        "u1",
        role_titles=["Product Manager", "Data Scientist", "  Product Manager  "],
        location="Bengaluru, India",
    )

    # human titles are the source-of-record: de-duped (case/space-insensitive), capped
    assert users.updates["target_role_titles"] == ["Product Manager", "Data Scientist"]
    # primary = titles[0] (back-compat + score label)
    assert users.updates["target_role_title"] == "Product Manager"
    # matcher read model = union of clusters across all titles, order-preserved, de-duped
    assert users.updates["target_roles"] == ["Data Analysis"]
    assert users.updates["target_career_band"] == "business_product_operations"
    assert users.updates["explored_career_bands"] == ["engineering_data"]


def test_title_with_no_cluster_falls_back_to_itself(wired) -> None:
    users, _onboarding, _bg = wired

    onboarding_service.save_target(object(), "u1", role_titles=["Chief of Staff"])

    assert users.updates["target_role_titles"] == ["Chief of Staff"]
    # A free-form edit never invents a corpus family from its title.
    assert users.updates["target_roles"] == ["Data Analysis"]


def test_corpus_family_is_written_with_the_selected_real_title(wired) -> None:
    users, _onboarding, _bg = wired

    onboarding_service.save_target(
        object(), "u1", role_title="Software Engineer", role_family="Software Development"
    )

    assert users.updates["target_role_title"] == "Software Engineer"
    assert users.updates["target_roles"] == ["Software Development"]


def test_empty_titles_raises(wired) -> None:
    with pytest.raises(ValueError):
        onboarding_service.save_target(object(), "u1", role_titles=["", " "])


def test_role_readiness_covers_demanded_proficiency(monkeypatch) -> None:
    from app.services.scoring import aspirations

    # role demands: python@L4, sql@L3 (total 7); user has python@L4, sql@L2 -> met 6
    monkeypatch.setattr(
        aspirations, "fetch_aspiration_skills", lambda _repo, _roles: {"python": 4, "sql": 3}
    )
    readiness = aspirations.role_readiness(object(), {"python": 4, "sql": 2}, ["Data Scientist"])
    assert readiness == round(100 * 6 / 7)


def test_role_readiness_none_when_no_demand(monkeypatch) -> None:
    from app.services.scoring import aspirations

    monkeypatch.setattr(aspirations, "fetch_aspiration_skills", lambda _repo, _roles: {})
    assert aspirations.role_readiness(object(), {"python": 4}, ["Nowhere Role"]) is None
