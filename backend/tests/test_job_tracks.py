"""Job Tracks — the invariants, not the plumbing.

Every number cited here is measured: 88 of 106 users with a target set exactly
one role title, and 40 hand-verified matches for one candidate spread across 31
role families.
"""
from typing import Any

import pytest

from app.services.job_tracks import (
    MAX_TRACK_ROLE_TITLES,
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


def test_track_one_falls_back_through_the_legacy_target_fields():
    assert tracks_for(FakeRepo(), "u1", {"target_role_title": "Data Analyst"})[0].label == (
        "Data Analyst"
    )
    assert tracks_for(FakeRepo(), "u1", {"target_roles": ["Marketing"]})[0].label == "Marketing"


def test_a_user_with_no_target_at_all_still_gets_a_named_track():
    """Namitha's actual state on 2026-08-28: everything null since May."""
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
    assert len(normalise_role_titles([f"Role {n}" for n in range(20)])) == MAX_TRACK_ROLE_TITLES


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
    allowed, why = can_open_another(_tracks(1), {})
    assert allowed is False
    assert why == "Tailor a CV for a job in this search first."


def test_a_tailored_cv_opens_the_second_search():
    allowed, why = can_open_another(_tracks(1), {"tailored_cv_created_at": "2026-08-28T00:00:00Z"})
    assert allowed is True
    assert why is None


def test_the_cap_counts_the_profile_track():
    """Three searches total, not three on top of the one everyone has."""
    allowed, why = can_open_another(
        _tracks(MAX_TRACKS), {"tailored_cv_created_at": "2026-08-28T00:00:00Z"}
    )
    assert allowed is False
    assert str(MAX_TRACKS) in why


def test_the_reason_is_a_next_step_never_the_word_locked():
    for state in ({}, {"tailored_cv_created_at": "x"}):
        _, why = can_open_another(_tracks(MAX_TRACKS), state)
        assert why and "lock" not in why.lower()


def test_a_missing_onboarding_row_does_not_open_the_gate():
    assert can_open_another(_tracks(1), None)[0] is False


# ── positions ────────────────────────────────────────────────────────────────


def test_the_next_position_starts_after_the_profile():
    assert next_position(_tracks(1)) == 2


def test_a_closed_track_frees_its_slot():
    """`len + 1` would leak: close track 2 of 3 and the next open asks for 4,
    which the constraint takes and the render order shows as a gap."""
    profile, third = _tracks(3)[0], _tracks(3)[2]
    assert next_position([profile, third]) == 2
