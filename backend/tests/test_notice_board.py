"""Notice Module — tests at the Interface (CONTEXT.md)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.notice.board import NoticeBook
from app.notice.clock import FrozenClock
from app.notice.memory import MemoryNoticeStore
from app.notice.types import CloseProof, Sighting


def _alpha() -> None:
    raise RuntimeError("notice-test")


def _beta() -> None:
    raise RuntimeError("notice-test")


def _exc(raise_fn: Any) -> RuntimeError:
    try:
        raise_fn()
    except RuntimeError as exc:
        return exc
    raise AssertionError("unreachable")


def test_route_is_evidence_not_identity() -> None:
    book = NoticeBook.testing()
    exc = _exc(_alpha)
    book.observe(
        Sighting.unhandled_500(
            exc=exc, correlation_id="a", method="GET", path="/users/me"
        )
    )
    book.observe(
        Sighting.unhandled_500(
            exc=exc, correlation_id="b", method="GET", path="/jobs/feed"
        )
    )
    rows = book.snapshot()
    assert len(rows) == 1
    assert rows[0].occurrence_count == 2
    assert "/users/me" not in rows[0].cause_key
    assert "/jobs/feed" not in rows[0].cause_key
    assert rows[0].last_path == "/jobs/feed"
    assert rows[0].status == "open"


def test_different_functions_are_different_causes() -> None:
    book = NoticeBook.testing()
    book.observe(
        Sighting.unhandled_500(
            exc=_exc(_alpha), correlation_id="a", method="GET", path="/x"
        )
    )
    book.observe(
        Sighting.unhandled_500(
            exc=_exc(_beta), correlation_id="b", method="GET", path="/x"
        )
    )
    keys = {row.cause_key for row in book.snapshot()}
    assert len(keys) == 2


def test_capacity_503_opens_blocked() -> None:
    book = NoticeBook.testing()
    book.observe(
        Sighting.read_capacity(
            correlation_id="c", method="GET", path="/jobs/feed"
        )
    )
    rows = book.snapshot()
    assert len(rows) == 1
    assert rows[0].status == "blocked"
    assert rows[0].cause_key == "capacity_503:read_capacity"
    assert "/jobs/feed" not in rows[0].cause_key


def test_timeout_is_a_different_cause_than_read_capacity() -> None:
    book = NoticeBook.testing()
    book.observe(Sighting.read_capacity(correlation_id="c", method="GET", path="/a"))
    book.observe(
        Sighting.upstream_timeout(correlation_id="d", method="GET", path="/b")
    )
    keys = {row.cause_key for row in book.snapshot()}
    assert keys == {
        "capacity_503:read_capacity",
        "capacity_503:upstream.read_timeout",
    }


def test_reopen_after_close_is_failed_close() -> None:
    book = NoticeBook.testing()
    exc = _exc(_alpha)
    book.observe(
        Sighting.unhandled_500(
            exc=exc, correlation_id="a", method="GET", path="/x"
        )
    )
    row = book.snapshot()[0]
    digest = book.settle(
        [
            CloseProof(
                exception_type="RuntimeError",
                file=_file_of(row.cause_key),
                function=_alpha.__name__,
                test_nodeid="tests/test_notice_board.py::test_reopen",
                sha="abc123",
                on_main=True,
            )
        ]
    )
    assert row.cause_key in digest.closed_this_run
    assert book.snapshot()[0].status == "closed"

    book.observe(
        Sighting.unhandled_500(
            exc=exc, correlation_id="b", method="GET", path="/x"
        )
    )
    assert book.snapshot()[0].status == "failed-close"
    assert book.snapshot()[0].occurrence_count == 2


def test_proof_only_on_develop_is_open_on_prod() -> None:
    book = NoticeBook.testing()
    exc = _exc(_alpha)
    book.observe(
        Sighting.unhandled_500(
            exc=exc, correlation_id="a", method="GET", path="/x"
        )
    )
    row = book.snapshot()[0]
    book.settle(
        [
            CloseProof(
                exception_type="RuntimeError",
                file=_file_of(row.cause_key),
                function=_alpha.__name__,
                test_nodeid="tests/test_notice_board.py::test_develop",
                sha="def456",
                on_main=False,
            )
        ]
    )
    assert book.snapshot()[0].status == "open-on-prod"


def test_settle_does_not_close_blocked_capacity() -> None:
    book = NoticeBook.testing()
    book.observe(Sighting.read_capacity(correlation_id="c", method="GET", path="/a"))
    digest = book.settle(
        [
            CloseProof(
                exception_type="ReadCapacityExceeded",
                file="app/services/read_capacity.py",
                function="claim",
                test_nodeid="x",
                sha="abc",
                on_main=True,
            )
        ]
    )
    assert digest.closed_this_run == ()
    assert book.snapshot()[0].status == "blocked"


def test_process_death_oom_opens_blocked() -> None:
    book = NoticeBook.testing()
    book.observe(Sighting.process_death(process="mirror-backend-prod", death_kind="oom"))
    row = book.snapshot()[0]
    assert row.status == "blocked"
    assert row.cause_key == "process_death:mirror-backend-prod:oom"


def test_slow_200_is_kind_not_route() -> None:
    book = NoticeBook.testing()
    book.observe(
        Sighting.slow_200(kind="capacity_queue", method="GET", path="/users/me")
    )
    book.observe(
        Sighting.slow_200(kind="reads_over_budget", method="GET", path="/jobs/feed")
    )
    rows = {row.cause_key: row for row in book.snapshot()}
    assert set(rows) == {
        "slow_200:capacity_queue",
        "slow_200:reads_over_budget",
    }
    assert rows["slow_200:capacity_queue"].status == "blocked"
    assert rows["slow_200:reads_over_budget"].status == "open"
    assert "/users/me" not in rows["slow_200:capacity_queue"].cause_key
    assert rows["slow_200:capacity_queue"].last_path == "/users/me"


def test_upload_and_work_lane_and_dead_man_identity() -> None:
    book = NoticeBook.testing()
    book.observe(Sighting.upload_guarantee(break_kind="object_no_job"))
    book.observe(Sighting.upload_guarantee(break_kind="job_never_claimed"))
    book.observe(
        Sighting.work_lane(job_type="cv_upload_analysis", terminal_class="RuntimeError")
    )
    book.observe(Sighting.dead_man(belt="skill_floor"))
    keys = {row.cause_key for row in book.snapshot()}
    assert keys == {
        "upload_guarantee:object_no_job",
        "upload_guarantee:job_never_claimed",
        "work_lane:cv_upload_analysis:RuntimeError",
        "dead_man:skill_floor",
    }


def test_settle_closes_dead_man_by_cause_key() -> None:
    book = NoticeBook.testing()
    book.observe(Sighting.dead_man(belt="listing_verifier"))
    digest = book.settle(
        [
            CloseProof(
                cause_key="dead_man:listing_verifier",
                test_nodeid="harvest:listing_verifier_ok",
                sha="abc",
                on_main=True,
            )
        ]
    )
    assert digest.closed_this_run == ("dead_man:listing_verifier",)
    assert book.snapshot()[0].status == "closed"


def test_observe_never_raises_when_store_is_down() -> None:
    book = NoticeBook(
        store=_BoomStore(),
        clock=FrozenClock(datetime(2026, 9, 6, tzinfo=timezone.utc)),
        persist=True,
    )
    book.observe(Sighting.read_capacity(correlation_id="c", method="GET", path="/a"))


def test_observe_is_noop_when_persist_is_off() -> None:
    book = NoticeBook(
        store=MemoryNoticeStore(),
        clock=FrozenClock(datetime(2026, 9, 6, tzinfo=timezone.utc)),
        persist=False,
    )
    book.observe(Sighting.read_capacity(correlation_id="c", method="GET", path="/a"))
    assert book.snapshot() == ()


def _file_of(cause_key: str) -> str:
    # unhandled_500:RuntimeError:{file}:{function}
    parts = cause_key.split(":")
    return parts[2]


class _BoomStore:
    def get(self, cause_key: str) -> None:
        raise RuntimeError("store down")

    def put(self, row: object) -> None:
        raise RuntimeError("store down")

    def list_all(self) -> tuple[()]:
        raise RuntimeError("store down")

    def list_not_closed(self) -> tuple[()]:
        raise RuntimeError("store down")


def test_notices_migration_is_service_role_only() -> None:
    from pathlib import Path

    path = Path(__file__).parents[2] / "database" / "migrations" / "20260906_notices.sql"
    sql = path.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS notices" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql
    assert "PRIMARY KEY" in sql
    assert "cause_key" in sql
