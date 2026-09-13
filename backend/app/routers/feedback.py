from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from uuid import UUID

from app.database import get_supabase, get_supabase_admin
from app.schemas.feedback import (
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

# The retired intern-beta cohort form (deleted 2026-09-13) wrote under this
# program tag. Its 114 reports ARE the closure ledger — the guard below stays so
# a general submission can never forge the tag and pollute that record, and
# backend/scripts/export_beta_feedback_ledger.py still reads the rows. Only the
# write path is gone; the data and its reader are not.
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
            detail="This feedback program is closed and cannot accept new submissions",
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
