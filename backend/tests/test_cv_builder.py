from app.services.cv_builder import build_cv_draft, confidence_label


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
    )
    assert "CV Draft v2" in draft
    assert "Baseline CV text" in draft
    assert "Docker" in draft
    assert "Merged PR #42" in draft
    assert "Reduced setup time" in draft


def test_confidence_label() -> None:
    assert confidence_label(0.9) == "high"
    assert confidence_label(0.7) == "medium"
    assert confidence_label(0.2) == "needs review"
