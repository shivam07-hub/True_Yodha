"""Tailor with Mentor — the weave endpoints (Lane C v2, grill locks 2026-07-16).

  POST /cv/weave/interview   the option-driven interview over unproven asks (free)
  POST /cv/weave/answer      bank a gap answer as a story; ONE thin-answer probe (free)
  POST /cv/weave             run the weave — 50 coins, charged on delivery only
  GET  /cv/weave/{job_id}    replay a purchased proposal (free)
  POST /cv/weave/apply       write accepted roles as the job-tailored version (free)

Money: the weave run is the only charged step (L6) — flat 50, preflight-funded,
charged after a deliverable proposal exists, unique ledger ref per run so an
explicit re-weave charges again while a cached replay never does.

The proposal caches in job_deepenings (reach-pack/prep-brief contract). Apply
verifies the proposal's source fingerprint against the CURRENT master — a draft
never lands on a CV it wasn't written for.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import CurrentUser, get_current_user
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)
from app.repositories.cv import CVVersionsRepository, CVVersionWriteSpec, get_token_cv_repository
from app.repositories.cv_dump import CvDumpRepository, get_cv_dump_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.security import redact_sensitive_text
from app.services import career_reservoir, cv_compose, cv_weave, cv_weave_interview, jd_coverage, xp_policy, xp_service
from app.services.llm_provider import get_blocking_judgment_provider

router = APIRouter()


# ── wire models ────────────────────────────────────────────────────────────────

class WeaveOption(BaseModel):
    kind: str
    label: str
    detail: str = ""
    story_id: str | None = None


class WeaveQuestion(BaseModel):
    requirement: str
    status: str
    options: list[WeaveOption]


class WeaveInterviewRequest(BaseModel):
    job_id: str


class WeaveInterviewResponse(BaseModel):
    questions: list[WeaveQuestion]
    requirements_total: int
    unproven: int
    cost: int = xp_policy.CV_WEAVE_XP_COST


class WeaveAnswerRequest(BaseModel):
    requirement: str = Field(max_length=400)
    answer: str = Field(min_length=1, max_length=4000)
    job_id: str | None = None
    final: bool = False


class WeaveAnswerResponse(BaseModel):
    follow_up: str | None = None
    entry_id: str | None = None


class WeaveBullet(BaseModel):
    text: str
    from_lines: list[str] = Field(default_factory=list)
    story_titles: list[str] = Field(default_factory=list)
    used_answer: bool = False


class WeaveRole(BaseModel):
    role_index: int
    role: str
    company: str
    changed: bool
    guarded: bool = False
    why: str = ""
    bullets: list[WeaveBullet]
    dropped_lines: list[str] = Field(default_factory=list)


class WeaveProposal(BaseModel):
    fingerprint: str
    summary: str | None = None
    skills_line: str | None = None
    roles: list[WeaveRole]
    changed_roles: int
    requirements_total: int
    asks_unproven: int
    computed_at: str = ""


class WeaveAnswerIn(BaseModel):
    requirement: str = ""
    text: str = ""


class WeaveRunRequest(BaseModel):
    job_id: str
    answers: list[WeaveAnswerIn] = Field(default_factory=list)
    refresh: bool = False


class WeaveRunResponse(BaseModel):
    proposal: WeaveProposal
    cached: bool = False
    stale: bool = False
    cost: int = xp_policy.CV_WEAVE_XP_COST
    new_coin_balance: int | None = None


class WeaveGetResponse(BaseModel):
    purchased: bool
    proposal: WeaveProposal | None = None
    stale: bool = False


class WeaveApplyRequest(BaseModel):
    job_id: str
    accepted_roles: list[int] = Field(default_factory=list)
    accept_summary: bool = True
    accept_skills_line: bool = True


class WeaveApplyResponse(BaseModel):
    version_id: int


# ── shared plumbing ────────────────────────────────────────────────────────────

def _job_or_404(jobs_repo: JobsRepository, job_id: str) -> dict:
    rows = jobs_repo.get_jobs_by_ids([job_id])
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
    return rows[0]


def _baseline_or_409(cv_repo: CVVersionsRepository, user_id: str) -> dict:
    baseline = cv_repo.latest_baseline(user_id)
    if not baseline or not (baseline.get("cv_structured") or {}):
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload a CV first.")
    return baseline


async def _coverage_rows(
    user_id: str,
    job_id: str,
    jd_text: str,
    jobs_repo: JobsRepository,
    cv_structured: dict,
) -> list[jd_coverage.CoverageItem]:
    """Cached coverage, else compute (stories ∪ CV bullets) + cache — same
    contract as /cv/jd-coverage and the prep room, so the panels never disagree."""
    hit = jd_coverage.payload_to_result(
        jobs_repo.get_deepening(user_id, job_id, jd_coverage.CACHE_PROMPT_KEY)
    )
    if hit is not None:
        return hit[0].requirements
    result = await jd_coverage.assess(
        user_id, jd_text, get_blocking_judgment_provider(),
        cv_bullets=jd_coverage.bullets_from_cv(cv_structured),
    )
    if result.requirements:
        jobs_repo.upsert_deepening(
            user_id, job_id, jd_coverage.CACHE_PROMPT_KEY,
            jd_coverage.result_to_payload(result),
        )
    return result.requirements


def _cached_proposal(jobs_repo: JobsRepository, user_id: str, job_id: str) -> WeaveProposal | None:
    raw = jobs_repo.get_deepening(user_id, job_id, cv_weave.CACHE_PROMPT_KEY)
    if not raw:
        return None
    try:
        return WeaveProposal(**json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.post("/weave/interview", response_model=WeaveInterviewResponse)
async def weave_interview(
    body: WeaveInterviewRequest,
    user: CurrentUser = Depends(get_current_user),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    reservoir_repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> WeaveInterviewResponse:
    """The questions Mentor asks before weaving — only the asks the user's
    stories + CV could not prove, each with mined candidate answers (L7)."""
    job = _job_or_404(jobs_repo, body.job_id)
    baseline = _baseline_or_409(cv_repo, user.id)
    cv_structured = baseline.get("cv_structured") or {}

    # Self-heal embedding-less stories BEFORE mining — an unembedded story is
    # invisible to both coverage and the option miner (prod hole, 2026-07-16).
    await career_reservoir.backfill_missing_embeddings(reservoir_repo, user.id)

    rows = await _coverage_rows(
        user.id, body.job_id, job.get("job_description") or "", jobs_repo, cv_structured,
    )
    questions = await cv_weave_interview.build_interview(user.id, rows, cv_structured)
    return WeaveInterviewResponse(
        questions=[
            WeaveQuestion(
                requirement=q.requirement, status=q.status,
                options=[WeaveOption(**o.__dict__) for o in q.options],
            )
            for q in questions
        ],
        requirements_total=len(rows),
        unproven=len(questions),
    )


@router.post("/weave/answer", response_model=WeaveAnswerResponse)
async def weave_answer(
    body: WeaveAnswerRequest,
    user: CurrentUser = Depends(get_current_user),
    dump_repo: CvDumpRepository = Depends(get_cv_dump_repository),
) -> WeaveAnswerResponse:
    """Bank one interview answer as a reusable career story. A thin first
    answer gets exactly ONE pointed probe back (L4) — nothing is banked until
    the user answers it or skips (final=true)."""
    answer = body.answer.strip()
    if len("".join(answer.split())) < 12:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell me a bit more so I can capture it.")
    if not body.final:
        follow_up = cv_weave_interview.follow_up_for(answer)
        if follow_up:
            return WeaveAnswerResponse(follow_up=follow_up)
    requirement = " ".join(body.requirement.split()).strip()
    framed = f"Career experience — {requirement}:\n{answer}" if requirement else f"Career experience:\n{answer}"
    row = dump_repo.add(
        user.id, framed, source="jd_gap_answer",
        kind="note", payload={"requirement": requirement or None, "job_id": body.job_id, "via": "weave"},
    )
    entry_id = str(row.get("id") or "")
    if not entry_id:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save your answer.")
    career_reservoir.enqueue_ingest(user.id, entry_id)
    return WeaveAnswerResponse(entry_id=entry_id)


@router.get("/weave/{job_id}", response_model=WeaveGetResponse)
def get_weave(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> WeaveGetResponse:
    """Replay a purchased proposal for free. `stale` flags a master that changed
    since the draft — the surface offers a re-run instead of a doomed apply."""
    proposal = _cached_proposal(jobs_repo, user.id, job_id)
    if proposal is None:
        return WeaveGetResponse(purchased=False)
    baseline = cv_repo.latest_baseline(user.id)
    current = cv_weave.source_fingerprint((baseline or {}).get("cv_structured") or {})
    return WeaveGetResponse(purchased=True, proposal=proposal, stale=current != proposal.fingerprint)


@router.post("/weave", response_model=WeaveRunResponse)
async def run_weave(
    body: WeaveRunRequest,
    user: CurrentUser = Depends(get_current_user),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> WeaveRunResponse:
    """The weave. 50 coins per run, charged only after a deliverable proposal
    exists; a cached proposal replays free unless `refresh` explicitly re-runs."""
    job = _job_or_404(jobs_repo, body.job_id)
    baseline = _baseline_or_409(cv_repo, user.id)
    cv_structured = baseline.get("cv_structured") or {}
    current_fp = cv_weave.source_fingerprint(cv_structured)

    if not body.refresh:
        cached = _cached_proposal(jobs_repo, user.id, body.job_id)
        if cached is not None:
            balance = await xp_service.get_xp_balance(user.id)
            return WeaveRunResponse(
                proposal=cached, cached=True, stale=current_fp != cached.fingerprint,
                new_coin_balance=balance,
            )

    # Preflight funding so we never spend an LLM call the user can't pay for.
    await xp_service.assert_can_spend_xp(user.id, xp_policy.CV_WEAVE_XP_COST, "cv_weave")

    jd_text = job.get("job_description") or ""
    rows = await _coverage_rows(user.id, body.job_id, jd_text, jobs_repo, cv_structured)
    stories = await cv_weave_interview.gather_story_material(
        user.id, [r.requirement for r in rows] or [job.get("job_title") or ""],
    )
    answers = [
        {"requirement": a.requirement.strip(), "text": a.text.strip()}
        for a in body.answers if a.text.strip()
    ]

    proposal = await cv_weave.weave(
        job_title=job.get("job_title") or "",
        company=job.get("company_name") or "",
        jd_text=jd_text,
        coverage_items=rows,
        cv_structured=cv_structured,
        stories=stories,
        answers=answers,
    )
    if proposal is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Couldn't draft your tailored CV right now. Try again shortly — you were not charged.",
        )

    try:
        new_balance = await xp_service.charge_or_raise(
            user.id,
            xp_policy.CV_WEAVE_XP_COST,
            "cv_weave",
            floor=xp_policy.CV_WEAVE_XP_FLOOR,
            ref_table="job_deepenings",
            ref_id=f"{body.job_id}:{cv_weave.CACHE_PROMPT_KEY}:{uuid.uuid4().hex[:8]}",
        )
    except xp_service.InsufficientXPError as exc:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"{redact_sensitive_text(exc)} Earn coins by practising a skill, or unlock this later.",
        ) from exc

    proposal["computed_at"] = datetime.now(timezone.utc).isoformat()
    jobs_repo.upsert_deepening(user.id, body.job_id, cv_weave.CACHE_PROMPT_KEY, json.dumps(proposal))
    return WeaveRunResponse(proposal=WeaveProposal(**proposal), new_coin_balance=new_balance)


@router.post("/weave/apply", response_model=WeaveApplyResponse)
def apply_weave(
    body: WeaveApplyRequest,
    user: CurrentUser = Depends(get_current_user),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> WeaveApplyResponse:
    """Write the accepted roles as the job-tailored version (L2/L3). The living
    master is untouched; free — the weave run already paid."""
    proposal = _cached_proposal(jobs_repo, user.id, body.job_id)
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tailored draft for this job yet.")
    job = _job_or_404(jobs_repo, body.job_id)
    baseline = _baseline_or_409(cv_repo, user.id)
    cv_structured = baseline.get("cv_structured") or {}
    if cv_weave.source_fingerprint(cv_structured) != proposal.fingerprint:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Your CV changed since this draft was written — run Tailor with Mentor again.",
        )
    composed = cv_weave.compose_weave(
        cv_structured,
        proposal.model_dump(),
        set(body.accepted_roles),
        accept_summary=body.accept_summary,
        accept_skills_line=body.accept_skills_line,
    )
    version = cv_repo.create(user.id, CVVersionWriteSpec(
        kind="deterministic",
        job_id=body.job_id,
        parent_version_id=int(baseline["id"]),
        body_text=cv_compose.render_deterministic(composed),
        cv_structured=composed,
        title=f"Tailored with Mentor · {job.get('company_name') or job.get('job_title') or ''}".strip(" ·"),
    ))
    return WeaveApplyResponse(version_id=int(version["id"]))
