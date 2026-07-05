"""Schemas for the User Memory store (Phase 1)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# Non-columnized kinds only — role/location/seniority keep their profile columns.
MemoryKind = Literal[
    "aspiration",
    "constraint",
    "habit",
    "preference",
    "salary",
    "work_mode",
    "target_company",
    "note",
]


class MemoryFact(BaseModel):
    id: str
    kind: MemoryKind
    text: str
    resolved: dict[str, Any] | None = None
    source: Literal["authored", "distilled"] = "authored"
    confidence: float | None = None
    status: Literal["active", "dismissed"] = "active"
    created_at: datetime
    updated_at: datetime


class AddMemoryRequest(BaseModel):
    kind: MemoryKind
    text: str = Field(min_length=1, max_length=2000)
    resolved: dict[str, Any] | None = None


class UpdateMemoryRequest(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    status: Literal["active", "dismissed"] | None = None


class MemoryListResponse(BaseModel):
    facts: list[MemoryFact] = Field(default_factory=list)
