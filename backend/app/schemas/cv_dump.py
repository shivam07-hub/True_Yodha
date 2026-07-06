"""Schemas for the brain-dump notebook (User Memory Phase 3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DumpEntry(BaseModel):
    id: str
    text: str
    created_at: datetime


class AddDumpRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class DumpListResponse(BaseModel):
    entries: list[DumpEntry] = Field(default_factory=list)
