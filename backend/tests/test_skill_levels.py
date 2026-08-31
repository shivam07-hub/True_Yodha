"""What a certificate is allowed to claim.

This file exists because the answer was wrong in production. Every level's text
described what a person DOES at work — "applies it independently on real
projects", "architects and mentors others" — and that text went onto users' CVs
as the meaning of a ten-question multiple-choice pass. Measured the same day:
levels 4 and 5 had a 100% pass rate across five users.
"""

from __future__ import annotations

from app.repositories.skill_certificates import cv_line
from app.services.learning_ladder_prompts import _LEVEL_LABEL
from app.services.skill_levels import (
    LEVEL_STANDARDS,
    MAX_LEVEL,
    certificate_clause,
    prompt_label,
    standard_for,
)

# Claims about a person's work history. A written test cannot establish any of
# them, so none may appear in anything a user hands to an employer.
UNEARNABLE = (
    "mentor",
    "architects",
    "real projects",
    "on the job",
    "in production",
    "with guidance",
    "team",
)


def test_no_certificate_claims_a_work_history():
    """The regression that shipped. Ten questions show knowledge; they do not
    show that someone did the thing at work."""
    for level in LEVEL_STANDARDS:
        claim = certificate_clause(level).lower()
        for phrase in UNEARNABLE:
            assert phrase not in claim, f"L{level} certificate claims '{phrase}': {claim}"


def test_the_cv_line_never_carries_an_unearnable_claim():
    for level in LEVEL_STANDARDS:
        line = cv_line({
            "skill_display_name": "Cold Calling",
            "achieved_level": level,
            "passed_at": "2026-08-31T00:00:00Z",
            "verification_id": "msk_x",
        }).lower()
        for phrase in UNEARNABLE:
            assert phrase not in line, f"L{level} CV line claims '{phrase}'"


def test_the_line_says_it_was_assessed_not_verified():
    """"Verified" implies we checked their work. We set an exam and marked it."""
    line = cv_line({
        "skill_display_name": "Cold Calling",
        "achieved_level": 3,
        "passed_at": "2026-08-31T00:00:00Z",
        "verification_id": "msk_x",
    })
    assert "Assessed by Myro" in line
    assert "Verified by" not in line


def test_every_level_carries_both_renderings_and_they_differ():
    """One bar, two sentences. If they were ever the same string, the narrower
    one has been widened back to the person-shaped claim."""
    for level in LEVEL_STANDARDS:
        std = standard_for(level)
        assert std is not None
        assert std.targets and std.assessed
        assert std.targets != std.assessed


def test_the_generator_brief_still_targets_a_person():
    """The calibration half is allowed — indeed required — to describe who the
    level is aimed at. Narrowing it too would make the questions vaguer."""
    assert "architects" in prompt_label(5)
    assert "real projects" in prompt_label(3)


def test_the_generator_and_the_certificate_read_one_standard():
    """No second copy of the level meanings anywhere. The bank and the claim
    must move together or the certificate describes an untested bar."""
    assert set(_LEVEL_LABEL) == set(LEVEL_STANDARDS)
    for level, label in _LEVEL_LABEL.items():
        assert label == prompt_label(level)


def test_levels_run_one_to_five_and_the_line_states_the_scale():
    assert sorted(LEVEL_STANDARDS) == [1, 2, 3, 4, 5]
    assert MAX_LEVEL == 5
    line = cv_line({
        "skill_display_name": "X", "achieved_level": 2,
        "passed_at": "2026-08-31T00:00:00Z", "verification_id": "v",
    })
    assert "Level 2 of 5" in line


def test_an_unknown_level_claims_nothing():
    assert certificate_clause(9) == ""
    assert prompt_label(0) == ""
