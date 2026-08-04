"""Looking back through the onboarding journey costs nothing.

The step used to BE its facts — skills confirmed, target set — so "where you
are" and "what you decided" were one variable. Back meant deleting a decision:
step 2 returned blank, forward was impossible without re-choosing, and
re-choosing re-ran the matcher. A user reviewing their direction three times in
twenty seconds (prod, 2026-08-04) paid for three full match runs and re-typed
everything each time.

The cursor may only look at ground already covered, and it must never write.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import onboarding_service


class _Repo:
    """Any repository this path might reach. Every method that writes raises —
    reviewing a completed step is a read, and a test that lets it write would
    stop noticing when it doesn't."""

    def __init__(self, **reads: Any) -> None:
        self._reads = reads

    def __getattr__(self, name: str):
        if name in self._reads:
            value = self._reads[name]
            return value if callable(value) else (lambda *_a, **_k: value)
        raise AssertionError(f"reviewing a completed step must not call {name}()")


_PROFILE = {
    "target_role_title": "Solution Architect",
    "target_role_titles": ["Solution Architect"],
    "target_roles": ["Business Leadership"],
    "target_seniority": "mid",
    "target_locations": ["Bengaluru"],
    "target_updated_at": "2026-08-04T05:00:00+00:00",
    "last_match_run_at": "2026-08-04T05:02:00+00:00",
}

_FAMILY = {
    "family": "Business Leadership",
    "label": "SOLUTION ARCHITECT",
    "open_count": 163,
    "matched_skill_count": 5,
}


@pytest.fixture
def at_step_three(monkeypatch):
    """A user who has finished the journey and is sitting on the shortlist."""
    monkeypatch.setattr(
        onboarding_service,
        "_current_result",
        lambda _db, _uid: {"kind": "full_result_ready", "journey_step": 3, "shortlist": []},
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository", lambda _db: _Repo(get_profile=_PROFILE)
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository", lambda _db: _Repo(latest_baseline={"id": 17})
    )
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Repo())
    monkeypatch.setattr(onboarding_service, "_candidate_skills", lambda *_a: [{"name": "Python"}])
    monkeypatch.setattr(
        onboarding_service,
        "_seniority_suggestion",
        lambda _b: {"value": "mid", "source": "experience_years", "years": 4, "needs_choice": False},
    )
    monkeypatch.setattr(
        onboarding_service,
        "RoleFamiliesRepository",
        lambda _db: _Repo(resolve_families=[_FAMILY], list_families=[_FAMILY]),
    )


def test_no_step_returns_where_the_user_actually_is(at_step_three) -> None:
    result = onboarding_service.get_result(object(), "u1")
    assert result["kind"] == "full_result_ready"
    assert result["furthest_step"] == 3


def test_stepping_back_to_two_restores_the_saved_direction(at_step_three) -> None:
    result = onboarding_service.get_result(object(), "u1", step=2)

    assert result["kind"] == "awaiting_target"
    assert result["furthest_step"] == 3
    assert result["selected"]["families"] == [_FAMILY]
    assert result["selected"]["seniority"] == "mid"
    assert result["selected"]["locations"] == ["Bengaluru"]


def test_a_chosen_family_leads_the_list_and_is_never_duplicated(at_step_three) -> None:
    # It is also the top suggestion here — the picked row must appear once, and
    # first, so the form can show it selected without a phantom second card.
    families = onboarding_service.get_result(object(), "u1", step=2)["families"]
    assert families == [_FAMILY]


def test_stepping_back_to_one_reopens_the_skill_review(at_step_three) -> None:
    result = onboarding_service.get_result(object(), "u1", step=1)
    assert result["kind"] == "awaiting_skill_confirmation"
    assert result["skills"] == [{"name": "Python"}]
    assert result["furthest_step"] == 3


def test_a_step_at_or_beyond_the_furthest_cannot_skip_work(at_step_three, monkeypatch) -> None:
    monkeypatch.setattr(
        onboarding_service,
        "_current_result",
        lambda _db, _uid: {"kind": "awaiting_target", "journey_step": 2},
    )
    # Asking for 3 while standing on 2 must not fabricate a shortlist.
    assert onboarding_service.get_result(object(), "u1", step=3)["kind"] == "awaiting_target"
    assert onboarding_service.get_result(object(), "u1", step=2)["kind"] == "awaiting_target"


def test_review_degrades_to_the_current_step_without_a_baseline(at_step_three, monkeypatch) -> None:
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository", lambda _db: _Repo(latest_baseline=None)
    )
    assert onboarding_service.get_result(object(), "u1", step=1)["kind"] == "full_result_ready"
