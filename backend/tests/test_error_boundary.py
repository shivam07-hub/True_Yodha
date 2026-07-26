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
