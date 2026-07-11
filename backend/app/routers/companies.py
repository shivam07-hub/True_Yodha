from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository, get_public_jobs_repository
from app.repositories.company_intelligence import (
    CompanyIntelligenceRepository,
    get_company_intelligence_repository,
)
from app.schemas.company_intelligence import CompanySkillIntelligenceResponse
from app.schemas import (
    CompanyJobCardItem,
    CompanyJobsResponse,
    CompanyPageResponse,
    CompanyReviewItem,
    PostingNoteItem,
)

_POSTING_NOTES_LIMIT = 20

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get(
    "/{company_name}/skill-intelligence",
    response_model=CompanySkillIntelligenceResponse,
)
def get_company_skill_intelligence(
    company_name: str,
    limit: int = Query(20, ge=1, le=100),
    repo: CompanyIntelligenceRepository = Depends(
        get_company_intelligence_repository
    ),
) -> CompanySkillIntelligenceResponse:
    result = repo.get(company_name, limit=limit)
    if result is None:
        raise HTTPException(status_code=404, detail="Company intelligence not found")
    return CompanySkillIntelligenceResponse(**result)


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

    posting_notes = _fetch_posting_notes(db, company_name)

    # Render the page if there are EITHER structured reviews OR public posting
    # notes. Only 404 when both are empty.
    if not rows and not posting_notes:
        raise HTTPException(status_code=404, detail="Nothing found for this company")

    review_count = len(rows)
    avg_star = round(sum(r["star_rating"] for r in rows) / review_count, 2) if review_count else None
    ghost_rate = (
        round(sum(1 for r in rows if r["outcome"] == "ghosted") / review_count, 4)
        if review_count
        else None
    )

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
        posting_notes=posting_notes,
        posting_note_count=len(posting_notes),
    )


def _fetch_posting_notes(db, company_name: str) -> list[PostingNoteItem]:
    """Roll up public notes left on this company's job postings (entity_type='job',
    entity_id=job_id). Joins job title + author ninja_name service-side; user_id is
    never surfaced. Returns [] on any miss so the company page never 500s on notes."""
    jobs = (
        db.table("jobs")
        .select("job_id, job_title")
        .ilike("company_name", company_name)
        .execute()
    ).data or []
    if not jobs:
        return []
    title_by_id = {j["job_id"]: j.get("job_title") for j in jobs}

    notes = (
        db.table("comments")
        .select("entity_id, body, user_id, created_at")
        .eq("entity_type", "job")
        .eq("status", "visible")
        .in_("entity_id", list(title_by_id.keys()))
        .order("created_at", desc=True)
        .limit(_POSTING_NOTES_LIMIT)
        .execute()
    ).data or []
    if not notes:
        return []

    user_ids = list({n["user_id"] for n in notes})
    profiles = (
        db.table("user_profiles").select("id, ninja_name").in_("id", user_ids).execute()
    ).data or []
    ninja_by_id = {p["id"]: p.get("ninja_name") for p in profiles}

    return [
        PostingNoteItem(
            job_id=n["entity_id"],
            role=title_by_id.get(n["entity_id"]),
            body=n["body"],
            author_ninja_name=ninja_by_id.get(n["user_id"]),
            created_at=n["created_at"],
        )
        for n in notes
    ]
