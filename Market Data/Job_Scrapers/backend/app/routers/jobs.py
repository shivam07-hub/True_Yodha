"""
Job browsing / search endpoints.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Job
from app.schemas import JobSummary, JobListResponse

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.get("", response_model=JobListResponse)
def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company: str | None = None,
    city: str | None = None,
    seniority: str | None = None,
    work_mode: str | None = None,
    search: str | None = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """
    Browse and search jobs in the database.
    Supports filtering by company, city, seniority, work_mode, and free-text search.
    """
    query = db.query(Job)

    if active_only:
        query = query.filter(Job.is_active == True)
    if company:
        query = query.filter(Job.company_name.ilike(f"%{company}%"))
    if city:
        query = query.filter(Job.location_city.ilike(f"%{city}%"))
    if seniority:
        query = query.filter(Job.seniority_level == seniority.lower())
    if work_mode:
        query = query.filter(Job.work_mode == work_mode.lower())
    if search:
        query = query.filter(Job.title.ilike(f"%{search}%"))

    total = query.count()
    jobs = query.offset((page - 1) * page_size).limit(page_size).all()

    return JobListResponse(
        total=total,
        page=page,
        page_size=page_size,
        jobs=[
            JobSummary(
                id=j.id,
                job_id=j.job_id,
                title=j.title,
                company_name=j.company_name,
                location_city=j.location_city,
                work_mode=j.work_mode,
                seniority_level=j.seniority_level,
                job_url=j.job_url,
                has_jd=bool(j.raw_jd_text and len(j.raw_jd_text) > 50),
                skills_count=len(j.all_skills()),
            )
            for j in jobs
        ],
    )


@router.get("/stats")
def job_stats(db: Session = Depends(get_db)):
    """Get aggregate stats about the job database."""
    total = db.query(Job).count()
    active = db.query(Job).filter(Job.is_active == True).count()

    companies = (
        db.query(Job.company_name, func.count(Job.id))
        .filter(Job.company_name.isnot(None))
        .group_by(Job.company_name)
        .order_by(func.count(Job.id).desc())
        .all()
    )

    cities = (
        db.query(Job.location_city, func.count(Job.id))
        .filter(Job.location_city.isnot(None))
        .group_by(Job.location_city)
        .order_by(func.count(Job.id).desc())
        .limit(15)
        .all()
    )

    seniority = (
        db.query(Job.seniority_level, func.count(Job.id))
        .filter(Job.seniority_level.isnot(None))
        .group_by(Job.seniority_level)
        .all()
    )

    with_jd = db.query(Job).filter(Job.raw_jd_text.isnot(None), func.length(Job.raw_jd_text) > 50).count()
    with_skills = db.query(Job).filter(Job.skills_required.isnot(None)).count()

    return {
        "total_jobs": total,
        "active_jobs": active,
        "companies": {name: count for name, count in companies},
        "top_cities": {city: count for city, count in cities},
        "seniority_breakdown": {level: count for level, count in seniority},
        "data_quality": {
            "with_job_description": with_jd,
            "with_skills": with_skills,
            "jd_coverage_pct": round(with_jd / total * 100, 1) if total else 0,
            "skills_coverage_pct": round(with_skills / total * 100, 1) if total else 0,
        },
    }
