from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository, get_public_jobs_repository
from app.schemas import (
    CompanyJobCardItem,
    CompanyJobsResponse,
    CompanyPageResponse,
    CompanyReviewItem,
)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/{company_name}/jobs", response_model=CompanyJobsResponse)
def get_company_jobs(
    company_name: str,
    page: int = Query(1, ge=1, le=200),
    page_size: int = Query(50, ge=1, le=50),
    repo: JobsRepository = Depends(get_public_jobs_repository),
) -> CompanyJobsResponse:
    result = repo.fetch_company_jobs_page(company_name, page=page, page_size=page_size)
    return CompanyJobsResponse(
        company_name=company_name,
        total=result["total"],
        jobs=[CompanyJobCardItem(**j) for j in result["jobs"]],
        page=result["page"],
        page_size=result["page_size"],
        has_next=result["has_next"],
    )


@router.get("/{company_name}", response_model=CompanyPageResponse)
def get_company_page(company_name: str) -> CompanyPageResponse:
    db = get_supabase_admin()

    rows = (
        db.table("application_reviews")
        .select("star_rating, last_stage, outcome, written_note, created_at")
        .ilike("company_name", company_name)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    if not rows:
        raise HTTPException(status_code=404, detail="No reviews found for this company")

    review_count = len(rows)
    avg_star = round(sum(r["star_rating"] for r in rows) / review_count, 2)
    ghost_count = sum(1 for r in rows if r["outcome"] == "ghosted")
    ghost_rate = round(ghost_count / review_count, 4)

    stage_breakdown: dict[str, int] = {}
    for r in rows:
        stage_breakdown[r["last_stage"]] = stage_breakdown.get(r["last_stage"], 0) + 1

    reviews = [
        CompanyReviewItem(
            star_rating=r["star_rating"],
            last_stage=r["last_stage"],
            outcome=r["outcome"],
            written_note=r.get("written_note"),
            created_at=r["created_at"],
        )
        for r in rows
    ]

    return CompanyPageResponse(
        company_name=company_name,
        avg_star_rating=avg_star,
        review_count=review_count,
        ghost_rate=ghost_rate,
        stage_breakdown=stage_breakdown,
        reviews=reviews,
    )
