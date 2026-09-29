from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.security.error_handling import install_error_handling
from app.services.read_capacity import ReadCapacityExceeded


def test_unhandled_error_is_generic_and_has_a_correlation_id() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/boom")
    def boom() -> None:
        raise RuntimeError(
            'SELECT password FROM users; File "/app/internal.py", line 42'
        )

    with TestClient(test_app, raise_server_exceptions=False) as client:
        response = client.get("/boom")

    assert response.status_code == 500
    assert response.json()["detail"] == "Something went wrong. Please try again."
    correlation_id = response.json()["correlation_id"]
    assert correlation_id
    assert response.headers["x-correlation-id"] == correlation_id
    assert "SELECT" not in response.text
    assert "/app/internal.py" not in response.text
    assert "Traceback" not in response.text


def test_explicit_server_error_detail_is_never_exposed() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/failed-query")
    def failed_query() -> None:
        raise HTTPException(
            status_code=500,
            detail='SELECT email FROM users; File "/srv/api/repository.py", line 8',
        )

    with TestClient(test_app, raise_server_exceptions=False) as client:
        response = client.get("/failed-query")

    assert response.status_code == 500
    assert response.json()["detail"] == "Something went wrong. Please try again."
    assert response.headers["x-correlation-id"] == response.json()["correlation_id"]
    assert "SELECT" not in response.text
    assert "/srv/api/repository.py" not in response.text


class _Payload(BaseModel):
    count: int


def test_request_validation_details_are_not_exposed() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.post("/validate")
    def validate(_payload: _Payload) -> dict[str, bool]:
        return {"ok": True}

    with TestClient(test_app) as client:
        response = client.post("/validate", json={"count": "not-an-integer"})

    assert response.status_code == 422
    assert response.json()["detail"] == "Request validation failed."
    assert response.headers["x-correlation-id"] == response.json()["correlation_id"]
    assert "not-an-integer" not in response.text
    assert "integer_parsing" not in response.text


def test_a_rejected_request_logs_which_field_but_never_its_value(caplog) -> None:
    """The client is told nothing; the log must say WHICH field.

    A 422 on `PUT /onboarding/target` read only "422" in the Railway log and
    `reason=unknown` in telemetry, so a fourth city being rejected by a stale
    cap of 3 looked like nothing at all. The location and the rule are enough
    to find it; the value is the user's and stays out.
    """
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.post("/validate")
    def validate(_payload: _Payload) -> dict[str, bool]:
        return {"ok": True}

    with caplog.at_level("WARNING"), TestClient(test_app) as client:
        client.post("/validate", json={"count": "not-an-integer"})

    lines = [r.getMessage() for r in caplog.records if "request.validation_failed" in r.getMessage()]
    assert lines == ["metric request.validation_failed method=POST path=/validate fields=body.count:int_parsing"]
    assert "not-an-integer" not in caplog.text


def test_safe_domain_client_error_keeps_actionable_detail() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/missing")
    def missing() -> None:
        raise HTTPException(status_code=404, detail="Job not found.")

    with TestClient(test_app) as client:
        response = client.get("/missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found."
    assert response.headers["x-correlation-id"] == response.json()["correlation_id"]


def test_internal_detail_in_client_error_is_replaced() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/unsafe")
    def unsafe() -> None:
        raise HTTPException(
            status_code=400,
            detail='File "/Users/dev/app.py", line 12: ValueError: invalid row',
        )

    with TestClient(test_app) as client:
        response = client.get("/unsafe")

    assert response.status_code == 400
    assert response.json()["detail"] == "The request could not be completed."
    assert "/Users/dev/app.py" not in response.text
    assert "ValueError" not in response.text


def test_success_response_has_correlation_header() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    with TestClient(test_app) as client:
        response = client.get("/ok")

    assert response.status_code == 200
    assert response.headers["x-correlation-id"]


def test_read_capacity_returns_a_retryable_safe_error() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/busy")
    def busy() -> None:
        raise ReadCapacityExceeded()

    with TestClient(test_app, raise_server_exceptions=False) as client:
        response = client.get("/busy")

    assert response.status_code == 503
    assert response.json()["detail"] == "We are refreshing your latest data. Please try again in a moment."
    assert response.headers["retry-after"] == "1"
    assert response.headers["x-correlation-id"]


def test_framework_404_uses_the_same_error_envelope() -> None:
    test_app = FastAPI()
    install_error_handling(test_app)

    with TestClient(test_app) as client:
        response = client.get("/route-does-not-exist")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not Found"
    assert response.headers["x-correlation-id"] == response.json()["correlation_id"]


def test_upstream_read_timeout_is_a_503_not_a_500() -> None:
    """A Supabase read that outruns the PostgREST ceiling is a known failure.

    Before this handler existed, tripping `_POSTGREST_TIMEOUT_SECONDS` fell
    through to the unhandled boundary: a 500 plus a full httpcore traceback,
    which is why the `/companies/*` timeouts read as a transport crash in prod.
    """
    import httpx

    test_app = FastAPI()
    install_error_handling(test_app)

    @test_app.get("/slow")
    def slow() -> None:
        raise httpx.ReadTimeout("timed out", request=httpx.Request("GET", "https://db.test"))

    with TestClient(test_app, raise_server_exceptions=False) as client:
        response = client.get("/slow")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "2"
    assert response.json()["detail"] == "That took longer than expected. Please try again."
    assert "Traceback" not in response.text
    assert "httpx" not in response.text


def test_unhandled_error_opens_a_notice() -> None:
    from app.notice import NoticeBook, bind, unbind

    book = NoticeBook.testing()
    bind(book)
    try:
        test_app = FastAPI()
        install_error_handling(test_app)

        @test_app.get("/boom")
        def boom() -> None:
            raise RuntimeError("notice-test")

        with TestClient(test_app, raise_server_exceptions=False) as client:
            assert client.get("/boom").status_code == 500

        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].status == "open"
        assert rows[0].cause_class == "unhandled_500"
        assert "/boom" not in rows[0].cause_key
    finally:
        unbind()


def test_read_capacity_opens_a_blocked_notice() -> None:
    from app.notice import NoticeBook, bind, unbind

    book = NoticeBook.testing()
    bind(book)
    try:
        test_app = FastAPI()
        install_error_handling(test_app)

        @test_app.get("/busy")
        def busy() -> None:
            raise ReadCapacityExceeded()

        with TestClient(test_app, raise_server_exceptions=False) as client:
            assert client.get("/busy").status_code == 503

        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].status == "blocked"
        assert rows[0].cause_key == "capacity_503:read_capacity"
    finally:
        unbind()


# A database statement timeout is the DB-side twin of an httpx read timeout.
# PostgREST raises it as a plain APIError (57014), so it reached the unhandled
# boundary and opened an `unhandled_500` Notice keyed to whichever call site it
# hit: `baseline_state`, `snapshot_refresh`, `safe_read`, `fetch_all_rows` —
# four one-offs inside the 2026-09-12/13 capacity storm, none reproducible now.


def _statement_timeout():
    from postgrest.exceptions import APIError

    return APIError({
        "code": "57014", "details": None, "hint": None,
        "message": "canceling statement due to statement timeout",
    })


def test_a_statement_timeout_is_a_503_and_a_blocked_capacity_notice() -> None:
    from app.notice import NoticeBook, bind, unbind

    book = NoticeBook.testing()
    bind(book)
    try:
        test_app = FastAPI()
        install_error_handling(test_app)

        @test_app.get("/heavy")
        def heavy() -> None:
            raise _statement_timeout()

        with TestClient(test_app, raise_server_exceptions=False) as client:
            response = client.get("/heavy")

        assert response.status_code == 503
        assert response.headers["retry-after"] == "2"
        assert "57014" not in response.text
        rows = book.snapshot()
        assert [(r.cause_class, r.status) for r in rows] == [("capacity_503", "blocked")]
        assert rows[0].cause_key == "capacity_503:db.statement_timeout"
    finally:
        unbind()


def test_any_other_postgrest_error_is_still_an_unhandled_500() -> None:
    from postgrest.exceptions import APIError

    from app.notice import NoticeBook, bind, unbind

    book = NoticeBook.testing()
    bind(book)
    try:
        test_app = FastAPI()
        install_error_handling(test_app)

        @test_app.get("/fk")
        def fk() -> None:
            raise APIError({"code": "23503", "details": None, "hint": None, "message": "fk"})

        with TestClient(test_app, raise_server_exceptions=False) as client:
            assert client.get("/fk").status_code == 500

        assert [r.cause_class for r in book.snapshot()] == ["unhandled_500"]
    finally:
        unbind()
