from __future__ import annotations

from pydantic import BaseModel


class NotificationItem(BaseModel):
    """One inbox row. `read_at` None = unread. `source_id` ties lifecycle
    notifications to their durable source row; `action_url` is the owner-safe
    destination rendered by the inbox."""

    id: int
    kind: str
    title: str
    body: str | None = None
    job_id: str | None = None
    source_id: str | None = None
    action_url: str | None = None
    state: str | None = None
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
