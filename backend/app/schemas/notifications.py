from __future__ import annotations

from pydantic import BaseModel


class NotificationItem(BaseModel):
    """One inbox row. `read_at` None = unread. For 'fresh_matches', `job_id` is
    the top match carried in the ping and `match_count` how many landed."""

    id: int
    kind: str
    title: str
    body: str | None = None
    job_id: str | None = None
    match_count: int = 1
    read_at: str | None = None
    created_at: str


class NotificationsResponse(BaseModel):
    items: list[NotificationItem]
    unread_count: int = 0


class UnreadCountResponse(BaseModel):
    count: int = 0


class MarkReadRequest(BaseModel):
    ids: list[int] | None = None  # None = mark every unread notification read
