"""Editable target role at point-of-use (issue #145).

Decision A: a role edit routes through the canonical `save_target`, which moves
`target_role_title` + derived `target_roles` clusters in lockstep and enqueues a
score recompute + re-match. A point-of-use "edit role" supplies only the new
role title and must PRESERVE the user's existing seniority + location.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import onboarding_service, targeting_write
from app.services.job_eligibility import eligible_bands_for_profile


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
    # omitted fields stay on the stored profile; the patch does not rewrite them
    assert "target_seniority" not in users.updates
    assert "target_locations" not in users.updates
    assert users._profile["target_seniority"] == "senior"
    assert users._profile["target_locations"] == ["Bengaluru, India"]
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
    # The second title still opens its band — but it is DERIVED at read time, not
    # regex'd into the stored answer. `explored_career_bands` holds explicit picks
    # only, so a band a title implied can be removed and does not reappear on the
    # next save, and an untouched column keeps "nobody has been asked" readable.
    assert "explored_career_bands" not in users.updates
    assert eligible_bands_for_profile(users.updates) == {
        "business_product_operations",
        "engineering_data",
    }


def test_chosen_bands_are_the_answer_and_a_title_cannot_overwrite_them(wired) -> None:
    """The defect this contract exists to stop: Direction saves the band and the
    roles in ONE call, and the roles used to win."""
    users, _onboarding, _bg = wired

    onboarding_service.save_target(
        object(),
        "u1",
        role_titles=["Product Manager", "Data Scientist"],
        career_bands=["design_creative", "research_people_public_impact"],
    )

    assert users.updates["target_career_band"] == "design_creative"
    assert users.updates["explored_career_bands"] == [
        "design_creative",
        "research_people_public_impact",
    ]
    # Neither title's band leaks in, and the primary is the band they picked first.
    assert eligible_bands_for_profile(users.updates) == {
        "design_creative",
        "research_people_public_impact",
    }


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


# ── The scoping key may only name directions that exist ───────────────────────


class _FakeFamilyTable:
    """Stands in for `role_family_labels`, corpus of exactly two directions."""

    CORPUS = {"Data Analysis", "General Sales Practices"}

    def __init__(self) -> None:
        self._wanted: list[str] = []

    def select(self, _cols: str) -> "_FakeFamilyTable":
        return self

    def in_(self, _col: str, values: list[str]) -> "_FakeFamilyTable":
        self._wanted = values
        return self

    def execute(self) -> Any:
        kept = [{"family": f} for f in self._wanted if f in self.CORPUS]
        return SimpleNamespace(data=kept)


class _NoOpTable:
    """Everything the snapshot writer touches. `commit` records a
    CareerTargetSnapshot off the resulting profile, so a repo carrying a client
    exercises that path too — this keeps the test about the scoping key."""

    def __getattr__(self, _name: str) -> Any:
        return lambda *args, **kwargs: self

    def execute(self) -> Any:
        return SimpleNamespace(data=[])


class _FakeDb:
    def table(self, name: str) -> Any:
        return _FakeFamilyTable() if name == "role_family_labels" else _NoOpTable()


class _RepoWithCorpus(_FakeUsersRepo):
    def __init__(self, profile: dict) -> None:
        super().__init__(profile)
        self._db = _FakeDb()


def test_a_typed_title_never_becomes_a_matcher_scoping_key() -> None:
    """The live defect: 41 stored keys across 36 users were raw typed titles
    ("seo", "hr", "any"), and `get_candidate_job_ids_for_roles` is an equality on
    `jobs.role_family` — so those users got zero role-right jobs, silently."""
    repo = _RepoWithCorpus({})

    targeting_write.commit(repo, "u1", {
        "target_role_titles": ["Data Analyst", "Teacher or a tele caller"],
        "role_families": ["Data Analysis", "Teacher or a tele caller"],
    })

    assert repo.updates["target_roles"] == ["Data Analysis"]
    # The title is the user's stated goal and survives untouched — only the
    # scope is cleaned.
    assert repo.updates["target_role_titles"] == ["Data Analyst", "Teacher or a tele caller"]


def test_an_all_phantom_scope_is_dropped_not_emptied() -> None:
    """An empty scoping key is not a narrower search, it is no search
    (invariant 5). Whatever is stored survives until a caller that actually
    resolved a family replaces it."""
    repo = _RepoWithCorpus({"target_roles": ["Data Analysis"]})

    targeting_write.commit(repo, "u1", {
        "target_role_titles": ["seo"],
        "role_families": ["seo"],
    })

    assert "target_roles" not in repo.updates


def test_a_real_scope_passes_through_untouched() -> None:
    repo = _RepoWithCorpus({})

    targeting_write.commit(repo, "u1", {
        "target_role_titles": ["Data Analyst"],
        "role_families": ["Data Analysis"],
    })

    assert repo.updates["target_roles"] == ["Data Analysis"]
