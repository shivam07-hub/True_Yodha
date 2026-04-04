"""
Core matching endpoint.
POST /api/v1/match — the main entry point called by Zapier/Make.com.
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job, Candidate, MatchResult
from app.schemas import MatchRequest, MatchResponse
from app.services.cv_parser import parse_cv
from app.services.prefilter import prefilter_jobs
from app.services.matcher import deep_match
from app.services.output import save_results_csv, print_results_console

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["matching"])


@router.post("/match", response_model=MatchResponse)
async def match_candidate(request: MatchRequest, db: Session = Depends(get_db)):
    """
    Full matching pipeline:
    1. Parse CV → structured profile
    2. Pre-filter jobs → ~50 using preferences + skills overlap
    3. Deep match ~50 jobs → Top 5 using OpenAI API
    4. Save results to DB + CSV
    5. Print results to console

    Called by Zapier/Make.com when a new Google Form response arrives.
    """
    total_jobs = db.query(Job).filter(Job.is_active == True).count()
    if total_jobs == 0:
        raise HTTPException(status_code=503, detail="No jobs in database. Run ingestion first.")

    # ── 1. Create candidate record ────────────────────────────────
    candidate = Candidate(
        name=request.name,
        email=request.email,
        phone=request.phone,
        years_experience=request.years_experience,
        preferred_roles=",".join(request.preferred_roles),
        preferred_cities=",".join(request.preferred_cities),
        work_mode=request.work_mode,
        cv_file_url=request.cv_file_url,
        status="matching",
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    logger.info(f"Candidate {candidate.id}: {request.name} ({request.email})")

    try:
        # ── 2. Parse CV ───────────────────────────────────────────
        parsed_cv = await parse_cv(request.cv_file_url, request.years_experience)
        candidate.cv_parsed_skills = ",".join(parsed_cv.skills)
        candidate.cv_parsed_titles = ",".join(parsed_cv.job_titles)
        candidate.cv_parsed_summary = parsed_cv.summary
        candidate.cv_raw_text = parsed_cv.raw_text
        db.commit()
        logger.info(f"Parsed CV: {len(parsed_cv.skills)} skills extracted")

        # ── 3. Pre-filter ─────────────────────────────────────────
        prefiltered = prefilter_jobs(
            db=db,
            parsed_cv=parsed_cv,
            preferred_cities=request.preferred_cities,
            work_mode=request.work_mode,
            years_experience=request.years_experience,
            preferred_roles=request.preferred_roles,
        )
        logger.info(f"Pre-filter: {total_jobs} → {len(prefiltered)} jobs")

        if not prefiltered:
            candidate.status = "done"
            candidate.matched_at = datetime.utcnow()
            db.commit()
            return MatchResponse(
                candidate_name=request.name,
                candidate_email=request.email,
                total_jobs_in_db=total_jobs,
                jobs_after_prefilter=0,
                top_matches=[],
                status="no_matches",
            )

        # ── 4. Deep match with OpenAI ─────────────────────────────
        top_matches = await deep_match(parsed_cv, prefiltered)
        logger.info(f"Deep match: {len(prefiltered)} → top {len(top_matches)}")

        # ── 5. Save match results to DB ───────────────────────────
        for match in top_matches:
            job_record = (
                db.query(Job)
                .filter(Job.title == match.job_title, Job.company_name == match.company_name)
                .first()
            )
            db_match = MatchResult(
                candidate_id=candidate.id,
                job_id=job_record.id if job_record else None,
                rank=match.rank,
                score=match.score,
                matching_skills=",".join(match.matching_skills),
                missing_skills=",".join(match.missing_skills),
                reasoning=match.reasoning,
            )
            db.add(db_match)

        candidate.status = "done"
        candidate.matched_at = datetime.utcnow()
        db.commit()

        # ── 6. Build response ─────────────────────────────────────
        response = MatchResponse(
            candidate_name=request.name,
            candidate_email=request.email,
            total_jobs_in_db=total_jobs,
            jobs_after_prefilter=len(prefiltered),
            top_matches=top_matches,
        )

        # ── 7. Output: CSV + console ──────────────────────────────
        csv_path = save_results_csv(response)
        print_results_console(response)
        logger.info(f"Results CSV: {csv_path}")

        return response

    except Exception as e:
        candidate.status = "error"
        db.commit()
        logger.exception(f"Matching failed for candidate {candidate.id}")
        raise HTTPException(status_code=500, detail=f"Matching pipeline error: {str(e)}")
