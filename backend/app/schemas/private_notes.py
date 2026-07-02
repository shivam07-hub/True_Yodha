from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

# 'cv' covers the intake brain-dump (keyed by job_id); the others mirror comments
# so the private-notes surface can grow to skill/company later without a schema change.
PrivateEntityType = Literal["job", "skill", "company", "cv"]

_MAX_BODY = 20000  # brain-dumps run long; far above comments' 2k community cap


class PrivateNoteUpsertRequest(BaseModel):
    entity_type: PrivateEntityType
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
    def body_len(cls, v: str) -> str:
        if len(v) > _MAX_BODY:
            raise ValueError(f"Note must be {_MAX_BODY} characters or fewer")
        return v


class PrivateNoteResponse(BaseModel):
    """No user_id — identity never leaves the server. body is null when absent."""
    entity_type: PrivateEntityType
    entity_id: str
    body: str | None
    updated_at: datetime | None = None
