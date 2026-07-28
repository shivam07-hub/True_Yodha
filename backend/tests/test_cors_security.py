import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
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


def _preview_app() -> FastAPI:
    """The dev tier: exact origins PLUS the Vercel preview pattern."""
    test_app = FastAPI()
    install_cors(
        test_app,
        ["http://localhost:3000"],
        Settings(_env_file=None).preview_origin_regex,
    )

    @test_app.get("/resource")
    def resource() -> dict[str, bool]:
        return {"ok": True}

    return test_app


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/resource",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )


def test_preview_regex_admits_every_vercel_deployment_origin() -> None:
    # Vercel mints a new origin per deployment, so an exact allowlist would go
    # stale on every push to Develop — the 2026-07-27 dev outage.
    with TestClient(_preview_app()) as client:
        branch_alias = _preflight(
            client, "https://truemirror-git-develop-shivam07-hub.vercel.app"
        )
        deployment = _preflight(client, "https://truemirror-k3f9xq2ab-myro.vercel.app")
        exact = _preflight(client, "http://localhost:3000")

    assert branch_alias.status_code == 200
    assert deployment.status_code == 200
    assert exact.status_code == 200


def test_preview_regex_still_rejects_foreign_origins() -> None:
    with TestClient(_preview_app()) as client:
        rejected = [
            _preflight(client, origin).status_code
            for origin in (
                "https://evil.example",
                "https://truemirror.vercel.app.evil.example",
                "https://attacker-truemirror.vercel.app",
                "http://truemirror-preview.vercel.app",
            )
        ]

    assert rejected == [400, 400, 400, 400]


def test_unanchored_origin_regex_is_rejected() -> None:
    with pytest.raises(ValueError, match="anchored"):
        install_cors(FastAPI(), ["https://himyro.com"], r"https://.*\.vercel\.app")


def test_overly_broad_origin_regex_is_rejected() -> None:
    with pytest.raises(ValueError, match="too broad"):
        install_cors(FastAPI(), ["https://himyro.com"], r"^https://.*$")


def test_policy_requires_an_origin_or_a_regex() -> None:
    with pytest.raises(ValueError, match="At least one"):
        install_cors(FastAPI(), [])
