"""Schemas for the brain-dump notebook (User Memory Phase 3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DumpEntry(BaseModel):
    id: str
    text: str
    source: str = "manual"  # which surface authored it: manual | job_intent | …
    created_at: datetime


class AddDumpRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    # Which surface is writing. Defaults to a hand-typed notebook entry; callers
    # like the "Not it? Tell Myro" capture pass their own tag so /notebook can
    # show provenance. Charset-bounded to keep it a stable label, not free text.
    source: str = Field(default="manual", pattern=r"^[a-z_]{1,32}$")


class DumpListResponse(BaseModel):
    entries: list[DumpEntry] = Field(default_factory=list)
