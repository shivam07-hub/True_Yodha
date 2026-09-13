from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

# Legacy types remain for older clients. New types power the Feedback Hub.
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


class FeedbackReceipt(BaseModel):
    ok: bool = True
    id: int
    replayed: bool
