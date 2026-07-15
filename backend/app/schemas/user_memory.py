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


# ── Persona canvas (Lane B — "What Myro knows about you") ────────────────────

PersonaMovement = Literal["past", "present", "future"]


class PersonaParagraph(BaseModel):
    id: str
    movement: PersonaMovement
    text: str
    author: Literal["myro", "user"] = "myro"
    pinned: bool = False
    # Resolved signal lines this paragraph draws on — the visible trace.
    grounds: list[str] = Field(default_factory=list)


class PersonaTimelineRole(BaseModel):
    company: str = ""
    title: str
    date_label: str = ""
    started_on: str | None = None


class PersonaResponse(BaseModel):
    # pending = no canvas yet, synthesis scheduled; FE polls while pending.
    status: Literal["ready", "pending"]
    paragraphs: list[PersonaParagraph] = Field(default_factory=list)
    generated_at: datetime | None = None
    timeline: list[PersonaTimelineRole] = Field(default_factory=list)
    # Cosmos lens state: 'none' → dormant constellation; 'on_file' → birth
    # details exist via Myrology intake (reading arrives with Myrology).
    cosmos: Literal["none", "on_file"] = "none"


class PersonaEditRequest(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=1200)
    pinned: bool | None = None
