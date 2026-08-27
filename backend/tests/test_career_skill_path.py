"""Career target snapshot + source seniority + skill-path classification."""
from __future__ import annotations

from pathlib import Path

from app.services.career_skill_path_cards import demand_kind, next_action, skill_state
from app.services.career_target import is_canonical_direction
from app.services.job_eligibility import (
    adjacent_source_bands,
    canonical_source_seniority,
    job_is_eligible,
    seniority_for_job,
    target_seniority_for_profile,
)
from app.services.match_credibility import seniority_compatibility


def test_job_seniority_is_the_source_field_not_the_title() -> None:
    assert seniority_for_job({
        "job_title": "Vice President of Engineering",
        "seniority_level": "entry",
        "min_years_experience": 12,
    }) == "entry"


def test_missing_source_seniority_stays_unknown() -> None:
    assert seniority_for_job({"job_title": "Senior Engineer"}) == ""


def test_source_field_aliases_are_consumed() -> None:
    assert canonical_source_seniority("Junior") == "entry"
    assert canonical_source_seniority("any") == ""


def test_any_is_not_invented_as_entry() -> None:
    assert target_seniority_for_profile({"target_seniority": "any"}) == ""
    assert target_seniority_for_profile({"target_seniority": None}) == ""
    assert target_seniority_for_profile({"target_seniority": "mid"}) == "mid"


def test_legacy_any_is_not_eligible_for_personalized_jobs() -> None:
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "any",
    }
    assert not job_is_eligible(profile, {
        "job_title": "Graduate Policy Research Associate",
        "role_domain": "Research & Science",
        "seniority_level": "entry",
    })


def test_adjacent_bands_omit_missing_ends() -> None:
    assert adjacent_source_bands("intern") == (None, "entry")
    assert adjacent_source_bands("mid") == ("entry", "senior")
    assert adjacent_source_bands("executive") == ("lead", None)


def test_canonical_direction_needs_title_family_and_band() -> None:
    assert not is_canonical_direction({
        "target_role_titles": ["Product Manager"],
        "target_roles": ["product_management"],
        "target_seniority": "any",
    })
    assert is_canonical_direction({
        "target_role_titles": ["Product Manager"],
        "target_roles": ["product_management"],
        "target_seniority": "mid",
    })


def test_core_and_neighbor_thresholds() -> None:
    assert demand_kind(62, 310) == "core"
    assert demand_kind(20, 310) == "neighbor"
    assert demand_kind(4, 80) is None
    assert demand_kind(4, 310) is None
    assert demand_kind(5, 100) == "neighbor"
    assert demand_kind(0, 10) is None


def test_on_cv_requires_evidence() -> None:
    assert skill_state(evidence_text="Shipped SQL at work", on_cv_row=True, assessed_level=0) == "on_cv"
    assert skill_state(evidence_text="  ", on_cv_row=True, assessed_level=2) == "practised"
    assert skill_state(evidence_text=None, on_cv_row=False, assessed_level=0) == "not_evidenced"


def test_next_action_gates_without_a_target() -> None:
    action = next_action([], needs_target=True)
    assert action and action["kind"] == "choose_target"


def test_assemble_gates_without_a_snapshot(monkeypatch) -> None:
    from app.services.career_skill_path_read import assemble

    monkeypatch.setattr(
        "app.services.career_skill_path_read.current_snapshot", lambda _db, _uid: None
    )
    monkeypatch.setattr(
        "app.services.career_skill_path_read._target_flow",
        lambda _db, _uid: {"kind": "awaiting_target"},
    )
    out = assemble(object(), "u1")
    assert out["needs_target"] is True
    assert out["snapshot"] is None
    assert out["next_action"]["kind"] == "choose_target"


def test_credibility_uses_source_seniority_not_title() -> None:
    job = {"title": "Junior Software Engineer", "seniority_level": "senior"}
    assert seniority_compatibility("senior", job) == "compatible"
    assert seniority_compatibility("senior", {"title": "Senior Engineer"}) == "unknown"


def test_retired_title_seniority_helpers_are_gone() -> None:
    root = Path(__file__).resolve().parents[1]
    eligibility = (root / "app/services/job_eligibility.py").read_text()
    credibility = (root / "app/services/match_credibility.py").read_text()
    scores = (root / "app/repositories/scores.py").read_text()
    assert "_seniority_from_title" not in eligibility
    assert "_seniority_from_years" not in eligibility
    assert "_seniority_from_title" not in credibility
    assert "def find_role_skill_rows" not in scores


def test_targeting_columns_only_write_through_commit() -> None:
    root = Path(__file__).resolve().parents[1]
    confirmation = (root / "app/services/skill_confirmation.py").read_text()
    intent = (root / "app/services/intent_chat_service.py").read_text()
    onboarding = (root / "app/services/onboarding_service.py").read_text()
    writer = (root / "app/services/targeting_write.py").read_text()
    assert "targeting_write.commit" in confirmation
    assert 'users_repo.update_profile(user_id, {"target_seniority"' not in confirmation
    assert "targeting_write.commit" in intent
    assert '{"target_locations": locations, "target_location"' not in intent
    assert 'users_repo.update_profile(user_id, {"target_seniority": value})' not in onboarding
    assert "record_from_profile(db, user_id, before, profile or {})" in writer
