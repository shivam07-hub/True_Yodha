from fastapi import APIRouter, Depends, status

from app.deps import CurrentUser, get_current_user
from app.repositories.notifications import (
    NotificationsRepository,
    get_notifications_repository,
)
from app.schemas.notifications import (
    MarkReadRequest,
    NotificationItem,
    NotificationsResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    user: CurrentUser = Depends(get_current_user),
    repo: NotificationsRepository = Depends(get_notifications_repository),
) -> UnreadCountResponse:
    """Cheap badge poll — the bell reads this often; the full inbox loads only on
    open. Declared before "" so the path is unambiguous."""
    return UnreadCountResponse(count=repo.unread_count(user.id))


@router.get("", response_model=NotificationsResponse)
def list_notifications(
    user: CurrentUser = Depends(get_current_user),
    repo: NotificationsRepository = Depends(get_notifications_repository),
) -> NotificationsResponse:
    """The user's inbox, newest first (capped)."""
    rows = repo.list_for_user(user.id)
    items = [NotificationItem(**row) for row in rows]
    unread = sum(1 for it in items if it.read_at is None)
    return NotificationsResponse(items=items, unread_count=unread)


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    body: MarkReadRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: NotificationsRepository = Depends(get_notifications_repository),
) -> None:
    """Mark the given notifications read, or all unread when `ids` is omitted."""
    repo.mark_read(user.id, body.ids)
