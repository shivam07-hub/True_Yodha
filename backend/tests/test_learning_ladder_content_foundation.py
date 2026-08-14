from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.services import upskilling_service
from tests.test_upskilling_service import (
    LEVEL,
    SKILL_ID,
    _answers,
    _FakeAdmin,
    _run,
    _seed_store,
)


def _reviewed_question(
    qid: int,
    *,
    correct_index: int = 1,
    skill_id: int = SKILL_ID,
    level: int = LEVEL,
) -> dict:
    distractors = {
        str(idx): f"option {idx} is wrong because it violates the source"
        for idx in range(4)
        if idx != correct_index
    }
    return {
        "id": qid,
        "skill_id": skill_id,
        "skill_key": "sql",
        "level": level,
        "status": "active",
        "review_status": "published",
        "content_edition_id": "edition-1",
        "source_url": "https://www.postgresql.org/docs/current/tutorial-select.html",
        "source_provenance": "Official PostgreSQL documentation",
        "license_posture": "official_documentation_reference",
        "reviewer": "content-reviewer",
        "reviewed_at": "2026-07-26T00:00:00+00:00",
        "verified_at": "2026-07-26",
        "question_text": f"Q{qid}",
        "options": ["a", "b", "c", "d"],
        "correct_index": correct_index,
        "explanation": f"because {qid}",
        "rationales": {
            "correct": f"option {correct_index} follows the source",
            "distractors": distractors,
        },
    }


@pytest.mark.asyncio
async def test_clear_records_assessment_without_creating_cv_skill():
    store = _seed_store()

    result, _reward = await _run(store, _answers(10))

    assert result["passed"] is True
    assert store["skill_assessed_level"][0]["assessed_level"] == LEVEL
    assert store["user_skills"] == []


@pytest.mark.asyncio
async def test_clear_does_not_raise_existing_cv_matched_level():
    store = _seed_store()
    store["user_skills"].append(
        {
            "user_id": "u1",
            "skill_id": SKILL_ID,
            "matched_level": 1,
            "forge_sessions_count": 0,
            "total_forge_minutes": 0,
        }
    )

    result, _reward = await _run(store, _answers(10))

    assert result["passed"] is True
    assert store["skill_assessed_level"][0]["assessed_level"] == LEVEL
    assert store["user_skills"][0]["matched_level"] == 1


def test_gap_calibration_records_assessment_without_creating_cv_skill():
    questions = [
        {
            "id": qid,
            "skill_id": SKILL_ID,
            "skill_key": "sql",
            "correct_index": 1,
        }
        for qid in range(1, 4)
    ]
    store = {
        "skill_questions": questions,
        "quiz_attempts": [
            {
                "id": "gap-1",
                "user_id": "u1",
                "mode": "gap_calibration",
                "question_ids": [1, 2, 3],
                "submitted_at": None,
            }
        ],
        "skill_assessed_level": [],
        "user_skills": [],
        "skills": [{"id": SKILL_ID, "taxonomy_key": "sql", "display_name": "SQL"}],
    }

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        result = upskilling_service.submit_gap(
            user_id="u1",
            assessment_id="gap-1",
            answers=[
                {"question_id": 1, "selected_index": 1},
                {"question_id": 2, "selected_index": 1},
                {"question_id": 3, "selected_index": 0},
            ],
            targets_by_key={"sql": 3},
        )

    assert result["readiness"][0]["assessed_level"] == 2
    assert store["skill_assessed_level"][0]["assessed_level"] == 2
    assert store["user_skills"] == []


def test_unsourced_questions_do_not_make_skill_servable():
    bank = [
        {
            "id": qid,
            "skill_id": SKILL_ID,
            "skill_key": "sql",
            "level": LEVEL,
            "status": "active",
        }
        for qid in range(1, 11)
    ]
    store = {
        "skill_questions": bank,
        "skills": [{"id": SKILL_ID, "taxonomy_key": "sql", "display_name": "SQL"}],
        "skill_assessed_level": [],
        "user_skills": [],
    }

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        assert upskilling_service.list_skills("u1") == []


def test_source_grounded_questions_make_skill_servable_without_human_review():
    bank = [
        {
            "id": qid,
            "skill_id": SKILL_ID,
            "skill_key": "sql",
            "level": LEVEL,
            "status": "active",
            "review_status": "generated",
            "question_text": f"Q{qid}",
            "options": ["a", "b", "c", "d"],
            "correct_index": 1,
            "explanation": f"because {qid}",
            "source_url": "https://www.postgresql.org/docs/current/tutorial-select.html",
        }
        for qid in range(1, 11)
    ]
    store = {
        "skill_questions": bank,
        "skills": [{"id": SKILL_ID, "taxonomy_key": "sql", "display_name": "SQL"}],
        "skill_assessed_level": [],
        "user_skills": [],
    }

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        assert upskilling_service.list_skills("u1")[0]["max_bank_level"] == LEVEL


def test_start_set_excludes_unsourced_generated_questions():
    store = _seed_store()

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        with pytest.raises(HTTPException) as exc:
            upskilling_service.start_set("u1", SKILL_ID, LEVEL)

    assert exc.value.status_code == 409


def test_start_set_snapshots_source_grounded_questions():
    bank = [_reviewed_question(qid) for qid in range(1, 11)]
    for question in bank:
        for key in ("reviewer", "reviewed_at", "review_status", "content_edition_id"):
            question.pop(key)
    store = {
        "skills": [{
            "id": SKILL_ID,
            "taxonomy_key": "sql",
            "display_name": "SQL",
            "practice_mode": "levelled",
        }],
        "skill_questions": bank,
        "quiz_attempts": [],
        "quiz_attempt_question_snapshots": [],
    }

    with patch("app.services.upskilling_service.get_supabase_admin", return_value=_FakeAdmin(store)):
        result = upskilling_service.start_set("u1", SKILL_ID, LEVEL)

    assert result["set_id"]
    assert len(store["quiz_attempt_question_snapshots"]) == 10
    first_snapshot = store["quiz_attempt_question_snapshots"][0]
    assert first_snapshot["attempt_id"] == result["set_id"]
    assert first_snapshot["question_text"]
    assert first_snapshot["correct_index"] == 1
    assert first_snapshot["source_url"].startswith("https://www.postgresql.org/")
    assert first_snapshot["content_edition_id"] is None
    assert first_snapshot["rationales"]["distractors"]


@pytest.mark.asyncio
async def test_submit_set_grades_from_snapshot_not_mutable_question_row():
    store = _seed_store()
    store["quiz_attempt_question_snapshots"] = [
        {
            "attempt_id": "att-1",
            "question_id": qid,
            "position": qid - 1,
            "question_text": f"Q{qid} original",
            "options": ["a", "b", "c", "d"],
            "correct_index": 1,
            "explanation": f"original explanation {qid}",
            "rationales": {
                "correct": "original correct rationale",
                "distractors": {"0": "wrong", "2": "wrong", "3": "wrong"},
            },
            "source_url": "https://www.postgresql.org/docs/current/tutorial-select.html",
            "content_edition_id": "edition-1",
        }
        for qid in range(1, 11)
    ]
    for row in store["skill_questions"]:
        row["correct_index"] = 0
        row["explanation"] = "mutated explanation"

    result, _reward = await _run(store, _answers(10))

    assert result["score"] == 10
    assert result["results"][0]["explanation"] == "original explanation 1"
    assert result["results"][0]["rationales"]["correct"] == "original correct rationale"


@pytest.mark.asyncio
async def test_replay_set_uses_snapshot_explanation_not_mutable_question_row():
    store = _seed_store()
    store["quiz_attempts"][0].update(
        {
            "submitted_at": "2026-07-26T00:00:00+00:00",
            "score": 10,
            "passed": True,
            "tokens_awarded": 50,
        }
    )
    store["quiz_answers"] = [
        {
            "attempt_id": "att-1",
            "question_id": qid,
            "selected_index": 1,
            "is_correct": True,
        }
        for qid in range(1, 11)
    ]
    store["quiz_attempt_question_snapshots"] = [
        {
            "attempt_id": "att-1",
            "question_id": qid,
            "position": qid - 1,
            "question_text": f"Q{qid} original",
            "options": ["a", "b", "c", "d"],
            "correct_index": 1,
            "explanation": f"original explanation {qid}",
            "rationales": {
                "correct": "original correct rationale",
                "distractors": {"0": "wrong", "2": "wrong", "3": "wrong"},
            },
            "source_url": "https://www.postgresql.org/docs/current/tutorial-select.html",
            "content_edition_id": "edition-1",
        }
        for qid in range(1, 11)
    ]
    for row in store["skill_questions"]:
        row["correct_index"] = 0
        row["explanation"] = "mutated explanation"

    fake = _FakeAdmin(store)
    with patch("app.services.upskilling_service.get_supabase_admin", return_value=fake), \
         patch("app.services.upskilling_service.xp_service.get_xp_balance", new=AsyncMock(return_value=1050)), \
         patch("app.services.upskilling_service.xp_service.reward", new=AsyncMock()) as reward:
        replay = await upskilling_service.submit_set("u1", "att-1", _answers(10), "idem-1")

    assert replay["score"] == 10
    assert replay["results"][0]["explanation"] == "original explanation 1"
    assert replay["results"][0]["rationales"]["correct"] == "original correct rationale"
    reward.assert_not_awaited()
