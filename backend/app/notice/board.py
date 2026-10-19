"""NoticeBook — one Module, three entry points: observe, settle, snapshot."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

from app.notice.clock import Clock, FrozenClock
from app.notice.fingerprint import cause_key_for, cause_key_for_proof
from app.notice.mailer import Mailer, SilentMailer
from app.notice.memory import MemoryNoticeStore
from app.notice.store import NoticeStore
from app.notice.types import CloseProof, Digest, NoticeRecord, Sighting, Status

_logger = logging.getLogger("app.notice")

_CAPACITY_BLOCKED = "Overload Policy / paid compute gate"

#: How long a belt must go without a dead sighting before a healthy harvest may
#: clear its failed close: a week of daily closer runs, ingestion's own stall
#: window (168h).
RECOVERY_HELD = timedelta(days=7)

def _blocked_band(count: int) -> int:
    """Highest power of two at or below count. A blocked row mails when this changes."""
    if count <= 0:
        return 0
    return 1 << (count.bit_length() - 1)


def _open_set_fingerprint(rows: tuple[NoticeRecord, ...]) -> str:
    """Identity of what the operator needs to hear about.

    An open cause includes its count, so another user hitting the same bug is
    news. A blocked cause includes only the power-of-two band, so the paid
    compute gate does not page every day it ticks, and does page when it
    doubles.     Dead-man probes do not reach this: a repeat probe refreshes
    last_seen_at and leaves the count alone.
    """
    parts: list[str] = []
    for row in rows:
        if row.status == "blocked":
            parts.append(f"{row.cause_key}:{row.status}:x{_blocked_band(row.occurrence_count)}")
        else:
            parts.append(f"{row.cause_key}:{row.status}:n={row.occurrence_count}")
    return hashlib.sha256("\n".join(sorted(parts)).encode()).hexdigest()


_PRIORITY = ("failed-close", "open", "open-on-prod", "blocked")
_SETTLEABLE = frozenset(
    {
        "unhandled_500",
        "work_lane",
        "upload_guarantee",
        "dead_man",
        "slow_200",
    }
)


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

    def _worth_sending(
        self,
        now: datetime,
        rows: tuple[NoticeRecord, ...],
        closed: list[str],
    ) -> bool:
        """Send only when something moved — plus a Monday heartbeat.

        The digest went out every day whether or not anything had changed. Most
        of those said the same thing as yesterday, and a mail that is usually
        noise is a mail nobody opens on the day it matters.

        "Moved" is the open set plus the counts that mean a person was hurt
        again. An open cause mails when its count changes. A blocked cause
        mails when its count doubles. A dead-man probe does neither: it
        refreshes last_seen_at and leaves the count alone, so a belt that is
        still dead does not page every five minutes.

        Monday always sends, so a quiet week still proves the Action is alive —
        silence from a working system and silence from a dead one must not look
        the same. That is the same rule the belts themselves are built on.
        """
        if closed:
            return True                      # a close is always news
        if now.weekday() == 0:
            return True                      # Monday heartbeat, open or not
        if not rows:
            # Nothing open and nothing closed. The Monday heartbeat above is
            # what proves the Action is alive; a daily "no open Notices" does
            # not, it just spends the reader's attention.
            return False
        try:
            last = self._store.last_digest_fingerprint()
        except Exception:  # noqa: BLE001 — never lose a digest to a read failure
            _logger.exception("metric notice.digest_fingerprint_read_failed")
            return True
        return _open_set_fingerprint(rows) != last

    def settle(self, proofs: list[CloseProof] | tuple[CloseProof, ...] = ()) -> Digest:
        """Apply class-2 proofs, then one digest. Git is a caller (on_main)."""
        closed: list[str] = []
        now = self._clock.now()
        by_key: dict[str, list[CloseProof]] = {}
        for proof in proofs:
            by_key.setdefault(cause_key_for_proof(proof), []).append(proof)
        for row in self._store.list_not_closed():
            if row.cause_class not in _SETTLEABLE:
                continue
            if row.status not in ("open", "failed-close"):
                continue
            proof = _proof_that_can_close(row, by_key.get(row.cause_key, ()), now)
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
        if self._mailer is not None and self._worth_sending(now, rows, closed):
            informed = bool(
                self._mailer.send(
                    subject=f"Myro Notice digest ({now.date().isoformat()})",
                    text=text,
                )
            )
            if informed:
                self._store.record_digest(_open_set_fingerprint(rows), now)
        # The run is the artefact, including the run that correctly sent
        # nothing. A quiet day with no row is indistinguishable from a dead
        # Action. A missing table must not swallow the digest.
        try:
            self._store.mark_closer_ran(now)
        except Exception:
            _logger.exception("metric notice.closer_heartbeat_failed")
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
        if (
            existing is not None
            and sighting.cause_class == "dead_man"
            and existing.status != "closed"
        ):
            self._store.put(
                NoticeRecord(
                    cause_key=existing.cause_key,
                    cause_class=existing.cause_class,
                    status=existing.status,
                    occurrence_count=existing.occurrence_count,
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
            return
        if existing is None:
            status, blocked_reason = _opening(sighting)
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
                    blocked_reason=blocked_reason,
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


def _proof_that_can_close(
    row: NoticeRecord, proofs: Sequence[CloseProof], now: datetime
) -> CloseProof | None:
    """The first proof this row would accept, or None.

    An open cause takes any proof. A failed close takes only a proof that has
    not already failed it. The test that closed it last time is refused:
    production re-presents every test it ships on every run, so the digest said
    "closed" for `fetch_company_jobs_page` on 2026-10-17 and 10-18 while it
    fired 701 times. A harvest proof is one healthy sample, and the sample that
    failed to hold may not launder it — until the belt has gone `RECOVERY_HELD`
    without a dead sighting. A dead-man's `last_seen_at` is the last time it was
    seen dead, and some belts' causes (the scraper) live in no test here.
    """
    for proof in proofs:
        if row.status == "failed-close":
            if proof.test_nodeid.startswith("harvest:"):
                if now - row.last_seen_at < RECOVERY_HELD:
                    continue
            elif proof.test_nodeid == row.proof_test:
                continue
        return proof
    return None


def _opening(sighting: Sighting) -> tuple[Status, str | None]:
    if sighting.cause_class == "capacity_503":
        return "blocked", _CAPACITY_BLOCKED
    if sighting.cause_class == "slow_200" and sighting.slow_kind in ("capacity_queue", "db_stall"):
        return "blocked", _CAPACITY_BLOCKED
    return "open", None


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
