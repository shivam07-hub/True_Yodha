from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from uuid import UUID

from app.database import get_supabase, get_supabase_admin
from app.schemas.feedback import (
    BetaAssignmentReceipt,
    BetaAssignmentRequest,
    BetaAssignmentStatus,
    FeedbackReceipt,
    FeedbackReport,
    FeedbackRequest,
)
from app.services.feedback_delivery import (
    FeedbackIdempotencyConflict,
    ensure_matching_fingerprint,
    feedback_fingerprint,
    find_feedback_receipt,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])

_bearer = HTTPBearer(auto_error=False)

BETA_ASSIGNMENT_PROGRAM = "intern_beta_assignment_v1"


def _resolve_user_id(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if not credentials:
        return None
    try:
        response = get_supabase().auth.get_user(credentials.credentials)
        return response.user.id if response.user else None
    except Exception:
        return None


def _require_user_id(credentials: HTTPAuthorizationCredentials | None) -> str:
    user_id = _resolve_user_id(credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user_id


def _find_beta_assignment_receipt(user_id: str) -> BetaAssignmentReceipt | None:
    result = (
        get_supabase_admin()
        .table("user_feedback")
        .select("id, created_at")
        .eq("user_id", user_id)
        .eq("type", "feedback")
        .eq("payload->>program", BETA_ASSIGNMENT_PROGRAM)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    return BetaAssignmentReceipt(
        id=rows[0]["id"],
        submitted_at=rows[0]["created_at"],
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FeedbackReceipt,
    responses={status.HTTP_200_OK: {"model": FeedbackReceipt}},
)
def submit_feedback(
    body: FeedbackRequest,
    response: Response,
    idempotency_key: UUID | None = Header(default=None, alias="Idempotency-Key"),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> FeedbackReceipt:
    if body.payload.get("program") == BETA_ASSIGNMENT_PROGRAM:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This feedback program is reserved for its validated submission endpoint",
        )
    user_id = _resolve_user_id(credentials)
    db = get_supabase_admin()
    key = str(idempotency_key) if idempotency_key else None
    fingerprint = (
        feedback_fingerprint(body.type, body.payload) if key else None
    )
    if key and fingerprint:
        existing = find_feedback_receipt(
            db,
            idempotency_key=key,
            user_id=user_id,
        )
        if existing:
            try:
                ensure_matching_fingerprint(existing, fingerprint)
            except FeedbackIdempotencyConflict as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key was already used for different feedback",
                ) from exc
            response.status_code = status.HTTP_200_OK
            return FeedbackReceipt(id=existing["id"], replayed=True)

    row: dict = {"type": body.type, "payload": body.payload}
    if user_id:
        row["user_id"] = user_id
    if key and fingerprint:
        row["idempotency_key"] = key
        row["idempotency_fingerprint"] = fingerprint

    try:
        result = db.table("user_feedback").insert(row).execute()
    except APIError as exc:
        if key and fingerprint and getattr(exc, "code", None) == "23505":
            existing = find_feedback_receipt(
                db,
                idempotency_key=key,
                user_id=user_id,
            )
            if existing:
                try:
                    ensure_matching_fingerprint(existing, fingerprint)
                except FeedbackIdempotencyConflict:
                    pass
                else:
                    response.status_code = status.HTTP_200_OK
                    return FeedbackReceipt(id=existing["id"], replayed=True)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for different feedback",
            ) from exc
        raise
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save feedback")

    return FeedbackReceipt(id=result.data[0]["id"], replayed=False)


@router.get("/beta-assignment", response_model=BetaAssignmentStatus)
def get_beta_assignment_status(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> BetaAssignmentStatus:
    user_id = _require_user_id(credentials)
    receipt = _find_beta_assignment_receipt(user_id)
    return BetaAssignmentStatus(
        submitted=receipt is not None,
        receipt=receipt,
    )


@router.post(
    "/beta-assignment",
    status_code=status.HTTP_201_CREATED,
    response_model=BetaAssignmentReceipt,
)
def submit_beta_assignment(
    body: BetaAssignmentRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> BetaAssignmentReceipt:
    user_id = _require_user_id(credentials)
    if _find_beta_assignment_receipt(user_id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has already submitted optional feedback",
        )

    payload = {
        "program": BETA_ASSIGNMENT_PROGRAM,
        "schema_version": 1,
        "submitted_via": "beta_feedback_page",
        "role_stream": body.role_stream,
        "session": {
            "device_type": body.device_type,
            "operating_system": body.operating_system,
            "browser": body.browser,
            "connection_type": body.connection_type,
            "session_outcome": body.session_outcome,
            "time_to_value": body.time_to_value,
            "areas_explored": body.areas_explored,
        },
        "assessment": {
            "product_understanding": body.product_understanding,
            "most_useful_moment": body.most_useful_moment,
            "biggest_problem_area": body.biggest_problem_area,
            "biggest_problem": body.biggest_problem,
            "attempted_action": body.attempted_action,
            "expected_result": body.expected_result,
            "actual_result": body.actual_result,
            "reproduction_steps": body.reproduction_steps,
            "priority_improvement": body.priority_improvement,
            "priority_reason": body.priority_reason,
            "preserve": body.preserve,
            "return_trigger": body.return_trigger,
        },
        "ratings": {
            "next_step": body.rating_next_step,
            "trust": body.rating_trust,
            "relevance": body.rating_relevance,
            "return": body.rating_return,
            "recommend": body.rating_recommend,
        },
        "confirmations": {
            "privacy": body.privacy_confirmation,
            "independent_work": body.independent_work_confirmation,
            "final_submission": body.final_submission_confirmation,
        },
    }
    row = {
        "user_id": user_id,
        "type": "feedback",
        "status": "received",
        "payload": payload,
    }

    try:
        result = get_supabase_admin().table("user_feedback").insert(row).execute()
    except APIError as exc:
        if getattr(exc, "code", None) != "23505":
            raise
        _find_beta_assignment_receipt(user_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has already submitted optional feedback",
        ) from exc

    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save optional feedback",
        )
    return BetaAssignmentReceipt(
        id=rows[0]["id"],
        submitted_at=rows[0]["created_at"],
    )


@router.get("/my")
def list_my_feedback(
    limit: int = Query(50, ge=1, le=200),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> list[FeedbackReport]:
    user_id = _require_user_id(credentials)

    result = (
        get_supabase_admin()
        .table("user_feedback")
        .select("id, type, status, payload, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    rows = result.data or []
    return [FeedbackReport(**row) for row in rows]
