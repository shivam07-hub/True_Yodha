from collections import defaultdict

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security.auth_rate_limit import install_auth_rate_limits
from app.security.error_handling import install_error_handling
from app.security.headers import install_security_headers


class _FakeRedis:
    def __init__(self) -> None:
        self.counts: defaultdict[str, int] = defaultdict(int)

    async def eval(
        self,
        _script: str,
        _key_count: int,
        key: str,
        window_seconds: int,
    ) -> list[int]:
        self.counts[key] += 1
        return [self.counts[key], window_seconds]


class _UnavailableRedis:
    async def eval(self, *_args: object) -> list[int]:
        raise ConnectionError("redis unavailable")


def _app(redis: _FakeRedis | _UnavailableRedis) -> FastAPI:
    test_app = FastAPI()
    install_auth_rate_limits(
        test_app,
        redis_provider=lambda: redis,
        production=True,
    )
    install_error_handling(test_app)
    install_security_headers(test_app)

    @test_app.post("/auth/login")
    def login() -> dict[str, bool]:
        return {"ok": True}

    @test_app.post("/auth/signup")
    def signup() -> dict[str, bool]:
        return {"ok": True}

    @test_app.post("/auth/magic-link-request")
    def magic_link() -> dict[str, bool]:
        return {"ok": True}

    return test_app


def test_login_allows_five_attempts_per_minute_then_returns_429() -> None:
    with TestClient(_app(_FakeRedis())) as client:
        responses = [
            client.post("/auth/login", headers={"x-forwarded-for": "203.0.113.7"})
            for _ in range(6)
        ]

    assert [response.status_code for response in responses] == [
        200,
        200,
        200,
        200,
        200,
        429,
    ]
    blocked = responses[-1]
    assert blocked.headers["retry-after"] == "60"
    assert blocked.headers["x-correlation-id"] == blocked.json()["correlation_id"]


def test_magic_link_recovery_allows_three_attempts_per_hour() -> None:
    with TestClient(_app(_FakeRedis())) as client:
        responses = [
            client.post(
                "/auth/magic-link-request",
                headers={"x-forwarded-for": "203.0.113.8"},
            )
            for _ in range(4)
        ]

    assert [response.status_code for response in responses] == [200, 200, 200, 429]
    assert responses[-1].headers["retry-after"] == "3600"


def test_signup_uses_the_five_per_minute_auth_limit() -> None:
    with TestClient(_app(_FakeRedis())) as client:
        responses = [
            client.post("/auth/signup", headers={"x-real-ip": "203.0.113.9"})
            for _ in range(6)
        ]

    assert [response.status_code for response in responses] == [
        200,
        200,
        200,
        200,
        200,
        429,
    ]


def test_production_auth_fails_closed_when_redis_is_unavailable() -> None:
    with TestClient(_app(_UnavailableRedis())) as client:
        response = client.post(
            "/auth/login",
            headers={"x-forwarded-for": "198.51.100.1"},
        )

    assert response.status_code == 503
    assert response.json()["detail"] == "Authentication is temporarily unavailable."
    assert response.headers["x-correlation-id"] == response.json()["correlation_id"]
    assert response.headers["x-content-type-options"] == "nosniff"


def test_forwarded_ip_uses_proxy_appended_address_not_spoofed_first_value() -> None:
    redis = _FakeRedis()
    with TestClient(_app(redis)) as client:
        for spoofed in range(6):
            response = client.post(
                "/auth/login",
                headers={
                    "x-forwarded-for": (
                        f"192.0.2.{spoofed + 1}, 198.51.100.22"
                    )
                },
            )

    assert response.status_code == 429
