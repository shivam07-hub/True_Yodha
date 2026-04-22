from app.services.cv_builder import (
    REQUIRED_EVIDENCE_DAYS,
    build_cv_draft,
    confidence_label,
    evidence_missing_prompt,
)


def test_required_evidence_days_is_seven() -> None:
    assert REQUIRED_EVIDENCE_DAYS == 7


def test_build_cv_draft_preserves_baseline_and_uses_only_evidence() -> None:
    draft = build_cv_draft(
        baseline_text="Baseline CV text",
        evidence_items=[
            {
                "skill": "Docker",
                "task": "Containerised the API",
                "proof": "Merged PR #42",
                "impact": "Reduced setup time",
                "date": "2026-04-23",
                "confidence": 0.9,
            }
        ],
        version_number=2,
        score_delta=5,
    )
    assert "CV Draft v2" in draft
    assert "Baseline CV text" in draft
    assert "Docker" in draft
    assert "Merged PR #42" in draft
    assert "Reduced setup time" in draft
    assert "+5.0" in draft


def test_missing_detail_prompt_asks_for_proof_first() -> None:
    prompt = evidence_missing_prompt({"skill": "Docker", "task": "Practice Docker"})
    assert prompt == "What proves the Docker milestone happened?"


def test_confidence_label() -> None:
    assert confidence_label(0.9) == "high"
    assert confidence_label(0.7) == "medium"
    assert confidence_label(0.2) == "needs review"
