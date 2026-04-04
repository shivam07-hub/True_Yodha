"""
Pre-filtering service.
Narrows 3,600+ jobs down to ~50 using candidate preferences + skills overlap.
This is the critical cost-saving step — avoids sending thousands of jobs to Claude.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models import Job
from app.schemas import ParsedCV
from app.config import PREFILTER_TOP_N

logger = logging.getLogger(__name__)

# ── Seniority mapping from years_experience form field ────────────────
EXPERIENCE_TO_SENIORITY = {
    "0-2": ["junior", "entry", "associate", "intern"],
    "3-5": ["mid", "junior", "senior", "associate"],
    "6-10": ["senior", "lead", "mid", "principal"],
    "10+": ["lead", "principal", "senior", "director", "staff"],
}


def _compute_skills_overlap(candidate_skills: set[str], job: Job) -> float:
    """
    Compute a simple skills overlap score between candidate and job.
    Score = |intersection| / |job_skills| if job has skills, else uses title matching.
    Returns 0.0 to 1.0.
    """
    job_skills = job.all_skills()

    if not job_skills:
        # Fallback: check if any candidate skill appears in the job title
        if job.title:
            title_lower = job.title.lower()
            title_hits = sum(1 for s in candidate_skills if s in title_lower)
            return min(title_hits * 0.15, 0.5)  # cap at 0.5 for title-only matches
        return 0.0

    intersection = candidate_skills & job_skills
    if not intersection:
        return 0.0

    # Weighted: required skills count more than preferred
    required = set(job.skills_required_list())
    preferred = set(job.skills_preferred_list())

    required_hits = len(intersection & required)
    preferred_hits = len(intersection & preferred)

    # Required matches worth 1.0, preferred worth 0.5
    weighted_score = required_hits + (preferred_hits * 0.5)
    max_possible = len(required) + (len(preferred) * 0.5)

    if max_possible == 0:
        return 0.0

    return min(weighted_score / max_possible, 1.0)


def prefilter_jobs(
    db: Session,
    parsed_cv: ParsedCV,
    preferred_cities: list[str],
    work_mode: str,
    years_experience: str,
    preferred_roles: list[str] | None = None,
    top_n: int | None = None,
) -> list[tuple[Job, float]]:
    """
    Filter and rank jobs for a candidate.

    Steps:
        1. Start with all active jobs
        2. Apply hard filters (city, work_mode) — but keep "any" flexible
        3. Score by skills overlap
        4. Boost scores for seniority match
        5. Return top N jobs sorted by score

    Returns:
        List of (Job, score) tuples, sorted descending by score.
    """
    top_n = top_n or PREFILTER_TOP_N

    # ── Step 1: Base query — active jobs only ──────────────────────
    query = db.query(Job).filter(Job.is_active == True)
    all_jobs = query.all()
    logger.info(f"Active jobs in DB: {len(all_jobs)}")

    # ── Step 2: City filter ────────────────────────────────────────
    if preferred_cities and "any" not in [c.lower() for c in preferred_cities]:
        city_lower = {c.strip().lower() for c in preferred_cities}
        filtered = []
        for job in all_jobs:
            if not job.location_city:
                filtered.append(job)  # keep jobs with unknown city
                continue
            job_city = job.location_city.lower()
            # Partial match — "bengaluru" matches "Bengaluru, Karnataka"
            if any(c in job_city for c in city_lower):
                filtered.append(job)
            # Also check "India" broadly if the city field just says "India"
            elif "india" in job_city:
                filtered.append(job)
        all_jobs = filtered
        logger.info(f"After city filter ({preferred_cities}): {len(all_jobs)}")

    # ── Step 3: Work mode filter ───────────────────────────────────
    if work_mode and work_mode.lower() != "any":
        wm = work_mode.lower()
        filtered = []
        for job in all_jobs:
            if not job.work_mode:
                filtered.append(job)  # keep unknown
                continue
            if wm in job.work_mode.lower() or job.work_mode.lower() == "remote":
                filtered.append(job)  # remote jobs always pass
        all_jobs = filtered
        logger.info(f"After work_mode filter ({work_mode}): {len(all_jobs)}")

    # ── Step 4: Score by skills overlap ────────────────────────────
    candidate_skills = {s.strip().lower() for s in parsed_cv.skills}
    scored: list[tuple[Job, float]] = []

    target_seniorities = EXPERIENCE_TO_SENIORITY.get(years_experience, [])

    for job in all_jobs:
        score = _compute_skills_overlap(candidate_skills, job)

        # Seniority bonus: +0.15 if seniority matches experience level
        if job.seniority_level and job.seniority_level.lower() in target_seniorities:
            score += 0.15

        # JD text bonus: jobs with descriptions get a small boost (more data for Claude)
        if job.raw_jd_text and len(job.raw_jd_text) > 100:
            score += 0.05

        # Industry match bonus
        if parsed_cv.industries and job.industry:
            if any(ind.lower() in job.industry.lower() for ind in parsed_cv.industries):
                score += 0.05

        scored.append((job, round(score, 4)))

    # ── Step 5: Sort and return top N ──────────────────────────────
    scored.sort(key=lambda x: x[1], reverse=True)

    result = scored[:top_n]
    if result:
        logger.info(
            f"Pre-filter complete: top {len(result)} jobs, "
            f"score range [{result[-1][1]:.3f} — {result[0][1]:.3f}]"
        )
    else:
        logger.warning("Pre-filter returned 0 jobs!")

    return result
