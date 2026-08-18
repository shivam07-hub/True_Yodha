"""Typed payloads for the Job Refresh seam."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

RefreshLifecycle = Literal["queued", "computing", "done", "failed"]
RefreshOutcomeKind = Literal["written", "cache_hit", "exhausted", "needs_onboarding"]

PROGRESS_LABELS: dict[RefreshLifecycle, str] = {
    "queued": "Waiting to start",
    "computing": "Ranking with Myro",
    "done": "Done",
    "failed": "Failed",
}

# Shown when the Job Runner is missing — refuse at dispatch, or abandon a
# ticket that is still queued after this many seconds of a dead runner.
SEARCH_UNAVAILABLE = "Search couldn't start — try again in a moment."
SEARCH_FAILED = "Search couldn't finish — try again in a moment."
SEARCH_TIMED_OUT = "Search timed out — try again in a moment."
# Same lifecycle as computing — a label change so the stream shows the retry.
SEARCH_RETRYING = "Trying that again"
QUEUED_STRANDED_SECONDS = 8.0


@dataclass(frozen=True)
class RefreshTicket:
    """Result of `JobRefresh.start`.

    `new_coin_balance` is None when the run was free — a Myro-initiated run
    charges nothing, so there is no new balance to report and the client keeps
    the number it already has. Same contract as `RefreshState` below.
    """
    id: str
    state: Literal["queued", "computing", "done"]
    xp_charged: int
    new_coin_balance: int | None
    batch_week: date
    progress_label: str
    matches_written: int | None = None


@dataclass(frozen=True)
class RefreshState:
    """Result of `JobRefresh.status`. Terminal states carry final XP balance + refund.

    `progress_done`/`progress_total`/`revealed` carry the per-job reveal feed
    during the `computing` phase (ADR-0009): the ranker reports each job as its
    eval lands; the SSE relay streams them so the UI reveals roles one-by-one.
    """
    ticket_id: str
    state: RefreshLifecycle
    progress_label: str
    batch_week: date
    matches_written: int | None = None
    refund: int | None = None
    new_coin_balance: int | None = None
    outcome_kind: RefreshOutcomeKind | None = None
    error: str | None = None
    debug: dict[str, Any] = field(default_factory=dict)
    progress_done: int | None = None
    progress_total: int | None = None
    revealed: list[dict[str, Any]] = field(default_factory=list)
    # Stamped on `queued` so a stranded ticket can refund without a second wallet read.
    xp_charged: int = 0
