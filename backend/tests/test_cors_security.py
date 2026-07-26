import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security.cors import install_cors


def _app() -> FastAPI:
    test_app = FastAPI()
    install_cors(
        test_app,
        ["https://himyro.com", "https://www.himyro.com"],
    )

    @test_app.get("/resource")
    def resource() -> dict[str, bool]:
        return {"ok": True}

    return test_app


def test_preflight_allows_only_the_configured_frontend_origin() -> None:
    with TestClient(_app()) as client:
        allowed = client.options(
            "/resource",
            headers={
                "Origin": "https://himyro.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        rejected = client.options(
            "/resource",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://himyro.com"
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_browser_can_read_operational_error_headers() -> None:
    with TestClient(_app()) as client:
        response = client.get(
            "/resource",
            headers={"Origin": "https://www.himyro.com"},
        )

    exposed = response.headers["access-control-expose-headers"].lower()
    assert "x-correlation-id" in exposed
    assert "retry-after" in exposed


def test_wildcard_origin_is_rejected() -> None:
    with pytest.raises(ValueError, match="wildcard"):
        install_cors(FastAPI(), ["*"])
