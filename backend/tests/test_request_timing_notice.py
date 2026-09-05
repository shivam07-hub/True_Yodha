"""Slow 2xx timing opens a Notice by kind, never by route."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.notice import NoticeBook, bind, unbind
from app.request_timing import RequestTimingMiddleware
from app.services import read_budget


def test_slow_200_over_budget_key_is_not_the_path() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/users/me")
    def me() -> dict[str, bool]:
        for _ in range(read_budget.READ_BUDGET_PER_REQUEST + 1):
            read_budget.record_read()
        return {"ok": True}

    try:
        with TestClient(app) as client:
            assert client.get("/users/me").status_code == 200
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "slow_200:reads_over_budget"
        assert "/users/me" not in rows[0].cause_key
        assert rows[0].last_path == "/users/me"
        assert rows[0].status == "open"
    finally:
        unbind()


def test_slow_200_inside_budget_is_blocked_queue_victim() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/users/me")
    def me() -> dict[str, bool]:
        return {"ok": True}

    try:
        with TestClient(app) as client:
            assert client.get("/users/me").status_code == 200
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "slow_200:capacity_queue"
        assert rows[0].status == "blocked"
    finally:
        unbind()


def test_slow_500_does_not_open_a_slow_200() -> None:
    book = NoticeBook.testing()
    bind(book)
    app = FastAPI()
    app.add_middleware(RequestTimingMiddleware, slow_ms=0)

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("no")

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.get("/boom").status_code == 500
        assert book.snapshot() == ()
    finally:
        unbind()
