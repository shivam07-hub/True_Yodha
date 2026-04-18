from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from typing import Literal

from app.database import get_supabase, get_supabase_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])

_bearer = HTTPBearer(auto_error=False)

FeedbackType = Literal["feedback", "company", "bug"]


class FeedbackRequest(BaseModel):
    type: FeedbackType
    payload: dict


def _resolve_user_id(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if not credentials:
        return None
    try:
        response = get_supabase().auth.get_user(credentials.credentials)
        return response.user.id if response.user else None
    except Exception:
        return None


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit_feedback(
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
