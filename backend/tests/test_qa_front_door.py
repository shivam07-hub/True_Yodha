"""The QA path to the front door: what a reset writes, and whom it refuses."""
from __future__ import annotations

import pytest

from scripts.qa_front_door import RefusedAccount, reset_writes

PROFILE = {"id": "u1", "is_test_account": True, "onboarding_complete": True}
STATE = {"completed_at": "2026-10-19T09:29:24Z", "credible_job_saved_at": "2026-10-19T09:29:24Z"}
BASELINE = {"id": 502, "skills_confirmed_at": "2026-09-13T18:53:34Z"}


def test_a_reset_to_skills_reopens_the_skill_check_and_the_door():
    writes = reset_writes(PROFILE, STATE, BASELINE, to="skills")
    assert writes == [
        ("user_onboarding_state", {"user_id": "u1"}, {"completed_at": None, "credible_job_saved_at": None}),
        ("user_profiles", {"id": "u1"}, {
            "onboarding_complete": False,
            "target_role_titles": [], "target_roles": [],
        }),
        ("cv_versions", {"id": 502}, {"skills_confirmed_at": None}),
    ]


def test_a_reset_to_the_door_keeps_the_skills_confirmed():
    writes = reset_writes(PROFILE, STATE, BASELINE, to="door")
    assert [table for table, _, _ in writes] == ["user_onboarding_state", "user_profiles"]


def test_only_a_test_account_is_ever_reset():
    """Dev and prod share one database: this must never touch a real person."""
    with pytest.raises(RefusedAccount):
        reset_writes({**PROFILE, "is_test_account": False}, STATE, BASELINE, to="skills")
    with pytest.raises(RefusedAccount):
        reset_writes({**PROFILE, "is_test_account": None}, STATE, BASELINE, to="skills")


def test_a_skills_reset_needs_a_cv_to_check():
    with pytest.raises(RefusedAccount):
        reset_writes(PROFILE, STATE, None, to="skills")
