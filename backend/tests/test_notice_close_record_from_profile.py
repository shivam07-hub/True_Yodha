"""Close proof for the direction write's 500.

`targeting_write.commit` handed the user's token to the snapshot writer, and
`authenticated` may only read `career_target_snapshots`, so PUT
/users/me/profile and POST /preflight/run failed after the profile changed.
The writer now holds its own service-role client and makes one call,
`record_career_target`. `snapshot_writes` is the conftest recorder.
"""
from __future__ import annotations

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/services/career_target.py:record_from_profile"


def test_a_direction_write_is_one_call_on_the_service_role(snapshot_writes) -> None:
    """From a user token the old writer 500'd: `authenticated` may only read
    the table. The writer holds its own client, so no caller can hand it the
    wrong one, and the whole write is one round trip instead of five."""
    from app.services import career_target

    career_target.record_from_profile("u1", {
        "target_role_titles": ["Data Analyst"],
        "target_roles": ["Data Analysis"],
        "target_seniority": "junior",
        "target_locations": ["Pune", "Pune", "Delhi"],
    })

    assert snapshot_writes.calls == [("record_career_target", {
        "p_user_id": "u1",
        "p_role_title": "Data Analyst",
        "p_family": "Data Analysis",
        "p_seniority": "entry",
        "p_locations": ["Pune", "Delhi"],
    })]


def test_an_incomplete_direction_names_nothing_so_the_row_is_only_superseded(
    snapshot_writes,
) -> None:
    from app.services import career_target

    career_target.record_from_profile("u1", {"target_role_titles": ["Data Analyst"]})

    ((name, params),) = snapshot_writes.calls
    assert name == "record_career_target"
    assert params["p_role_title"] is None
    assert params["p_family"] is None
    assert params["p_seniority"] is None
