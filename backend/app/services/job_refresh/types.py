"""Typed payloads for the Job Refresh seam."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

RefreshLifecycle = Literal["queued", "computing", "done", "failed"]
RefreshOutcomeKind = Literal["written", "cache_hit", "exhausted", "needs_onboarding"]

PROGRESS_LABELS: dict[RefreshLifecycle, str] = {
    "queued": "Queued",
    "computing": "Ranking with Myro",
    "done": "Done",
    "failed": "Failed",
}


@dataclass(frozen=True)
class RefreshTicket:
    """Result of `JobRefresh.start`. XP already charged at this point."""
    id: str
    state: Literal["queued", "computing", "done"]
    xp_charged: int
    new_xp_balance: int
    batch_week: date
    progress_label: str
    matches_written: int | None = None


@dataclass(frozen=True)
class RefreshState:
    """Result of `JobRefresh.status`. Terminal states carry final XP balance + refund."""
    ticket_id: str
    state: RefreshLifecycle
    progress_label: str
    batch_week: date
    matches_written: int | None = None
    refund: int | None = None
    new_xp_balance: int | None = None
    outcome_kind: RefreshOutcomeKind | None = None
    error: str | None = None
    debug: dict[str, Any] = field(default_factory=dict)
