"""Schemas for the Practice → Upskilling overhaul (PRD §7).

Surface A — MCQ ladder: GET /skills, POST /sets, POST /sets/{id}/submit.
Surface B — job-anchored gap calibration: POST /gap/{job_id}/start + /submit.

The answer key (`correct_index`) is NEVER present in any served-set response —
grading happens only in the submit path. Result schemas carry it back after
grading so the client can render the per-question review.
"""

from typing import Literal

from pydantic import BaseModel, Field

# ── Surface A — ladder list ──────────────────────────────────────────────────


class UpskillingSkill(BaseModel):
    skill_id: int
    skill_key: str
    display_name: str
    cleared_level: int = 0          # highest cleared L1–L5 (0 = none)
    next_level: int = 1             # min(cleared+1, 5)
    assessed_level: int = 0         # demonstrated-knowledge level (DEC-1a driver)
    on_cv: bool = True
    demand: str = "none"            # very_high | high | moderate | low | none
    job_count: int = 0
    max_bank_level: int = 0         # highest level with a servable bank (≥ SET_SIZE)
    locked: bool = False            # no servable bank at all yet


# ── Served set (NO answer key) ───────────────────────────────────────────────


class ServedQuestion(BaseModel):
    id: int
    question_text: str
    options: list[str]              # exactly 4 — correct_index withheld


class StartSetRequest(BaseModel):
    skill_id: int
    level: int = Field(ge=1, le=5)


class StartSetResponse(BaseModel):
    set_id: str                     # quiz_attempts.id
    skill_id: int
    skill_key: str
    level: int
    questions: list[ServedQuestion]


# ── Submit + graded results ──────────────────────────────────────────────────


class SubmittedAnswer(BaseModel):
    question_id: int
    selected_index: int = Field(ge=0, le=3)


class SubmitSetRequest(BaseModel):
    answers: list[SubmittedAnswer]
    idempotency_key: str = Field(min_length=1)


class QuestionResult(BaseModel):
    question_id: int
    correct_index: int
    is_correct: bool
    explanation: str
    rationales: dict = Field(default_factory=dict)


class SubmitSetResponse(BaseModel):
    score: int
    max: int
    passed: bool
    first_clear: bool
    tokens_awarded: int
    next_level_unlocked: int | None  # null when already at L5
    results: list[QuestionResult]


# ── Surface B — gap calibration ──────────────────────────────────────────────


class GapSkillSet(BaseModel):
    skill_id: int
    skill_key: str
    display_name: str
    target_level: int
    calibration_set: list[ServedQuestion]


class StartGapResponse(BaseModel):
    assessment_id: str               # quiz_attempts.id; "" when skills is empty
    job_id: str
    job_title: str | None = None
    company_name: str | None = None
    skills: list[GapSkillSet]
    # Why skills is empty: "no_gaps" (CV already meets required levels) or
    # "no_bank" (no question banks for this job's gap skills). None when served.
    reason: str | None = None


class SubmitGapRequest(BaseModel):
    assessment_id: str
    answers: list[SubmittedAnswer]


class ReadinessRow(BaseModel):
    skill_id: int
    skill_key: str
    skill: str
    assessed_level: int
    target_level: int
    band: Literal["ready", "close", "gap"]
    why_it_matters: str | None = None
    practice_href: str               # "/forge?skill=…&level=…"


class SubmitGapResponse(BaseModel):
    readiness: list[ReadinessRow]
    overall_readiness_pct: int


# ── Practice activity (home streak) ──────────────────────────────────────────


class ActivityDatesResponse(BaseModel):
    dates: list[str]


class LearningCoverageResponse(BaseModel):
    coverage_gate_met: bool
    publication_scope: Literal["partial", "comprehensive"]
    complete_skill_count: int
    target_skill_min: int
    target_skill_max: int
    questions_per_level_min: int
    questions_per_level_max: int
    active_reviewed_question_count: int
    active_reviewed_skill_count: int
