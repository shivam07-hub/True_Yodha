from __future__ import annotations

import asyncio

import httpx
import pytest

from app.services.read_load_probe import (
    SCENARIOS,
    ProbeSample,
    assert_safe_target,
    evaluate_slo,
    render_routes,
    run_probe,
    summarize_samples,
)


def test_summarize_samples_reports_route_and_backend_percentiles() -> None:
    samples = [
        ProbeSample("/users/me", 200, 100.0, 80.0, None),
        ProbeSample("/users/me", 200, 200.0, 160.0, None),
        ProbeSample("/home/bootstrap", 200, 500.0, 450.0, None),
        ProbeSample("/home/bootstrap", 503, 800.0, 750.0, None),
    ]

    summary = summarize_samples(samples)

    assert summary["request_count"] == 4
    assert summary["success_count"] == 3
    assert summary["failure_count"] == 1
    assert summary["client_ms"]["p50"] == 200.0
    assert summary["backend_ms"]["p95"] == 750.0
    assert summary["routes"]["/users/me"]["failure_count"] == 0
    assert summary["routes"]["/home/bootstrap"]["failure_count"] == 1


def test_production_probe_requires_explicit_opt_in() -> None:
    with pytest.raises(ValueError, match="production"):
        assert_safe_target(
            "https://api.himyro.com",
            allow_production=False,
            users=2,
            waves=1,
            route_count=3,
        )

    assert_safe_target(
        "https://api.himyro.com",
        allow_production=True,
        users=2,
        waves=1,
        route_count=3,
    )


def test_probe_refuses_unbounded_request_volume() -> None:
    with pytest.raises(ValueError, match="500 requests"):
        assert_safe_target(
            "http://localhost:8000",
            allow_production=False,
            users=50,
            waves=10,
            route_count=2,
        )

    with pytest.raises(ValueError, match="positive"):
        assert_safe_target(
            "http://localhost:8000",
            allow_production=False,
            users=0,
            waves=1,
            route_count=2,
        )


def test_company_scenario_requires_and_escapes_company_name() -> None:
    with pytest.raises(ValueError, match="company"):
        render_routes(SCENARIOS["company_page"], {})

    routes = render_routes(
        SCENARIOS["company_page"],
        {"company": "Bain & Company"},
    )

    assert routes == (
        "/companies/Bain%20%26%20Company",
        "/companies/Bain%20%26%20Company/jobs?page=1&page_size=20",
    )


def test_run_probe_executes_each_read_for_every_virtual_user() -> None:
    seen: list[tuple[str, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, request.headers.get("authorization")))
        return httpx.Response(200, headers={"X-Process-Time": "12.5"})

    async def run() -> list[ProbeSample]:
        async with httpx.AsyncClient(
            base_url="http://test",
            transport=httpx.MockTransport(handler),
        ) as client:
            return await run_probe(
                client,
                routes=("/users/me", "/home/bootstrap"),
                users=2,
                waves=1,
                token="secret-token",
                think_time_seconds=0,
            )

    samples = asyncio.run(run())

    assert len(samples) == 4
    assert {sample.backend_ms for sample in samples} == {12.5}
    assert seen.count(("/users/me", "Bearer secret-token")) == 2
    assert seen.count(("/home/bootstrap", "Bearer secret-token")) == 2


def test_evaluate_slo_requires_fast_successful_requests_and_server_timing() -> None:
    summary = summarize_samples(
        [
            ProbeSample("/users/me", 200, 300.0, 250.0, None),
            ProbeSample("/users/me", 200, 400.0, 350.0, None),
        ]
    )

    result = evaluate_slo(
        summary,
        client_p95_ms=1500,
        backend_p95_ms=1000,
        max_failure_rate=0,
    )

    assert result["passed"] is True
    assert result["failures"] == []
