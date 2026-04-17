"""
OpenAI deep matching service.
Batches 10 jobs per API call for cost efficiency.
Falls back to mock scoring if no API key is configured.
"""

import json
import logging
import random

from app.models import Job
from app.schemas import ParsedCV, JobMatchResult
from app.config import LLM_PROVIDER, DEEP_MATCH_BATCH_SIZE, TOP_RESULTS
from app.llm_provider import call_llm, get_model, is_configured

logger = logging.getLogger(__name__)


# ── Prompt template for batch matching ──────────────────────────────

BATCH_MATCH_PROMPT = """You are a senior recruiting expert and career coach. Compare this candidate's profile against each job listing below and give a detailed, honest evaluation — as if you were advising a friend whether to apply.

CANDIDATE PROFILE:
- Skills: {skills}
- Experience: {years_experience} years
- Past Roles: {job_titles}
- Education: {education}
- Summary: {summary}

CANDIDATE CV TEXT (excerpt):
{cv_excerpt}

---

JOBS TO EVALUATE:
{jobs_block}

---

For EACH job, return a JSON object with these exact keys:
- "job_index": the job number (1, 2, 3, ...)
- "score": integer 0-100 (overall match quality)
- "matching_skills": list of skills the candidate has that the job requires or prefers
- "missing_skills": list of important skills the job requires that the candidate lacks
- "reasoning": 1-2 sentences — overall verdict on fit (seniority, domain, skills alignment)
- "why_apply": 2-3 concrete reasons why this candidate SHOULD apply to this specific role (highlight alignment with their background, growth opportunity, or domain fit)
- "strengths": 2-3 specific strengths this candidate brings to THIS role (not generic — reference their actual skills/experience from the CV)
- "weaknesses": 2-3 honest gaps or areas the candidate should address before or during the interview (be constructive, not discouraging)

Scoring guidelines (be strict and realistic — most candidates score 55-80):
- 88-100: Reserved for near-perfect fits. Every required skill present, exact seniority, same domain. Rare.
- 75-87: Strong match — most key skills present, right level, relevant domain
- 60-74: Decent match — solid overlap but some upskilling or domain shift needed
- 40-59: Partial match — transferable experience but notable skill gaps
- 0-39: Weak match — significant misalignment in skills or seniority

IMPORTANT: Do NOT give scores above 85 unless the candidate truly has every major required skill.
Most good candidates should score in the 60-80 range. Scores above 90 should be genuinely exceptional.

Return ONLY a valid JSON array, one object per job. Example format:
[
  {{
    "job_index": 1,
    "score": 84,
    "matching_skills": ["python", "sql", "machine learning"],
    "missing_skills": ["spark", "scala"],
    "reasoning": "Strong data science background with 4 years experience aligns well with this mid-level ML engineer role.",
    "why_apply": "Your Python and ML pipeline experience maps directly to the core requirements. The company is expanding their India ML team, which is a strong growth signal. Your past work in fintech aligns with their domain.",
    "strengths": "Hands-on experience building end-to-end ML pipelines in Python. Solid SQL foundation for data wrangling. Past fintech domain experience is directly relevant.",
    "weaknesses": "No Spark or Scala experience — these are listed as preferred. You may want to complete a short Spark course before the interview. Limited exposure to large-scale distributed systems could come up in system design rounds."
  }},
  {{"job_index": 2, "score": 61, ...}}
]
"""


def _format_job_block(jobs_with_index: list[tuple[int, Job]]) -> str:
    """Format a batch of jobs for the prompt."""
    blocks = []
    for idx, job in jobs_with_index:
        lines = [f"JOB {idx}:"]
        lines.append(f"  Title: {job.title or 'N/A'}")
        lines.append(f"  Company: {job.company_name or 'N/A'}")
        lines.append(f"  Seniority: {job.seniority_level or 'N/A'}")
        lines.append(f"  Location: {job.location_city or 'N/A'} | {job.work_mode or 'N/A'}")

        if job.skills_required:
            lines.append(f"  Required Skills: {job.skills_required}")
        if job.skills_preferred:
            lines.append(f"  Preferred Skills: {job.skills_preferred}")

        # Include JD text (truncated) if available
        if job.raw_jd_text and len(job.raw_jd_text) > 50:
            jd_excerpt = job.raw_jd_text[:1500]  # ~300 words per job
            lines.append(f"  Job Description: {jd_excerpt}")

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


_MATCH_SYSTEM = "You are a precise recruiting analyst. Return only valid JSON arrays."


def _call_llm_batch(prompt: str) -> str:
    """Call the configured LLM with the batch matching prompt."""
    return call_llm(_MATCH_SYSTEM, prompt, max_tokens=4000, temperature=0.2)


def _parse_batch_response(raw_response: str) -> list[dict]:
    """Parse the JSON array response from OpenAI."""
    text = raw_response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)


async def deep_match(
    parsed_cv: ParsedCV,
    prefiltered_jobs: list[tuple[Job, float]],
    top_n: int | None = None,
) -> list[JobMatchResult]:
    """
    Perform deep matching of CV against pre-filtered jobs using OpenAI.

    Batches jobs into groups of DEEP_MATCH_BATCH_SIZE (default 10),
    so 50 pre-filtered jobs = 5 API calls.

    Falls back to mock scoring if OPENAI_API_KEY is not set.
    """
    top_n = top_n or TOP_RESULTS

    if not is_configured():
        logger.warning(f"[MOCK] No API key for provider '{LLM_PROVIDER}' — using mock deep matching")
        return _mock_deep_match_all(parsed_cv, prefiltered_jobs, top_n)

    # ── Build batches ────────────────────────────────────────────────
    batch_size = DEEP_MATCH_BATCH_SIZE
    all_jobs = [(i + 1, job) for i, (job, _score) in enumerate(prefiltered_jobs)]

    batches = []
    for i in range(0, len(all_jobs), batch_size):
        batches.append(all_jobs[i : i + batch_size])

    logger.info(
        f"Deep matching {len(prefiltered_jobs)} jobs in {len(batches)} batches "
        f"(batch_size={batch_size}, provider={LLM_PROVIDER}, model={get_model()})"
    )

    # ── Call OpenAI for each batch ───────────────────────────────────
    # Build a lookup: job_index → (Job, prefilter_score)
    index_to_job = {}
    for i, (job, pf_score) in enumerate(prefiltered_jobs):
        index_to_job[i + 1] = (job, pf_score)

    all_results: list[JobMatchResult] = []

    for batch_num, batch in enumerate(batches, 1):
        logger.info(f"  Batch {batch_num}/{len(batches)}: {len(batch)} jobs")

        jobs_block = _format_job_block(batch)
        cv_excerpt = (parsed_cv.raw_text or "")[:3000]

        prompt = BATCH_MATCH_PROMPT.format(
            skills=", ".join(parsed_cv.skills),
            years_experience=parsed_cv.years_experience or "unknown",
            job_titles=", ".join(parsed_cv.job_titles) if parsed_cv.job_titles else "N/A",
            education=parsed_cv.education or "N/A",
            summary=parsed_cv.summary or "N/A",
            cv_excerpt=cv_excerpt,
            jobs_block=jobs_block,
        )

        try:
            raw_response = _call_llm_batch(prompt)
            batch_results = _parse_batch_response(raw_response)

            for result_dict in batch_results:
                job_idx = result_dict.get("job_index")
                if job_idx not in index_to_job:
                    logger.warning(f"Unknown job_index {job_idx} in batch response, skipping")
                    continue

                job, _pf = index_to_job[job_idx]
                match_result = JobMatchResult(
                    rank=0,  # assigned after sorting
                    score=float(result_dict.get("score", 0)),
                    job_title=job.title or "Unknown",
                    company_name=job.company_name or "Unknown",
                    location_city=job.location_city,
                    work_mode=job.work_mode,
                    seniority_level=job.seniority_level,
                    matching_skills=result_dict.get("matching_skills", []),
                    missing_skills=result_dict.get("missing_skills", []),
                    reasoning=result_dict.get("reasoning", ""),
                    why_apply=result_dict.get("why_apply", ""),
                    strengths=result_dict.get("strengths", ""),
                    weaknesses=result_dict.get("weaknesses", ""),
                    job_url=job.job_url,
                )
                all_results.append(match_result)

            logger.info(f"  Batch {batch_num} returned {len(batch_results)} scores")

        except Exception as e:
            logger.error(f"  Batch {batch_num} failed: {e}")
            # Fallback: use prefilter scores for this batch
            for idx, job in batch:
                _job_obj, pf_score = index_to_job[idx]
                fallback = _mock_single_match(parsed_cv, _job_obj, pf_score)
                all_results.append(fallback)

    # ── Sort and assign ranks ────────────────────────────────────────
    all_results.sort(key=lambda r: r.score, reverse=True)
    top = all_results[:top_n]
    for i, result in enumerate(top, start=1):
        result.rank = i

    if top:
        logger.info(
            f"Deep match complete: top {len(top)} scores "
            f"[{top[-1].score} — {top[0].score}]"
        )
    return top


# ── Mock fallbacks ───────────────────────────────────────────────────

def _mock_single_match(parsed_cv: ParsedCV, job: Job, prefilter_score: float) -> JobMatchResult:
    """Generate a mock match result from prefilter score.

    Uses a realistic scoring curve so mock results are spread across
    50-88 rather than all bunching at 98. Real scores come from OpenAI.
    """
    candidate_skills = {s.strip().lower() for s in parsed_cv.skills}
    job_skills = job.all_skills()
    matching = sorted(candidate_skills & job_skills) if job_skills else []
    missing = sorted(job_skills - candidate_skills) if job_skills else []

    # Realistic spread: top pre-filter score maps to ~85, bottom to ~45
    # Add small noise so scores aren't identical
    base_score = 45 + (prefilter_score * 40)          # range: 45–85
    noise = random.uniform(-4, 4)                      # ±4 points
    skill_penalty = min(len(missing) * 2, 10)          # penalise gaps
    score = min(max(round(base_score + noise - skill_penalty, 1), 30), 88)

    reasoning = (
        f"[MOCK — enable real OpenAI for accurate scores]  "
        f"Skills overlap: {len(matching)} matched, {len(missing)} missing."
    )
    if job.seniority_level:
        reasoning += f" {job.seniority_level.title()}-level role."
    if missing:
        reasoning += f" Gaps: {', '.join(missing[:2])}."

    return JobMatchResult(
        rank=0,
        score=score,
        job_title=job.title or "Unknown",
        company_name=job.company_name or "Unknown",
        location_city=job.location_city,
        work_mode=job.work_mode,
        seniority_level=job.seniority_level,
        matching_skills=matching[:8],
        missing_skills=missing[:5],
        reasoning=reasoning,
        job_url=job.job_url,
    )


def _mock_deep_match_all(
    parsed_cv: ParsedCV,
    prefiltered_jobs: list[tuple[Job, float]],
    top_n: int,
) -> list[JobMatchResult]:
    """Mock all deep matching."""
    random.seed(42)
    results = [_mock_single_match(parsed_cv, job, score) for job, score in prefiltered_jobs]
    results.sort(key=lambda r: r.score, reverse=True)
    top = results[:top_n]
    for i, r in enumerate(top, start=1):
        r.rank = i
    return top
