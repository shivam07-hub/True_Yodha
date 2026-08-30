"""Learning Ladder — pure prompt-building + response parsing.

Split out of learning_ladder.py to keep both files under the 300-line rule.
No DB, no LLM calls — safe to unit test without a live provider.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from app.services.skill_levels import LEVEL_STANDARDS, prompt_label

QUESTIONS_PER_LEVEL = 10

# The calibration brief. Shared with the certificate that will claim this level
# on a user's CV — see app/services/skill_levels.py. If these two ever describe
# different bars, the certificate asserts something the questions never tested.
_LEVEL_LABEL = {level: prompt_label(level) for level in LEVEL_STANDARDS}


@dataclass
class TargetSkill:
    id: int
    display_name: str
    l1_domain: str
    l2_cluster: str


@dataclass
class GeneratedQuestion:
    question_text: str
    options: list[str]
    correct_index: int
    explanation: str
    verified: bool = False


def dedupe_hash(question_text: str) -> str:
    normalized = " ".join(question_text.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _extract_json_array(raw: str, key: str) -> list[dict] | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith("json"):
            text = text[nl + 1:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(parsed, dict):
        return None
    items = parsed.get(key)
    return items if isinstance(items, list) else None


def build_generate_prompt(skill: TargetSkill, level: int, count: int = QUESTIONS_PER_LEVEL) -> list[dict]:
    system = (
        "You are an expert technical assessor writing a multiple-choice skill "
        "quiz. Every question must test genuine understanding of the skill "
        "itself — never trivia, never ambiguous, exactly one defensibly "
        "correct option. Reply ONLY with JSON."
    )
    user = (
        f"Skill: {skill.display_name} (taxonomy area: {skill.l1_domain} / "
        f"{skill.l2_cluster}).\n"
        f"Proficiency level {level}/5 — {_LEVEL_LABEL[level]}.\n\n"
        f"Write exactly {count} multiple-choice questions calibrated "
        f"to that level (harder than level {level - 1}, easier than level "
        f"{level + 1}, if applicable). Each question needs exactly 4 options, "
        "one correct. Keep explanations SHORT — one sentence stating why the "
        "correct option is right. Keep the whole reply compact; do not pad.\n\n"
        'Reply as JSON: {"questions": [{"question_text": "...", '
        '"options": ["...","...","...","..."], "correct_index": 0, '
        '"explanation": "..."}]}'
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def parse_generated_questions(raw: str) -> list[GeneratedQuestion]:
    """Defensively parse the generate-pass response. Drops any item that
    doesn't have exactly 4 options / a valid correct_index / non-empty text —
    never lets a malformed row through to the bank."""
    items = _extract_json_array(raw, "questions") or []
    out: list[GeneratedQuestion] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = str(item.get("question_text") or "").strip()
        options = item.get("options")
        explanation = str(item.get("explanation") or "").strip()
        try:
            correct_index = int(item.get("correct_index"))
        except (TypeError, ValueError):
            continue
        if not text or not explanation:
            continue
        if not isinstance(options, list) or len(options) != 4:
            continue
        if any(not isinstance(o, str) or not o.strip() for o in options):
            continue
        if not (0 <= correct_index <= 3):
            continue
        out.append(
            GeneratedQuestion(
                question_text=text,
                options=[o.strip() for o in options],
                correct_index=correct_index,
                explanation=explanation,
            )
        )
    return out


def build_verify_prompt(
    skill: TargetSkill, level: int, questions: list[GeneratedQuestion]
) -> list[dict]:
    system = (
        "You are an independent technical fact-checker. For each question, "
        "verify the CLAIMED correct option is actually correct. Reply ONLY "
        "with JSON."
    )
    payload = [
        {
            "index": i,
            "question_text": q.question_text,
            "options": q.options,
            "claimed_correct_index": q.correct_index,
        }
        for i, q in enumerate(questions)
    ]
    user = (
        f"Skill: {skill.display_name}, level {level}/5. Verify each question below. "
        "For each, state whether the claimed correct_index is actually correct. If "
        "not, give the actually-correct index.\n\n"
        f"{json.dumps(payload)}\n\n"
        'Reply as JSON: {"verdicts": [{"index": 0, "agrees": true, '
        '"correct_index": 0}]}'
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def apply_verify_verdicts(
    questions: list[GeneratedQuestion], raw: str
) -> tuple[list[GeneratedQuestion], bool]:
    """Apply verifier verdicts. Returns (questions, verify_succeeded) —
    verify_succeeded False means the verifier response was unusable and every
    question in this batch should ship as 'review' rather than 'active'
    (fail-soft, never silently unverified)."""
    verdicts = _extract_json_array(raw, "verdicts")
    if verdicts is None:
        return questions, False

    by_index: dict[int, dict] = {}
    for v in verdicts:
        if isinstance(v, dict) and isinstance(v.get("index"), int):
            by_index[v["index"]] = v

    out: list[GeneratedQuestion] = []
    for i, q in enumerate(questions):
        verdict = by_index.get(i)
        if verdict is None:
            out.append(q)
            continue
        agrees = bool(verdict.get("agrees"))
        if agrees:
            out.append(
                GeneratedQuestion(
                    question_text=q.question_text,
                    options=q.options,
                    correct_index=q.correct_index,
                    explanation=q.explanation,
                    verified=True,
                )
            )
            continue
        try:
            corrected = int(verdict.get("correct_index"))
        except (TypeError, ValueError):
            out.append(q)
            continue
        if 0 <= corrected <= 3:
            out.append(
                GeneratedQuestion(
                    question_text=q.question_text,
                    options=q.options,
                    correct_index=corrected,
                    explanation=q.explanation,
                    verified=True,
                )
            )
        else:
            out.append(q)
    return out, True
