import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import xp_service
from app.services.llm_provider import LLMProvider, LLMProviderError, get_llm_provider
from app.routers.jobs._shared import last_monday

router = APIRouter()

ANALYSE_XP_COST = 10

_SYSTEM_PROMPT = (
    "You are a senior career advisor. Given a candidate's skill profile and a job posting, "
    "write 2–3 sentences: why this job fits this candidate, and what skill areas to focus on to improve the match. "
    "Be specific to the candidate's actual skills. Plain text only."
)


def _build_prompt(user_skill_map: dict[str, int], title: str, company: str | None,
                  overlap_score: float, matched_skills: list[str], description: str) -> str:
    top_skills = dict(sorted(user_skill_map.items(), key=lambda x: -x[1])[:20])
    return f"""Candidate skills (taxonomy_key: level 0–5):
{json.dumps(top_skills, indent=2)}

Job: {title} at {company or "Unknown"}
Overlap score: {overlap_score}%
Matched skills: {matched_skills}
Description snippet: {description[:600]}"""


def _compute_overlap(skill_rows: list[dict], user_lower: dict[str, int]) -> tuple[float, list[str]]:
    main_keys = [
        ((r.get("skills") or {}).get("taxonomy_key") or "").lower()
        for r in skill_rows if r.get("is_primary")
    ]
    side_keys = [
        ((r.get("skills") or {}).get("taxonomy_key") or "").lower()
        for r in skill_rows if not r.get("is_primary")
    ]
    main_keys = [k for k in main_keys if k]
    side_keys = [k for k in side_keys if k]

    main_hits = [k for k in main_keys if k in user_lower]
    side_hits = [k for k in side_keys if k in user_lower]

    max_possible = 2.0 * len(main_keys) + 1.0 * len(side_keys)
    score = round((2.0 * len(main_hits) + 1.0 * len(side_hits)) / max_possible * 100, 1) if max_possible else 0.0
    matched = list({k for k in main_hits + side_hits})
    return score, matched


@router.post("/analyse/{job_id}", status_code=status.HTTP_201_CREATED)
async def analyse_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> dict:
    user_id = principal.id

    skill_rows = repo.get_all_job_skill_rows(job_ids=[job_id])
    if not skill_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or has no skills")

    jobs_meta = repo.get_jobs_by_ids([job_id])
    if not jobs_meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    meta = jobs_meta[0]

    user_skill_map = repo.get_user_skill_map(user_id)
    user_lower = {k.lower(): v for k, v in user_skill_map.items()}

    overlap_score, matched_skills = _compute_overlap(skill_rows, user_lower)

    llm_explanation: str | None = None
    try:
        prompt = _build_prompt(
            user_skill_map,
            title=meta.get("job_title", ""),
            company=meta.get("company_name"),
            overlap_score=overlap_score,
            matched_skills=matched_skills,
            description=meta.get("job_description") or "",
        )
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        llm_explanation = (await llm_provider.complete(messages, max_tokens=300)).strip() or None
    except LLMProviderError:
        pass

    new_balance = await xp_service.spend_xp(user_id, ANALYSE_XP_COST, "analyse_job")

    repo.upsert_job_match(user_id, job_id, {
        "batch_week": str(last_monday()),
        "overlap_score": overlap_score,
        "matched_skills": matched_skills,
        "llm_explanation": llm_explanation,
        "llm_rank": None,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "job_id": job_id,
        "overlap_score": overlap_score,
        "matched_count": len(matched_skills),
        "new_xp_balance": new_balance,
    }
