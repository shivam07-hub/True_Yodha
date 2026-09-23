"""The digest mails when something moved, and on Mondays. Not every day.

`board.settle` sent whenever a recipient was configured, so a day with nothing
open and nothing closed still produced "Myro Notice digest (date)". 365 mails a
year, most of them saying what yesterday said. A mail that is usually noise is
the mail nobody opens on the day it matters — and the day it matters is the day
a belt like ingestion has been dead for a week.

"Moved" is the open SET — which causes are open and in what state — not the
occurrence counter, which a live dead-man bumps on every /health probe without
anything actually happening.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.notice.board import NoticeBook
from app.notice.clock import FrozenClock
from app.notice.mailer import RecordingMailer
from app.notice.memory import MemoryNoticeStore
from app.notice.types import CloseProof, Sighting

# A Tuesday, so the Monday heartbeat never hides a real assertion.
TUE = datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc)
MON = datetime(2026, 9, 21, 9, 0, tzinfo=timezone.utc)


def _book(store: MemoryNoticeStore, mailer: RecordingMailer, at: datetime) -> NoticeBook:
    return NoticeBook(store=store, clock=FrozenClock(at), persist=True, mailer=mailer)


def _stall(store: MemoryNoticeStore, mailer: RecordingMailer, at: datetime) -> None:
    book = _book(store, mailer, at)
    book.observe(Sighting.dead_man(belt="job_ingestion"))
    book.settle([])


def test_a_new_notice_sends() -> None:
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    assert len(mailer.sent) == 1


def test_the_same_open_set_tomorrow_sends_nothing() -> None:
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    _stall(store, mailer, TUE + timedelta(days=1))
    assert len(mailer.sent) == 1, "an unchanged digest was mailed again"


def test_a_quiet_week_still_sends_on_monday() -> None:
    # Silence from a working Action and silence from a dead one must not look
    # the same — the rule the belts themselves are built on.
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    _stall(store, mailer, TUE + timedelta(days=1))
    _stall(store, mailer, MON + timedelta(days=7))
    assert len(mailer.sent) == 2


def test_a_second_belt_opening_is_movement() -> None:
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    book = _book(store, mailer, TUE + timedelta(days=1))
    book.observe(Sighting.dead_man(belt="job_ingestion"))
    book.observe(Sighting.dead_man(belt="listing_verifier"))
    book.settle([])
    assert len(mailer.sent) == 2


def test_a_close_is_always_news() -> None:
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    book = _book(store, mailer, TUE + timedelta(days=1))
    book.settle([
        CloseProof(
            cause_key="dead_man:job_ingestion",
            test_nodeid="harvest:job_ingestion_ran",
            sha="deadbeef",
            on_main=True,
        )
    ])
    assert len(mailer.sent) == 2


def test_re_observing_the_same_belt_is_not_movement() -> None:
    # /health probes the belt every five minutes. Each probe bumps
    # occurrence_count and last_seen_at; none of that is news.
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _stall(store, mailer, TUE)
    book = _book(store, mailer, TUE + timedelta(days=1))
    for _ in range(20):
        book.observe(Sighting.dead_man(belt="job_ingestion"))
    book.settle([])
    assert len(mailer.sent) == 1


def test_nothing_open_at_all_sends_nothing_on_a_tuesday() -> None:
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _book(store, mailer, TUE).settle([])
    assert mailer.sent == []


def test_monday_sends_even_with_nothing_open() -> None:
    # The heartbeat's whole job: prove the Action still runs. A week of silence
    # from a healthy system must not read the same as a week of silence from a
    # dead one — 52 mails a year buys that, 365 does not.
    store, mailer = MemoryNoticeStore(), RecordingMailer()
    _book(store, mailer, MON).settle([])
    assert len(mailer.sent) == 1
