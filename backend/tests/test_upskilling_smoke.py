import pytest

from scripts.smoke_upskilling import (
    SmokeFailure,
    choose_startable_skill,
    validate_start_response,
)


def test_choose_startable_skill_uses_next_demonstrated_level() -> None:
    skill, level = choose_startable_skill(
        [
            {
                "skill_id": 7,
                "display_name": "Machine Learning",
                "cleared_level": 1,
                "next_level": 2,
                "max_bank_level": 5,
                "locked": False,
            }
        ]
    )

    assert skill["skill_id"] == 7
    assert level == 2


def test_choose_startable_skill_rejects_unservable_ladders() -> None:
    with pytest.raises(SmokeFailure, match="No startable skill"):
        choose_startable_skill(
            [
                {
                    "skill_id": 7,
                    "cleared_level": 2,
                    "next_level": 3,
                    "max_bank_level": 2,
                    "locked": False,
                }
            ]
        )


def test_validate_start_response_requires_ten_safe_questions() -> None:
    payload = {
        "set_id": "attempt-1",
        "questions": [
            {
                "id": question_id,
                "question_text": f"Question {question_id}",
                "options": ["a", "b", "c", "d"],
            }
            for question_id in range(1, 11)
        ],
    }

    validate_start_response(payload)


def test_validate_start_response_rejects_answer_key_leak() -> None:
    payload = {
        "set_id": "attempt-1",
        "questions": [
            {
                "id": question_id,
                "question_text": f"Question {question_id}",
                "options": ["a", "b", "c", "d"],
                "correct_index": 0,
            }
            for question_id in range(1, 11)
        ],
    }

    with pytest.raises(SmokeFailure, match="answer key"):
        validate_start_response(payload)
