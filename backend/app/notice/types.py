"""Types on the Notice Interface. Callers never build a cause_key."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

CauseClass = Literal[
    "process_death",
    "unhandled_500",
    "capacity_503",
    "upload_guarantee",
    "work_lane",
    "dead_man",
    "slow_200",
]

Status = Literal["open", "closed", "open-on-prod", "blocked", "failed-close"]


@dataclass(frozen=True)
class Sighting:
    """A Railway-visible failure. Fact, not identity."""

    cause_class: CauseClass
    exc: BaseException | None = None
    correlation_id: str = ""
    method: str = ""
    path: str = ""
    limiter: str | None = None
    process: str | None = None
    death_kind: str | None = None
    break_kind: str | None = None
    job_type: str | None = None
    terminal_class: str | None = None
    belt: str | None = None
    slow_kind: str | None = None

    @staticmethod
    def unhandled_500(
        *,
        exc: BaseException,
        correlation_id: str,
        method: str,
        path: str,
    ) -> Sighting:
        return Sighting(
            cause_class="unhandled_500",
            exc=exc,
            correlation_id=correlation_id,
            method=method,
            path=path,
        )

    @staticmethod
    def read_capacity(
        *,
        correlation_id: str,
        method: str,
        path: str,
    ) -> Sighting:
        return Sighting(
            cause_class="capacity_503",
            correlation_id=correlation_id,
            method=method,
            path=path,
            limiter="read_capacity",
        )

    @staticmethod
    def upstream_timeout(
        *,
        correlation_id: str,
        method: str,
        path: str,
    ) -> Sighting:
        return Sighting(
            cause_class="capacity_503",
            correlation_id=correlation_id,
            method=method,
            path=path,
            limiter="upstream.read_timeout",
        )

    @staticmethod
    def process_death(*, process: str, death_kind: str) -> Sighting:
        return Sighting(
            cause_class="process_death",
            process=process,
            death_kind=death_kind,
        )

    @staticmethod
    def upload_guarantee(*, break_kind: str) -> Sighting:
        return Sighting(cause_class="upload_guarantee", break_kind=break_kind)

    @staticmethod
    def work_lane(*, job_type: str, terminal_class: str) -> Sighting:
        return Sighting(
            cause_class="work_lane",
            job_type=job_type,
            terminal_class=terminal_class,
        )

    @staticmethod
    def dead_man(*, belt: str) -> Sighting:
        return Sighting(cause_class="dead_man", belt=belt)

    @staticmethod
    def slow_200(*, kind: str, method: str, path: str) -> Sighting:
        return Sighting(
            cause_class="slow_200",
            slow_kind=kind,
            method=method,
            path=path,
        )


@dataclass(frozen=True)
class CloseProof:
    """Proof a cause is gone. Class 2 names type/file/function; others set cause_key."""

    exception_type: str = ""
    file: str = ""
    function: str = ""
    test_nodeid: str = ""
    sha: str = ""
    on_main: bool = False
    cause_key: str = ""


@dataclass(frozen=True)
class NoticeRecord:
    cause_key: str
    cause_class: CauseClass
    status: Status
    occurrence_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    last_method: str
    last_path: str
    last_correlation_id: str
    closing_commit: str | None
    blocked_reason: str | None
    proof_test: str | None


@dataclass(frozen=True)
class Digest:
    as_of: datetime
    rows: tuple[NoticeRecord, ...]
    closed_this_run: tuple[str, ...]
    informed: bool
    had_recipient: bool
