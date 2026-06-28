import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import text_stream, xp_service
from app.services.llm_provider import LLMProvider, get_llm_provider
from app.routers.jobs.analyse import _compute_overlap

router = APIRouter()

DEEPEN_XP_COST = 5

# Fixed prompt set (Q8 — freeform is v2). Keys are the contract with the
# frontend (DEEPEN_PROMPTS in components/dashboard/deepeners.tsx).
_PROMPTS: dict[str, str] = {
    "lift_fit": (
        "Name the 2-3 specific skills or gaps that would most raise this candidate's fit for the role, "
        "and how to close each. Be concrete to their actual skills. 2-3 sentences, plain text."
    ),
    "funnel": (
        "Describe the typical interview funnel for this kind of role at this company — the stages and what to "
        "expect at each. If the company specifics are unknown, give the general pattern for this role type. "
        "2-3 sentences, plain text."
    ),
    "compare": (
        "Compare this candidate to a typical hire for this role: where they are ahead, where behind. "
        "Be specific to their skills. 2-3 sentences, plain text."
    ),
}

_SYSTEM_PROMPT = (
    "You are a senior career advisor answering one focused follow-up question about a candidate's fit "
    "for a specific job. Be specific, honest, and concise. Plain text only."
)


def _build_context(user_skill_map: dict[str, int], title: str, company: str | None,
                   overlap_score: float, matched_skills: list[str], description: str) -> str:
    top_skills = dict(sorted(user_skill_map.items(), key=lambda x: -x[1])[:20])
    return f"""Candidate skills (taxonomy_key: level 0-5):
{json.dumps(top_skills, indent=2)}

Job: {title} at {company or "Unknown"}
Overlap score: {overlap_score}%
Matched skills: {matched_skills}
Description snippet: {description[:600]}"""


@router.get("/{job_id}/deepenings")
def list_deepenings(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> dict:
    """Purchased deepener answers for this job + whether the account used its
    one free sample. Lets the UI replay free + drop the cost label."""
    items = repo.list_deepenings(principal.id, job_id)
    return {
        "items": [{"prompt_key": r["prompt_key"], "answer": r.get("answer") or ""} for r in items],
        "sampled": repo.get_deepening_sampled(principal.id),
    }


@router.post("/{job_id}/deepen/{prompt_key}/stream")
async def deepen_job_stream(
    job_id: str,
    prompt_key: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_llm_provider),
) -> StreamingResponse:
    """Stream an XP-gated deepener answer (Q8). Charge-on-success only.

    Cost rules: cached → replay free, no charge, no LLM. First deepener on the
    whole account → free (sets `deepening_sampled`). Otherwise 5 XP, charged
    atomically only after a complete stream + persist. Idempotent per
    (user, job, prompt_key)."""
    user_id = principal.id
    instruction = _PROMPTS.get(prompt_key)
    if instruction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown deepener")

    # Idempotent replay — already bought → stream cached text free.
    cached = repo.get_deepening(user_id, job_id, prompt_key)
    if cached:
        balance = await xp_service.get_xp_balance(user_id)
        return text_stream.response(
            text_stream.replay(cached, done={"new_coin_balance": balance, "cached": True})
        )

    skill_rows = repo.get_all_job_skill_rows(job_ids=[job_id])
    if not skill_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or has no skills")
    jobs_meta = repo.get_jobs_by_ids([job_id])
    if not jobs_meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    meta = jobs_meta[0]

    is_free = not repo.get_deepening_sampled(user_id)

    # Defend the LLM call: only preflight funding when this one actually costs XP.
    if not is_free:
        await xp_service.assert_can_spend_xp(user_id, DEEPEN_XP_COST, "deepen_job")

    user_skill_map = repo.get_user_skill_map(user_id)
    user_lower = {k.lower(): v for k, v in user_skill_map.items()}
    overlap_score, matched_skills = _compute_overlap(skill_rows, user_lower)
    context = _build_context(
        user_skill_map,
        title=meta.get("job_title", ""),
        company=meta.get("company_name"),
        overlap_score=overlap_score,
        matched_skills=matched_skills,
        description=meta.get("job_description") or "",
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"{context}\n\nQuestion: {instruction}"},
    ]

    async def finalize(text: str) -> dict:
        if is_free:
            repo.set_deepening_sampled(user_id)
            new_balance = await xp_service.get_xp_balance(user_id)
        else:
            try:
                new_balance = await xp_service.charge_or_raise(
                    user_id, DEEPEN_XP_COST, "deepen_job",
                    ref_table="job_deepenings", ref_id=f"{job_id}:{prompt_key}",
                )
            except xp_service.InsufficientXPError as exc:
                raise text_stream.StreamAbort("Out of tokens.", recoverable=False) from exc

        repo.upsert_deepening(user_id, job_id, prompt_key, text)
        return {"new_coin_balance": new_balance}

    return text_stream.response(
        text_stream.live(llm_provider, messages, max_tokens=260, finalize=finalize)
    )
