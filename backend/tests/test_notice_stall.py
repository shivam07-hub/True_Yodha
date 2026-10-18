"""One database stall is one Notice — `notice/stall.py` at its Interface."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from app.notice import NoticeBook, Sighting, wiring
from app.notice.stall import StallWindow

_T0 = datetime(2026, 10, 16, 5, 8, tzinfo=timezone.utc)


def _slow(file: str, function: str, path: str = "/home/bootstrap") -> Sighting:
    return Sighting.slow_read(file=file, function=function, method="GET", path=path)


# 2026-10-16 05:08–05:15, the scraper's landing: five call sites crossed 2s
# inside one stall, and each opened (or failed-closed) its own Notice.
_LANDING = (
    _slow("app/repositories/cv.py", "latest_baseline"),
    _slow("app/repositories/users.py", "baseline_state", "/users/me"),
    _slow("app/repositories/jobs.py", "get_user_profile_targeting", "/jobs/feed"),
)


def _file_all(window: StallWindow, sightings: tuple[Sighting, ...], gap: timedelta) -> list[Sighting]:
    filed: list[Sighting] = []
    at = _T0
    for sighting in sightings:
        filed.extend(window.admit(sighting, at))
        at += gap
    filed.extend(window.due(at + timedelta(minutes=2)))
    return filed


def test_a_slow_read_waits_out_its_window_before_it_is_filed() -> None:
    window = StallWindow()
    assert window.admit(_LANDING[0], _T0) == ()
    assert window.due(_T0 + timedelta(seconds=59)) == ()
    assert window.due(_T0 + timedelta(seconds=60)) == (_LANDING[0],)


def test_three_sites_slow_inside_one_minute_are_one_stall() -> None:
    filed = _file_all(StallWindow(), _LANDING, gap=timedelta(seconds=10))

    assert [(s.slow_kind, s.path) for s in filed] == [
        ("db_stall", "/home/bootstrap"),
        ("db_stall", "/users/me"),
        ("db_stall", "/jobs/feed"),
    ]


def test_one_query_slow_many_times_is_still_that_query() -> None:
    hammered = tuple(_slow("app/repositories/job_provenance.py", "_count") for _ in range(5))

    filed = _file_all(StallWindow(), hammered, gap=timedelta(seconds=5))

    assert {s.slow_kind for s in filed} == {"slow_read"}
    assert len(filed) == 5


def test_two_sites_are_not_a_stall() -> None:
    filed = _file_all(StallWindow(), _LANDING[:2], gap=timedelta(seconds=5))

    assert [s.slow_kind for s in filed] == ["slow_read", "slow_read"]


def test_slow_reads_an_hour_apart_are_their_own_causes() -> None:
    filed = _file_all(StallWindow(), _LANDING, gap=timedelta(hours=1))

    assert [s.slow_kind for s in filed] == ["slow_read"] * 3


def test_every_other_sighting_passes_straight_through() -> None:
    window = StallWindow()
    dead = Sighting.dead_man(belt="skill_floor")
    queued = Sighting.slow_200(kind="capacity_queue", method="GET", path="/x")

    assert window.admit(dead, _T0) == (dead,)
    assert window.admit(queued, _T0) == (queued,)


def test_a_stall_is_one_blocked_notice_on_the_board() -> None:
    book = NoticeBook.testing()
    for sighting in _file_all(StallWindow(), _LANDING, gap=timedelta(seconds=10)):
        book.observe(sighting)

    rows = book.snapshot()
    assert [(r.cause_key, r.status, r.occurrence_count) for r in rows] == [
        ("slow_200:db_stall", "blocked", 3)
    ]


def test_the_web_writer_files_a_held_slow_read_after_its_window(monkeypatch) -> None:
    monkeypatch.setattr(wiring, "_TICK_SECONDS", 0.01)
    monkeypatch.setattr(
        wiring, "_stall_window", lambda: StallWindow(window=timedelta(milliseconds=50))
    )
    book = NoticeBook.testing()
    wiring.bind(book, background=True)
    try:
        wiring.observe(_LANDING[0])
        assert wiring.flush(timeout=5)
        assert book.snapshot() == ()

        deadline = time.monotonic() + 5
        while not book.snapshot() and time.monotonic() < deadline:
            time.sleep(0.01)

        assert [r.cause_key for r in book.snapshot()] == [
            "slow_200:slow_read:app/repositories/cv.py:latest_baseline"
        ]
    finally:
        wiring.unbind()
