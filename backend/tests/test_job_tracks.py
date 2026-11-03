"""Job Tracks — the invariants, not the plumbing.

Every number cited here is measured: 88 of 106 users with a target set exactly
one role title, and 40 hand-verified matches for one candidate spread across 31
role families.
"""
from typing import Any

import pytest

from app.services.career_target import MAX_TARGET_ROLES
from app.services.job_tracks import (
    MAX_TRACKS,
    Track,
    can_open_another,
    next_position,
    normalise_role_titles,
    tracks_for,
)


class FakeRepo:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        return self.rows


def _row(id: int, label: str, position: int, titles: list[str] | None = None):
    return {
        "id": id,
        "label": label,
        "position": position,
        "role_titles": titles or [label],
    }


# ── track 1 is the profile ───────────────────────────────────────────────────


def test_a_user_with_no_stored_track_still_has_one_search():
    """The 83%. They must have a track without having a row."""
    tracks = tracks_for(FakeRepo(), "u1", {"target_role_titles": ["Consulting"]})
    assert len(tracks) == 1
    assert tracks[0].is_profile
    assert tracks[0].id is None
    assert tracks[0].role_titles == ["Consulting"]


def test_track_one_is_never_a_row():
    """Backfilling 238 users would create a second source of truth for the
    common case, and hand everyone a structure they never asked for."""
    tracks = tracks_for(
        FakeRepo([_row(7, "Marketing", 2)]), "u1", {"target_role_titles": ["Consulting"]}
    )
    assert [t.id for t in tracks] == [None, 7]
    assert [t.position for t in tracks] == [1, 2]


def test_track_one_is_named_by_the_users_own_words():
    """"Consulting" beside "Marketing" reads as two searches. "Your search"
    beside "Marketing" reads as one search and one exception."""
    tracks = tracks_for(FakeRepo(), "u1", {"target_role_titles": ["Consulting", "Strategy"]})
    assert tracks[0].label == "Consulting"


def test_track_one_is_named_by_its_titles_then_its_families():
    # `target_role_title` is the synced copy of titles[0], never a source
    # (CONTEXT → Targeting Brief).
    assert tracks_for(FakeRepo(), "u1", {"target_role_titles": ["Data Analyst"]})[0].label == (
        "Data Analyst"
    )
    assert tracks_for(FakeRepo(), "u1", {"target_roles": ["Marketing"]})[0].label == "Marketing"
    assert tracks_for(FakeRepo(), "u1", {"target_role_title": "Data Analyst"})[0].label == "Your search"


def test_a_user_with_no_target_at_all_still_gets_a_named_track():
    """Diya's actual state on 2026-08-28: everything null since May."""
    track = tracks_for(FakeRepo(), "u1", {})[0]
    assert track.is_profile
    assert track.label == "Your search"
    assert track.role_titles == []


def test_stored_tracks_render_in_position_order_whatever_the_read_returned():
    tracks = tracks_for(
        FakeRepo([_row(9, "Product", 3), _row(7, "Marketing", 2)]), "u1", {}
    )
    assert [t.label for t in tracks] == ["Your search", "Marketing", "Product"]


# ── role words ───────────────────────────────────────────────────────────────


def test_role_titles_are_deduplicated_case_insensitively_and_capped():
    out = normalise_role_titles(["Consulting", "consulting", " Strategy "])
    assert out == ["Consulting", "Strategy"]
    many = [f"Role {n}" for n in range(MAX_TARGET_ROLES + 5)]
    assert len(normalise_role_titles(many)) == MAX_TARGET_ROLES


def test_role_titles_keep_the_order_the_user_gave():
    assert normalise_role_titles(["Marketing", "Brand"]) == ["Marketing", "Brand"]


@pytest.mark.parametrize("junk", [None, "Consulting", 7, {"a": 1}])
def test_role_titles_from_a_non_list_are_empty_not_an_error(junk):
    assert normalise_role_titles(junk) == []


# ── opening another ──────────────────────────────────────────────────────────


def _tracks(n: int) -> list[Track]:
    return [Track(id=None if i == 0 else i, label=f"T{i}", role_titles=[], position=i + 1)
            for i in range(n)]


def test_a_second_search_is_earned_by_finishing_the_first():
    """Until someone has felt the loop close, "open another search" is a
    setting. After, it is the obvious next move."""
    allowed, why = can_open_another(_tracks(1), has_tailored_cv=False)
    assert allowed is False
    assert why == "Tailor a CV for a job in this search first."


def test_a_tailored_cv_opens_the_second_search():
    allowed, why = can_open_another(_tracks(1), has_tailored_cv=True)
    assert allowed is True
    assert why is None


def test_the_cap_counts_the_profile_track():
    """Three searches total, not three on top of the one everyone has."""
    allowed, why = can_open_another(_tracks(MAX_TRACKS), has_tailored_cv=True)
    assert allowed is False
    assert str(MAX_TRACKS) in why


def test_the_reason_is_a_next_step_never_the_word_locked():
    for tailored in (False, True):
        _, why = can_open_another(_tracks(MAX_TRACKS), has_tailored_cv=tailored)
        assert why and "lock" not in why.lower()


# ── positions ────────────────────────────────────────────────────────────────


def test_the_next_position_starts_after_the_profile():
    assert next_position(_tracks(1)) == 2


def test_a_closed_track_frees_its_slot():
    """`len + 1` would leak: close track 2 of 3 and the next open asks for 4,
    which the constraint takes and the render order shows as a gap."""
    profile, third = _tracks(3)[0], _tracks(3)[2]
    assert next_position([profile, third]) == 2


# ── what reaches the match run ───────────────────────────────────────────────


class _Repo:
    client = object()


def _returning(tracks: list[Track]):
    return lambda _repo, _uid, _profile: tracks


def test_a_single_track_user_sends_no_tracks_to_the_ranker(monkeypatch: Any):
    """Load-bearing, not an optimisation. `()` is the pre-tracks path, and the
    83% must keep taking it exactly."""
    from app.services import jobs_workflow

    monkeypatch.setattr(
        jobs_workflow.job_tracks,
        "tracks_for",
        _returning([Track(id=None, label="Consulting", role_titles=["Consulting"], position=1)]),
    )
    assert jobs_workflow._track_specs(_Repo(), "u1", {}) == ()


def test_two_tracks_reach_the_ranker_with_their_own_words_and_quota(monkeypatch: Any):
    from app.services import jobs_workflow

    monkeypatch.setattr(
        jobs_workflow.job_tracks,
        "tracks_for",
        _returning([
            Track(id=None, label="Consulting", role_titles=["Consulting"], position=1),
            Track(id=4, label="Marketing", role_titles=["Marketing", "Brand"], position=2),
        ]),
    )
    specs = jobs_workflow._track_specs(_Repo(), "u1", {})

    assert [spec.track_id for spec in specs] == [None, 4]
    assert specs[1].role_titles == ("Marketing", "Brand")
    assert {spec.quota for spec in specs} == {jobs_workflow.TRACK_QUOTA}
    assert {spec.deep for spec in specs} == {jobs_workflow.TRACK_DEEP}


def test_a_failed_track_read_costs_the_grouping_never_the_run(monkeypatch: Any):
    from app.services import jobs_workflow

    def _boom(_repo, _uid, _profile):
        raise RuntimeError("schema cache lag")

    monkeypatch.setattr(jobs_workflow.job_tracks, "tracks_for", _boom)
    assert jobs_workflow._track_specs(_Repo(), "u1", {}) == ()


def test_two_tracks_cost_barely_more_deep_evals_than_one_search_does():
    """The latency promise, as arithmetic: 2 x TRACK_DEEP against the 15 a
    single-track run deep-evaluates today."""
    from app.services import jobs_workflow

    assert 2 * jobs_workflow.TRACK_DEEP <= jobs_workflow.MATCH_TRIAGE_KEEP + 2


# ── the gate reads the fact ──────────────────────────────────────────────────


class _CVRows:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.data = rows
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    def table(self, name: str) -> "_CVRows":
        self.calls.append(("table", (name,)))
        return self

    def __getattr__(self, name: str):
        def record(*args: Any) -> "_CVRows":
            self.calls.append((name, args))
            return self
        return record

    def execute(self) -> "_CVRows":
        return self


def test_the_gate_reads_the_tailored_cv_itself():
    """Not a stamp beside it. The stamp started after the fact did, and 8 of the
    24 people holding a tailored CV were refused for having no stamp."""
    from app.repositories.cv import CVVersionsRepository

    found = _CVRows([{"id": 9}])
    assert CVVersionsRepository(found).has_tailored("u1") is True
    assert ("table", ("cv_versions",)) in found.calls
    assert ("eq", ("user_id", "u1")) in found.calls
    assert ("neq", ("kind", "baseline_upload")) in found.calls

    assert CVVersionsRepository(_CVRows([])).has_tailored("u1") is False
