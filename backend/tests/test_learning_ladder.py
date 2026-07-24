"""Learning Ladder — pure-logic tests (no live LLM/DB calls).

CLAUDE.md backlog #15: bank growth is technical-only, real-taxonomy-only, and
never ships an unverified answer key as 'active'.
"""
import json

from app.services.learning_ladder_prompts import (
    GeneratedQuestion,
    TargetSkill,
    apply_verify_verdicts,
    build_generate_prompt,
    build_verify_prompt,
    dedupe_hash,
    parse_generated_questions,
)
from app.services.learning_ladder import rows_for_insert, LadderResult

SKILL = TargetSkill(id=67, display_name="Python (Programming Language)",
                     l1_domain="Information Technology", l2_cluster="Scripting Languages")


def _q(text="What does len([1,2,3]) return?", correct=2):
    return GeneratedQuestion(
        question_text=text,
        options=["1", "2", "3", "4"],
        correct_index=correct,
        explanation="len() counts the elements; the list has 3.",
    )


def test_dedupe_hash_stable_and_normalizes_whitespace():
    a = dedupe_hash("What is  a decorator?")
    b = dedupe_hash("what is a decorator?  ")
    assert a == b
    assert len(a) == 64  # sha256 hex


def test_dedupe_hash_differs_for_different_text():
    assert dedupe_hash("question A") != dedupe_hash("question B")


def test_build_generate_prompt_names_skill_and_level():
    messages = build_generate_prompt(SKILL, 3)
    assert messages[0]["role"] == "system"
    assert "Python (Programming Language)" in messages[1]["content"]
    assert "level 3/5" in messages[1]["content"]
    assert "intermediate" in messages[1]["content"]


def test_parse_generated_questions_happy_path():
    raw = json.dumps({
        "questions": [
            {
                "question_text": "What does len([1,2,3]) return?",
                "options": ["1", "2", "3", "4"],
                "correct_index": 2,
                "explanation": "The list has 3 elements.",
            }
        ]
    })
    out = parse_generated_questions(raw)
    assert len(out) == 1
    assert out[0].correct_index == 2
    assert out[0].verified is False


def test_parse_generated_questions_strips_code_fence():
    raw = "```json\n" + json.dumps({
        "questions": [{
            "question_text": "q", "options": ["a", "b", "c", "d"],
            "correct_index": 0, "explanation": "e",
        }]
    }) + "\n```"
    out = parse_generated_questions(raw)
    assert len(out) == 1


def test_parse_generated_questions_drops_malformed_items():
    raw = json.dumps({"questions": [
        {"question_text": "", "options": ["a", "b", "c", "d"], "correct_index": 0, "explanation": "e"},
        {"question_text": "q", "options": ["a", "b", "c"], "correct_index": 0, "explanation": "e"},  # 3 opts
        {"question_text": "q", "options": ["a", "b", "c", "d"], "correct_index": 9, "explanation": "e"},  # oob
        {"question_text": "q", "options": ["a", "b", "c", "d"], "correct_index": 0, "explanation": ""},  # no expl
        {"question_text": "q", "options": ["a", "b", "c", "d"], "correct_index": 1, "explanation": "e"},  # valid
    ]})
    out = parse_generated_questions(raw)
    assert len(out) == 1
    assert out[0].correct_index == 1


def test_parse_generated_questions_malformed_json_returns_empty():
    assert parse_generated_questions("not json at all") == []
    assert parse_generated_questions("") == []


def test_build_verify_prompt_carries_claimed_index():
    messages = build_verify_prompt(SKILL, 2, [_q()])
    assert "claimed_correct_index" in messages[1]["content"]
    assert "level 2/5" in messages[1]["content"]


def test_apply_verify_verdicts_agree_marks_verified():
    q = _q()
    raw = json.dumps({"verdicts": [{"index": 0, "agrees": True, "correct_index": 2}]})
    out, ok = apply_verify_verdicts([q], raw)
    assert ok is True
    assert out[0].verified is True
    assert out[0].correct_index == 2


def test_apply_verify_verdicts_disagree_applies_correction():
    q = _q(correct=1)  # generator claimed index 1 (wrong)
    raw = json.dumps({"verdicts": [{"index": 0, "agrees": False, "correct_index": 2}]})
    out, ok = apply_verify_verdicts([q], raw)
    assert ok is True
    assert out[0].correct_index == 2
    assert out[0].verified is True


def test_apply_verify_verdicts_unusable_response_is_fail_soft():
    q = _q()
    out, ok = apply_verify_verdicts([q], "garbage, not json")
    assert ok is False
    assert out[0].verified is False  # unchanged, still unverified


def test_apply_verify_verdicts_missing_index_leaves_question_unverified():
    q = _q()
    raw = json.dumps({"verdicts": []})
    out, ok = apply_verify_verdicts([q], raw)
    assert ok is True
    assert out[0].verified is False


def test_rows_for_insert_verified_ships_active_unverified_ships_review():
    verified_q = _q()
    verified_q.verified = True
    unverified_q = _q(text="different question")
    result = LadderResult(skill=SKILL, by_level={1: [verified_q, unverified_q]})
    rows = rows_for_insert(result)
    assert len(rows) == 2
    by_status = {r["question_text"]: r["status"] for r in rows}
    assert by_status[verified_q.question_text] == "active"
    assert by_status[unverified_q.question_text] == "review"
    assert all(r["skill_id"] == 67 for r in rows)
    assert all(r["level"] == 1 for r in rows)


def test_rows_for_insert_dedupe_hash_matches_pure_fn():
    q = _q()
    q.verified = True
    result = LadderResult(skill=SKILL, by_level={1: [q]})
    rows = rows_for_insert(result)
    assert rows[0]["dedupe_hash"] == dedupe_hash(q.question_text)
