"""Match Freshness — the two timestamps that answer "are these matches for the
direction this user holds now".

The states are tested here, once, because every consumer reads them instead of
comparing the columns itself. The case that produced this module: a direction
saved on 2026-09-19 against a run last stamped on 2026-07-03, which every
surface read as covered.
"""
from datetime import datetime, timedelta, timezone

from app.services.matching import match_freshness

NOW = datetime(2026, 9, 25, 12, 0, 0, tzinfo=timezone.utc)


def _profile(**overrides):
    base = {
        "target_role_titles": ["Digital Marketing"],
        "target_updated_at": (NOW - timedelta(days=2)).isoformat(),
        "last_match_run_at": (NOW - timedelta(days=1)).isoformat(),
    }
    base.update(overrides)
    return base


def test_run_after_the_direction_is_covered():
    assert match_freshness.state(_profile(), now=NOW) == "covered"


def test_run_before_the_direction_is_outstanding():
    profile = _profile(last_match_run_at=(NOW - timedelta(days=80)).isoformat())
    assert match_freshness.state(profile, now=NOW) == "outstanding"
    assert match_freshness.is_outstanding(profile, now=NOW) is True


def test_never_run_is_outstanding():
    profile = _profile(last_match_run_at=None)
    assert match_freshness.state(profile, now=NOW) == "outstanding"


def test_a_just_saved_direction_is_running_not_outstanding():
    """The compute takes 166-220s. Inside the grace a run is in flight, and
    nothing may re-enqueue it or call it a failure."""
    profile = _profile(
        target_updated_at=(NOW - timedelta(seconds=60)).isoformat(),
        last_match_run_at=None,
    )
    assert match_freshness.state(profile, now=NOW) == "running"
    assert match_freshness.is_outstanding(profile, now=NOW) is False


def test_grace_boundary_is_exclusive():
    at_edge = _profile(
        target_updated_at=(NOW - timedelta(seconds=match_freshness.RUN_GRACE_SECONDS)).isoformat(),
        last_match_run_at=None,
    )
    assert match_freshness.state(at_edge, now=NOW) == "outstanding"


def test_legacy_row_without_a_change_stamp_is_unknown():
    """Pre-20260804 profiles cannot answer the question. Reading them as
    outstanding would enqueue a run for every dormant account — a backfill
    wearing a forward pass's clothes."""
    profile = _profile(target_updated_at=None, last_match_run_at=None)
    assert match_freshness.state(profile, now=NOW) == "unknown"
    assert match_freshness.is_outstanding(profile, now=NOW) is False


def test_no_direction_is_its_own_state():
    profile = _profile(target_role_titles=[], target_role_title="")
    assert match_freshness.state(profile, now=NOW) == "no_direction"


def test_single_title_column_still_counts_as_a_direction():
    profile = _profile(
        target_role_titles=[],
        target_role_title="Growth Marketing",
        last_match_run_at=None,
    )
    assert match_freshness.state(profile, now=NOW) == "outstanding"


def test_naive_timestamps_are_read_as_utc():
    """A stored value without an offset must not throw on the read path."""
    profile = _profile(
        target_updated_at="2026-09-23T12:00:00",
        last_match_run_at="2026-09-24T12:00:00",
    )
    assert match_freshness.state(profile, now=NOW) == "covered"


def test_unparseable_timestamps_never_invent_work():
    profile = _profile(target_updated_at="not-a-date")
    assert match_freshness.state(profile, now=NOW) == "unknown"


def test_datetime_objects_are_accepted():
    profile = _profile(
        target_updated_at=NOW - timedelta(days=3),
        last_match_run_at=NOW - timedelta(days=4),
    )
    assert match_freshness.state(profile, now=NOW) == "outstanding"


def test_the_profile_flag_is_the_surface_answer():
    """`/users/me` carries `match_run_outstanding` because it already reads both
    columns; `/jobs/matches` must not pay a round trip for the same fact."""
    owed = _profile(last_match_run_at=(NOW - timedelta(days=80)).isoformat())
    assert match_freshness.is_outstanding(owed, now=NOW) is True
    assert match_freshness.is_outstanding(_profile(), now=NOW) is False


def test_an_unreadable_profile_is_not_a_verdict():
    """`match_freshness_inputs` fails soft to `{}` — which must read as
    `no_direction`, never as work owed."""
    assert match_freshness.state({}, now=NOW) == "no_direction"
    assert match_freshness.is_outstanding({}, now=NOW) is False
