import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.database import get_supabase_admin
from app.deps import Principal, get_principal, get_principal_optional
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import ApplicationResponse
from app.schemas.jobs import (
    HostedInternshipRequest,
    HostedReviewDecision,
    HostedReviewItem,
    HostedReviewQueue,
    InternshipsResponse,
    JobFeedItem,
)
from app.security.admin_auth import require_admin
from app.services import application_yes
from app.services.hosted_review_mail import alert_reviewer, tell_poster_live
from app.services.internships import (
    UnpaidInternshipError,
    dismissed_job_ids,
    get_internship,
    insert_hosted,
    list_internships,
    pending_reviews,
    review_hosted,
    without_dismissed,
)
from app.services.job_projection import to_application

router = APIRouter()


@router.get("/internships", response_model=InternshipsResponse)
def get_internships(
    venue: str | None = Query(default=None),
    db=Depends(get_supabase_admin),
    principal: Principal | None = Depends(get_principal_optional),
) -> InternshipsResponse:
    if venue not in (None, "", "myro"):
        raise HTTPException(status_code=400, detail="venue must be myro when set")
    cards = list_internships(db, venue="myro" if venue == "myro" else None)
    if principal:
        cards = without_dismissed(cards, dismissed_job_ids(db, principal.id))
    return InternshipsResponse(jobs=[JobFeedItem(**card) for card in cards])


# Declared before /internships/{job_id} so "review" is not read as a job id.
@router.get(
    "/internships/review",
    response_model=HostedReviewQueue,
    dependencies=[Depends(require_admin)],
)
def get_review_queue(db=Depends(get_supabase_admin)) -> HostedReviewQueue:
    """Posts held for a person at Myro. Token-guarded (X-Myro-Admin-Token)."""
    return HostedReviewQueue(jobs=[HostedReviewItem(**card) for card in pending_reviews(db)])


@router.post(
    "/internships/{job_id}/review",
    response_model=HostedReviewItem,
    dependencies=[Depends(require_admin)],
)
def decide_review(
    job_id: str,
    body: HostedReviewDecision,
    background_tasks: BackgroundTasks,
    db=Depends(get_supabase_admin),
) -> HostedReviewItem:
    """Clear (seekers see it) or refuse a held post. Clearing emails the poster."""
    card = review_hosted(db, job_id, body.decision)
    if not card:
        raise HTTPException(status_code=404, detail="No held post with this id")
    if card.get("hosted_review") == "cleared":
        background_tasks.add_task(tell_poster_live, db, card)
    return HostedReviewItem(**card)


@router.get("/internships/{job_id}", response_model=JobFeedItem)
def get_one_internship(job_id: str, db=Depends(get_supabase_admin)) -> JobFeedItem:
    card = get_internship(db, job_id)
    if not card:
        raise HTTPException(status_code=404, detail="Internship not found")
    return JobFeedItem(**card)


@router.post("/internships", response_model=JobFeedItem, status_code=status.HTTP_201_CREATED)
def post_internship(
    body: HostedInternshipRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    db=Depends(get_supabase_admin),
) -> JobFeedItem:
    try:
        card = insert_hosted(db, principal.id, body.model_dump())
    except UnpaidInternshipError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    background_tasks.add_task(alert_reviewer, card)
    return JobFeedItem(**card)


@router.post("/internships/{job_id}/apply", response_model=ApplicationResponse)
def apply_hosted_internship(
    job_id: str,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    db=Depends(get_supabase_admin),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    card = get_internship(db, job_id)
    if not card or card.get("listing_venue") != "myro":
        raise HTTPException(status_code=404, detail="Hosted internship not found")
    repo.record_apply_intent(
        principal.id,
        job_id,
        {
            "client_event_id": str(uuid.uuid4()),
            "surface": "internships",
            "destination_type": "hosted_role",
        },
    )
    # The intern apply page is the submit, so this is the Yes (CONTEXT → Application Yes).
    application_yes.say_yes(
        repo, background_tasks,
        user_id=principal.id, job_id=job_id, door=application_yes.DOOR_HOSTED,
        fields={"source": "user_discovery"},
    )
    row = repo.get_application_with_job(principal.id, job_id)
    if not row:
        raise HTTPException(status_code=500, detail="Application was not recorded")
    return to_application(row)
