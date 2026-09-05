"""NoticeBook — one Module, three entry points: observe, settle, snapshot."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.notice.clock import Clock, FrozenClock
from app.notice.fingerprint import cause_key_for, cause_key_for_proof
from app.notice.mailer import Mailer, SilentMailer
from app.notice.memory import MemoryNoticeStore
from app.notice.store import NoticeStore
from app.notice.types import CloseProof, Digest, NoticeRecord, Sighting, Status

_logger = logging.getLogger("app.notice")

_CAPACITY_BLOCKED = "Overload Policy / paid compute gate"

_PRIORITY = ("failed-close", "open", "open-on-prod", "blocked")


class NoticeBook:
    def __init__(
        self,
        *,
        store: NoticeStore,
        clock: Clock,
        persist: bool,
        mailer: Mailer | None = None,
    ) -> None:
        self._store = store
        self._clock = clock
        self._persist = persist
        self._mailer = mailer

    @classmethod
    def testing(cls) -> NoticeBook:
        return cls(
            store=MemoryNoticeStore(),
            clock=FrozenClock(datetime(2026, 9, 6, tzinfo=timezone.utc)),
            persist=True,
            mailer=SilentMailer(),
        )

    def observe(self, sighting: Sighting) -> None:
        """Record a failure. Never raises. Never mails."""
        try:
            if not self._persist:
                return
            self._record(sighting)
        except Exception:
            _logger.exception("metric notice.observe_failed")

    def snapshot(self, *, status: Status | None = None) -> tuple[NoticeRecord, ...]:
        rows = self._store.list_all()
        if status is None:
            return rows
        return tuple(row for row in rows if row.status == status)

    def settle(self, proofs: list[CloseProof] | tuple[CloseProof, ...] = ()) -> Digest:
        """Apply class-2 proofs, then one digest. Git is a caller (on_main)."""
        closed: list[str] = []
        now = self._clock.now()
        by_key = {cause_key_for_proof(proof): proof for proof in proofs}
        for row in self._store.list_not_closed():
            if row.cause_class != "unhandled_500":
                continue
            if row.status not in ("open", "failed-close"):
                continue
            proof = by_key.get(row.cause_key)
            if proof is None:
                continue
            next_status: Status = "closed" if proof.on_main else "open-on-prod"
            self._store.put(
                NoticeRecord(
                    cause_key=row.cause_key,
                    cause_class=row.cause_class,
                    status=next_status,
                    occurrence_count=row.occurrence_count,
                    first_seen_at=row.first_seen_at,
                    last_seen_at=row.last_seen_at,
                    last_method=row.last_method,
                    last_path=row.last_path,
                    last_correlation_id=row.last_correlation_id,
                    closing_commit=proof.sha,
                    blocked_reason=row.blocked_reason,
                    proof_test=proof.test_nodeid,
                )
            )
            if next_status == "closed":
                closed.append(row.cause_key)
        rows = self._ordered(self._store.list_not_closed())
        text = _digest_text(now, rows, tuple(closed))
        informed = False
        had_recipient = self._mailer is not None
        if self._mailer is not None:
            informed = bool(
                self._mailer.send(
                    subject=f"Myro Notice digest ({now.date().isoformat()})",
                    text=text,
                )
            )
        return Digest(
            as_of=now,
            rows=rows,
            closed_this_run=tuple(closed),
            informed=informed,
            had_recipient=had_recipient,
        )

    def _record(self, sighting: Sighting) -> None:
        key = cause_key_for(sighting)
        now = self._clock.now()
        existing = self._store.get(key)
        if existing is None:
            status: Status = (
                "blocked" if sighting.cause_class == "capacity_503" else "open"
            )
            self._store.put(
                NoticeRecord(
                    cause_key=key,
                    cause_class=sighting.cause_class,
                    status=status,
                    occurrence_count=1,
                    first_seen_at=now,
                    last_seen_at=now,
                    last_method=sighting.method,
                    last_path=sighting.path,
                    last_correlation_id=sighting.correlation_id,
                    closing_commit=None,
                    blocked_reason=_CAPACITY_BLOCKED if status == "blocked" else None,
                    proof_test=None,
                )
            )
            return
        next_status = (
            "failed-close" if existing.status == "closed" else existing.status
        )
        self._store.put(
            NoticeRecord(
                cause_key=existing.cause_key,
                cause_class=existing.cause_class,
                status=next_status,
                occurrence_count=existing.occurrence_count + 1,
                first_seen_at=existing.first_seen_at,
                last_seen_at=now,
                last_method=sighting.method or existing.last_method,
                last_path=sighting.path or existing.last_path,
                last_correlation_id=(
                    sighting.correlation_id or existing.last_correlation_id
                ),
                closing_commit=existing.closing_commit,
                blocked_reason=existing.blocked_reason,
                proof_test=existing.proof_test,
            )
        )

    def _ordered(self, rows: tuple[NoticeRecord, ...]) -> tuple[NoticeRecord, ...]:
        rank = {status: index for index, status in enumerate(_PRIORITY)}
        return tuple(sorted(rows, key=lambda row: rank.get(row.status, 99)))


def _digest_text(
    as_of: datetime,
    rows: tuple[NoticeRecord, ...],
    closed: tuple[str, ...],
) -> str:
    lines = [f"as_of={as_of.isoformat()}", ""]
    if closed:
        lines.append("closed this run:")
        lines.extend(f"  {key}" for key in closed)
        lines.append("")
    if not rows:
        lines.append("no open Notices.")
        return "\n".join(lines)
    lines.append("still open:")
    for row in rows:
        lines.append(
            f"  {row.status} {row.cause_key} n={row.occurrence_count}"
            f" last={row.last_method} {row.last_path}".rstrip()
        )
    return "\n".join(lines)
