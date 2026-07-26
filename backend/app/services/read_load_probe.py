"""Safe, read-only burst probes against Myro API journeys."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import math
import time
from typing import Any
from urllib.parse import quote, urlparse

import httpx

_PRODUCTION_HOSTS = {
    "api.himyro.com",
    "mirror-backend-prod-production.up.railway.app",
}
_MAX_REQUESTS = 500


@dataclass(frozen=True)
class Scenario:
    name: str
    routes: tuple[str, ...]
    requires_auth: bool = True
    required_variables: tuple[str, ...] = ()


SCENARIOS = {
    "login_bootstrap": Scenario(
        name="login_bootstrap",
        routes=(
            "/users/me",
            "/home/bootstrap",
            "/onboarding/checklist",
        ),
    ),
    "jobs_browse": Scenario(
        name="jobs_browse",
        routes=(
            "/jobs/feed?page=1&page_size=20",
            "/jobs/matches",
            "/jobs/applications",
            "/notifications/unread-count",
        ),
    ),
    "cv_library": Scenario(
        name="cv_library",
        routes=(
            "/cv/versions",
            "/cv/evidence",
            "/scores/map",
        ),
    ),
    "company_page": Scenario(
        name="company_page",
        routes=(
            "/companies/{company}",
            "/companies/{company}/jobs?page=1&page_size=20",
        ),
        required_variables=("company",),
    ),
    "analytics_isolated": Scenario(
        name="analytics_isolated",
        routes=(
            "/jobs/analytics",
            "/jobs/analytics/skill-heatmap",
        ),
    ),
}


@dataclass(frozen=True)
class ProbeSample:
    route: str
    status_code: int | None
    client_ms: float
    backend_ms: float | None
    error: str | None

    @property
    def succeeded(self) -> bool:
        return (
            self.error is None
            and self.status_code is not None
            and 200 <= self.status_code < 400
        )


def render_routes(
    scenario: Scenario,
    variables: dict[str, str],
) -> tuple[str, ...]:
    missing = [
        variable
        for variable in scenario.required_variables
        if not variables.get(variable)
    ]
    if missing:
        raise ValueError(
            f"{scenario.name} requires variables: {', '.join(missing)}"
        )
    escaped = {key: quote(value, safe="") for key, value in variables.items()}
    return tuple(route.format_map(escaped) for route in scenario.routes)


def assert_safe_target(
    base_url: str,
    *,
    allow_production: bool,
    users: int,
    waves: int,
    route_count: int,
) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("base URL must be an absolute http(s) URL")
    if users <= 0 or waves <= 0 or route_count <= 0:
        raise ValueError("users, waves, and route count must be positive")
    if parsed.hostname in _PRODUCTION_HOSTS and not allow_production:
        raise ValueError("production probes require --allow-production")
    request_count = users * waves * route_count
    if request_count > _MAX_REQUESTS:
        raise ValueError(
            f"probe would exceed the {_MAX_REQUESTS} requests safety limit"
        )


async def _probe_route(
    client: httpx.AsyncClient,
    route: str,
    *,
    token: str | None,
) -> ProbeSample:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    started = time.perf_counter()
    try:
        response = await client.get(route, headers=headers)
        elapsed_ms = (time.perf_counter() - started) * 1000
        backend_ms: float | None = None
        process_time = response.headers.get("X-Process-Time")
        if process_time:
            try:
                backend_ms = float(process_time)
            except ValueError:
                pass
        return ProbeSample(
            route=route,
            status_code=response.status_code,
            client_ms=round(elapsed_ms, 1),
            backend_ms=backend_ms,
            error=None,
        )
    except httpx.HTTPError as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return ProbeSample(
            route=route,
            status_code=None,
            client_ms=round(elapsed_ms, 1),
            backend_ms=None,
            error=exc.__class__.__name__,
        )


async def run_probe(
    client: httpx.AsyncClient,
    *,
    routes: tuple[str, ...],
    users: int,
    waves: int,
    token: str | None,
    think_time_seconds: float,
) -> list[ProbeSample]:
    """Run each virtual user's route set as one concurrent browsing burst."""
    samples: list[ProbeSample] = []
    for wave in range(waves):
        burst = [
            _probe_route(client, route, token=token)
            for _user in range(users)
            for route in routes
        ]
        samples.extend(await asyncio.gather(*burst))
        if think_time_seconds > 0 and wave < waves - 1:
            await asyncio.sleep(think_time_seconds)
    return samples


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(percentile * len(ordered)) - 1)
    return round(ordered[index], 1)


def _latency_summary(values: list[float]) -> dict[str, float | int | None]:
    return {
        "count": len(values),
        "p50": _percentile(values, 0.50),
        "p95": _percentile(values, 0.95),
        "p99": _percentile(values, 0.99),
        "max": round(max(values), 1) if values else None,
    }


def summarize_samples(samples: list[ProbeSample]) -> dict[str, Any]:
    """Aggregate browser-observed and backend-reported latency separately."""

    def summarize_group(group: list[ProbeSample]) -> dict[str, Any]:
        return {
            "request_count": len(group),
            "success_count": sum(sample.succeeded for sample in group),
            "failure_count": sum(not sample.succeeded for sample in group),
            "client_ms": _latency_summary(
                [sample.client_ms for sample in group]
            ),
            "backend_ms": _latency_summary(
                [
                    sample.backend_ms
                    for sample in group
                    if sample.backend_ms is not None
                ]
            ),
        }

    summary = summarize_group(samples)
    routes: dict[str, Any] = {}
    for route in dict.fromkeys(sample.route for sample in samples):
        routes[route] = summarize_group(
            [sample for sample in samples if sample.route == route]
        )
    summary["routes"] = routes
    return summary


def evaluate_slo(
    summary: dict[str, Any],
    *,
    client_p95_ms: float,
    backend_p95_ms: float,
    max_failure_rate: float,
) -> dict[str, Any]:
    request_count = int(summary.get("request_count") or 0)
    failure_count = int(summary.get("failure_count") or 0)
    failure_rate = failure_count / request_count if request_count else 1.0
    observed_client_p95 = summary.get("client_ms", {}).get("p95")
    observed_backend_p95 = summary.get("backend_ms", {}).get("p95")

    failures: list[str] = []
    if observed_client_p95 is None or observed_client_p95 > client_p95_ms:
        failures.append("client_p95")
    if observed_backend_p95 is None or observed_backend_p95 > backend_p95_ms:
        failures.append("backend_p95")
    if failure_rate > max_failure_rate:
        failures.append("failure_rate")

    return {
        "passed": not failures,
        "failures": failures,
        "targets": {
            "client_p95_ms": client_p95_ms,
            "backend_p95_ms": backend_p95_ms,
            "max_failure_rate": max_failure_rate,
        },
        "observed": {
            "client_p95_ms": observed_client_p95,
            "backend_p95_ms": observed_backend_p95,
            "failure_rate": round(failure_rate, 4),
        },
    }
