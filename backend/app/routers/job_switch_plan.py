"""₹99 Personalised Job-Switch Plan — owner read + second-review request, plus
the founder/HITL review-delivery endpoint (#33).

Payment + activation live in routers/payments.py (a "job_switch_plan" entitlement
product → job_switch_plan_service.activate_plan). This router is the post-purchase
surface: read your plan + reviews, request the second review, and (token-gated)
deliver a review. The living skill content is composed client-side from the
existing skill surfaces — this returns plan meta + review lifecycle only.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.config import settings
from app.deps import Principal, get_principal
from app.services import job_switch_plan_service as svc

router = APIRouter(prefix="/job-switch-plan", tags=["job-switch-plan"])
logger = logging.getLogger(__name__)


class ReviewResponse(BaseModel):
    id: str
    review_no: int
    status: str
    review_text: str | None = None
    sla_due_at: str
    requested_at: str
    delivered_at: str | None = None


class PlanResponse(BaseModel):
    id: str
    target_role: str | None = None
    status: str
    reviews_used: int
    window_expires_at: str
    created_at: str
    reviews: list[ReviewResponse]
    can_request_second_review: bool
    window_open: bool


class ReviewStatusUpdate(BaseModel):
    status: str
    review_text: str | None = None


def require_admin(x_myro_admin_token: str | None = Header(default=None)) -> None:
    expected = settings.job_switch_admin_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job-Switch Plan admin endpoint is not configured.",
        )
    supplied = (x_myro_admin_token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token.")


def _to_plan_response(state: dict) -> PlanResponse:
    plan = state["plan"]
    return PlanResponse(
        id=str(plan["id"]),
        target_role=plan.get("target_role"),
        status=str(plan.get("status")),
        reviews_used=int(plan.get("reviews_used") or 0),
        window_expires_at=str(plan.get("window_expires_at")),
        created_at=str(plan.get("created_at")),
        reviews=[
            ReviewResponse(
                id=str(r["id"]),
                review_no=int(r["review_no"]),
                status=str(r["status"]),
                review_text=r.get("review_text"),
                sla_due_at=str(r.get("sla_due_at")),
                requested_at=str(r.get("requested_at")),
                delivered_at=r.get("delivered_at"),
            )
            for r in state["reviews"]
        ],
        can_request_second_review=bool(state["can_request_second_review"]),
        window_open=bool(state["window_open"]),
    )


@router.get("", response_model=PlanResponse | None)
async def get_plan(principal: Principal = Depends(get_principal)) -> PlanResponse | None:
    state = await run_in_threadpool(svc.get_plan_state, principal.id)
    if state is None:
        return None
    return _to_plan_response(state)


@router.post("/request-review", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def request_review(principal: Principal = Depends(get_principal)) -> ReviewResponse:
    review = await run_in_threadpool(svc.request_second_review, principal.id)
    return ReviewResponse(
        id=str(review["id"]),
        review_no=int(review["review_no"]),
        status=str(review["status"]),
        review_text=review.get("review_text"),
        sla_due_at=str(review.get("sla_due_at")),
        requested_at=str(review.get("requested_at")),
        delivered_at=review.get("delivered_at"),
    )


@router.patch(
    "/reviews/{review_id}/status",
    response_model=ReviewResponse,
    dependencies=[Depends(require_admin)],
)
async def update_review_status(review_id: str, body: ReviewStatusUpdate) -> ReviewResponse:
    """Founder/HITL ops: advance a review pending -> in_progress -> delivered.
    Delivering requires the personalised note; it stamps delivered_at + bumps the
    plan's reviews_used. Token-guarded (X-Myro-Admin-Token)."""
    review = await run_in_threadpool(svc.transition_review, review_id, body.status, body.review_text)
    logger.info("metric jsp.review_transition id=%s status=%s", review_id, body.status)
    return ReviewResponse(
        id=str(review["id"]),
        review_no=int(review["review_no"]),
        status=str(review["status"]),
        review_text=review.get("review_text"),
        sla_due_at=str(review.get("sla_due_at")),
        requested_at=str(review.get("requested_at")),
        delivered_at=review.get("delivered_at"),
    )
