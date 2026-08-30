"""Independent verification of the existing question bank.

The bank was built before anything stamped `verified_at`, and nothing has since:
all 1,545 rows carry NULL — **including the 300 being served to users right
now**. The serving gate never noticed because it asked a different question.

That gate is `_is_servable_question`, and until this lands it requires a
`source_url` and nothing about correctness. Four URLs back the entire servable
bank and two of them are homepages: 100 questions about linear regression cite
an MBA programme's front page. The questions are fine; the provenance field is
decorative, which is worse than empty because it claims something.

So the gate moves from "has a link" to "a second model independently agreed the
answer key is right" (learning grill, decision 5, 2026-08-30). This module does
the agreeing. It reuses the verify prompt the generator already had — the one
whose verdicts were computed and then dropped on the floor.

A disagreement RETIRES the question rather than applying the verifier's
correction. Two models disagreeing about an answer key is not a signal one of
them should win: it is a signal the question is not ready to be scored against
a user's career. Retirement is cheap — the bank regenerates.

Pure orchestration lives here; the DB reads and writes live in the script.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.services.learning_ladder_prompts import (
    GeneratedQuestion,
    TargetSkill,
    apply_verify_verdicts,
    build_verify_prompt,
)
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

# The generator batches ten per call and the verify prompt is shaped for that.
VERIFY_BATCH = 10


@dataclass(frozen=True)
class VerifyOutcome:
    """What to write for one batch. Ids, never row payloads — the caller owns
    the table."""

    agreed_ids: list[int]
    retired_ids: list[int]
    # True when the verifier itself was unusable (bad JSON, provider error).
    # The batch is left EXACTLY as it was: not stamped, not retired. An
    # unreadable verifier is not evidence about the questions.
    inconclusive: bool


def _to_generated(row: dict) -> GeneratedQuestion | None:
    options = row.get("options")
    if not isinstance(options, list) or len(options) < 2:
        return None
    try:
        correct = int(row.get("correct_index"))
    except (TypeError, ValueError):
        return None
    if not 0 <= correct < len(options):
        return None
    text = (row.get("question_text") or "").strip()
    explanation = (row.get("explanation") or "").strip()
    if not text or not explanation:
        return None
    return GeneratedQuestion(
        question_text=text,
        options=[str(o) for o in options],
        correct_index=correct,
        explanation=explanation,
    )


def malformed_ids(rows: list[dict]) -> list[int]:
    """Rows that cannot even be presented to a verifier — no options, no answer
    key in range, no text, no explanation. They can never become servable, so
    they are retired without spending a call on them."""
    return [int(r["id"]) for r in rows if _to_generated(r) is None]


async def verify_batch(
    provider: LLMProvider,
    skill: TargetSkill,
    level: int,
    rows: list[dict],
) -> VerifyOutcome:
    """Ask an independent model whether each answer key is right.

    `rows` must already be free of malformed entries (see `malformed_ids`), so
    every row maps 1:1 onto a question and index alignment holds — the verdicts
    come back keyed by position, and a silent gap would stamp the wrong row.
    """
    questions = [_to_generated(r) for r in rows]
    if any(q is None for q in questions):
        raise ValueError("verify_batch received malformed rows; filter them first")
    prepared: list[GeneratedQuestion] = [q for q in questions if q is not None]

    try:
        raw = await provider.complete(build_verify_prompt(skill, level, prepared))
    except LLMProviderError as exc:
        logger.warning(
            "metric question_bank.verify_provider_failed skill=%s level=%d reason=%s",
            skill.display_name, level, exc.__class__.__name__,
        )
        return VerifyOutcome(agreed_ids=[], retired_ids=[], inconclusive=True)

    checked, usable = apply_verify_verdicts(prepared, raw)
    if not usable:
        logger.warning(
            "metric question_bank.verify_unusable skill=%s level=%d",
            skill.display_name, level,
        )
        return VerifyOutcome(agreed_ids=[], retired_ids=[], inconclusive=True)

    agreed: list[int] = []
    retired: list[int] = []
    for row, before, after in zip(rows, prepared, checked, strict=True):
        row_id = int(row["id"])
        # `apply_verify_verdicts` marks agreement with `verified`, and rewrites
        # correct_index when the verifier disagreed. We do not take the rewrite:
        # a contested answer key is a question to retire, not to re-point.
        if after.verified and after.correct_index == before.correct_index:
            agreed.append(row_id)
        else:
            retired.append(row_id)
    return VerifyOutcome(agreed_ids=agreed, retired_ids=retired, inconclusive=False)


def batches(rows: list[dict], size: int = VERIFY_BATCH) -> list[list[dict]]:
    return [rows[i : i + size] for i in range(0, len(rows), size)]
