"""POST /cv/skills-refresh — propose a current, primary-first SKILLS section.

Stateless, FREE, read-only. Reads the master CV's ``skills_line`` + the user's
living skill inventory (taxonomy-matched skills with level + market demand), and
— when a ``job_id`` is given — the target job's skills, then returns a reviewable
proposal that surfaces proven-but-missing skills and orders the line primary-first.

Writes nothing and charges nothing: the frontend applies the kept line into the
living-master autosave draft (which persists + async re-scores via PUT /cv/master).
This mirrors the free per-bullet Rewrite path — honesty maintenance, not a premium
generation. All ranking/honesty logic lives in services/cv_skills_refresh (pure).

Spec: CLAUDE.md "skills section refresh" + Q1/Q2/Q3 product locks.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import cv_skills_refresh

router = APIRouter()


class SkillsRefreshRequest(BaseModel):
    # Optional: when present, the JD's required skills lead the primary band
    # (the per-job ATS win). Absent → primary = top in-demand proven skills.
    job_id: str | None = None


class AddedSkill(BaseModel):
    display_name: str
    reason: str


class SkillsRefreshResponse(BaseModel):
    primary: list[str]
    secondary: list[str]
    added: list[AddedSkill]
    proposed_skills_line: str
    changed: bool
    job_title: str | None = None


@router.post("/skills-refresh", response_model=SkillsRefreshResponse)
def skills_refresh(
    body: SkillsRefreshRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
) -> SkillsRefreshResponse:
    user_id = principal.id

    baseline = cv_repo.latest_baseline(user_id)
    if baseline is None or not (baseline.get("cv_structured") or {}):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Upload a CV with structured content first to refresh your skills.",
        )
    skills_line = (baseline["cv_structured"].get("skills_line") or "")

    inventory = jobs_repo.get_user_skill_demand_snapshot(user_id)

    jd_primary_keys: set[str] = set()
    jd_keys: set[str] = set()
    job_title: str | None = None
    if body.job_id:
        job = jobs_repo.get_job_skills(body.job_id)
        if not job:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
        job_title = job.get("job_title")
        for s in job.get("skills") or []:
            key = (s.get("taxonomy_key") or "").lower()
            if not key:
                continue
            jd_keys.add(key)
            if s.get("is_primary"):
                jd_primary_keys.add(key)

    proposal = cv_skills_refresh.build_proposal(
        skills_line=skills_line,
        inventory=inventory,
        jd_primary_keys=jd_primary_keys,
        jd_keys=jd_keys,
    )
    return SkillsRefreshResponse(
        primary=proposal["primary"],
        secondary=proposal["secondary"],
        added=[AddedSkill(**a) for a in proposal["added"]],
        proposed_skills_line=proposal["proposed_skills_line"],
        changed=proposal["changed"],
        job_title=job_title,
    )
