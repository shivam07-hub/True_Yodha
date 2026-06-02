from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from typing import Literal

from app.database import get_supabase, get_supabase_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])

_bearer = HTTPBearer(auto_error=False)

# Legacy types (feedback/company/bug) stay for backwards compat with any older
# clients still in the wild. New types power the Feedback Hub.
FeedbackType = Literal[
    "bug",
    "idea",
    "question",
    "praise",
    "feedback",
    "company",
]

FeedbackStatus = Literal["received", "triaged", "in_progress", "shipped", "closed"]


class FeedbackRequest(BaseModel):
    type: FeedbackType
    payload: dict


class FeedbackReport(BaseModel):
    id: int
    type: FeedbackType
    status: FeedbackStatus
    payload: dict
    created_at: str


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


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_feedback(
    body: FeedbackRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    user_id = _resolve_user_id(credentials)

    row: dict = {"type": body.type, "payload": body.payload}
    if user_id:
        row["user_id"] = user_id

    result = get_supabase_admin().table("user_feedback").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save feedback")

    return {"ok": True, "id": result.data[0]["id"]}


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
