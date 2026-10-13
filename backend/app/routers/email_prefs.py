"""The golden-list digest's one-click unsubscribe (#59, RFC 8058).

No login: the token in the email is the proof (`golden_digest.unsubscribe_token`,
an HMAC of the person's id). Mail clients POST here straight from the
`List-Unsubscribe` header; the `/unsubscribe` page POSTs here when the person
presses its one button. A GET never unsubscribes — link scanners open every URL
in a message, and a scanner must not take someone off the list.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.database import get_supabase_admin
from app.services import golden_digest

router = APIRouter(prefix="/email", tags=["email"])


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(t: str = Query(min_length=10, max_length=200)) -> Response:
    user_id = golden_digest.user_for_token(t)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This link is not valid.")
    # The first unsubscribe is the one recorded; a second press changes nothing.
    get_supabase_admin().table("user_profiles").update(
        {"digest_unsubscribed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", user_id).is_("digest_unsubscribed_at", "null").execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
