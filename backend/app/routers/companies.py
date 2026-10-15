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
)
from app.services.concurrent_reads import run_concurrently

# Existence only. A company page is real when it has a listing or a review.
# One row is enough; the old notes roll-up pulled 200 ids into a comments
# filter and that read is gone with the comments table.
_JOB_EXISTS_LIMIT = 1

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

    # reviews and this company's job listings are independent reads (neither
    # depends on the other's result) — run concurrently so wall time is
    # max(), not sum(). Same serial-fan-out shape already fixed on
    # /home/bootstrap and /jobs/feed (backlog #21).
    reads = run_concurrently(
        {
            "reviews": lambda: (
                db.table("application_reviews")
                .select(
                    "user_id, star_rating, last_stage, outcome, written_note, created_at"
                )
                .ilike("company_name", company_name)
                .order("created_at", desc=True)
                .execute()
            ).data
            or [],
            "jobs": lambda: _company_has_listing(db, company_name),
        },
        label="companies.detail",
    )
    rows = reads["reviews"]
    has_listing = reads["jobs"]

    # A listing or a review is enough. Requiring a review 404'd companies that
    # had live roles and no one had closed an application yet.
    if not rows and not has_listing:
        raise HTTPException(status_code=404, detail="Nothing found for this company")

    authors = _authors_for_notes(db, rows)
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
            author_ninja_name=authors.get(r.get("user_id")) if _has_note(r) else None,
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


def _has_note(row: dict) -> bool:
    return bool((row.get("written_note") or "").strip())


def _company_has_listing(db, company_name: str) -> bool:
    """Whether this company has a job row.

    Through the RPC because the fast plan needs ``lower(company_name) =``,
    which PostgREST cannot express. One row: this used to pull 200 ids into
    a comments filter, and that join left with the comments table.
    """
    rows = (
        db.rpc(
            "company_jobs_for_notes",
            {"p_company": company_name, "p_limit": _JOB_EXISTS_LIMIT},
        ).execute()
    ).data or []
    return bool(rows)


def _authors_for_notes(db, rows: list[dict]) -> dict:
    """Ninja names for reviews that carry a sentence. user_id stays here."""
    user_ids = list({r["user_id"] for r in rows if _has_note(r) and r.get("user_id")})
    if not user_ids:
        return {}
    profiles = (
        db.table("user_profiles").select("id, ninja_name").in_("id", user_ids).execute()
    ).data or []
    return {p["id"]: p.get("ninja_name") for p in profiles}
