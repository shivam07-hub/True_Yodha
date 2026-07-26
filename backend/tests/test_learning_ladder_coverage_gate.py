from __future__ import annotations

from unittest.mock import patch

from app.services import upskilling_service
from tests.test_learning_ladder_content_foundation import _reviewed_question
from tests.test_upskilling_service import _FakeAdmin


def _complete_skill_rows(skill_count: int) -> list[dict]:
    return [
        _reviewed_question(
            qid=skill_id * 1000 + level * 100 + offset,
            skill_id=skill_id,
            level=level,
        )
        for skill_id in range(1, skill_count + 1)
        for level in range(1, 6)
        for offset in range(10)
    ]


def test_complete_ladders_are_comprehensive_before_catalog_target_is_met():
    store = {"skill_questions": _complete_skill_rows(49)}

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        summary = upskilling_service.coverage_summary()

    assert summary["coverage_gate_met"] is False
    assert summary["publication_scope"] == "comprehensive"
    assert summary["complete_skill_count"] == 49
    assert summary["target_skill_min"] == 50


def test_coverage_gate_reports_comprehensive_at_fifty_complete_skills():
    store = {"skill_questions": _complete_skill_rows(50)}

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        summary = upskilling_service.coverage_summary()

    assert summary["coverage_gate_met"] is True
    assert summary["publication_scope"] == "comprehensive"
    assert summary["complete_skill_count"] == 50
    assert summary["questions_per_level_min"] == 10
