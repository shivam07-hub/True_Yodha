from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

EntityType = Literal["job", "skill", "company"]

_MAX_BODY = 2000


def _clean_body(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("Comment cannot be empty")
    if len(text) > _MAX_BODY:
        raise ValueError(f"Comment must be {_MAX_BODY} characters or fewer")
    return text


class CommentCreateRequest(BaseModel):
    entity_type: EntityType
    entity_id: str
    body: str

    @field_validator("entity_id")
    @classmethod
    def entity_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("entity_id is required")
        return v.strip()

    @field_validator("body")
    @classmethod
    def body_ok(cls, v: str) -> str:
        return _clean_body(v)


class CommentUpdateRequest(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def body_ok(cls, v: str) -> str:
        return _clean_body(v)


class CommentResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    body: str
    created_at: datetime
    updated_at: datetime


class CommentListResponse(BaseModel):
    comments: list[CommentResponse]
    total: int
