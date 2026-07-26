"""CLI for the read-only Myro API burst probe."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path

import httpx

from app.services.read_load_probe import (
    SCENARIOS,
    assert_safe_target,
    evaluate_slo,
    render_routes,
    run_probe,
    summarize_samples,
)


def _variables(items: list[str]) -> dict[str, str]:
    variables: dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"scenario variable must be KEY=VALUE: {item}")
        key, value = item.split("=", 1)
        if not key or not value:
            raise ValueError(f"scenario variable must be KEY=VALUE: {item}")
        variables[key] = value
    return variables


def _write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


async def _execute(args: argparse.Namespace) -> dict:
    scenario = SCENARIOS[args.scenario]
    routes = render_routes(scenario, _variables(args.var))
    assert_safe_target(
        args.base_url,
        allow_production=args.allow_production,
        users=args.users,
        waves=args.waves,
        route_count=len(routes),
    )
    token = os.environ.get(args.token_env)
    if scenario.requires_auth and not token:
        raise ValueError(
            f"{scenario.name} requires an auth token in {args.token_env}"
        )

    limits = httpx.Limits(
        max_connections=args.users * len(routes),
        max_keepalive_connections=args.users * len(routes),
    )
    async with httpx.AsyncClient(
        base_url=args.base_url.rstrip("/"),
        timeout=args.timeout_seconds,
        limits=limits,
        follow_redirects=False,
    ) as client:
        samples = await run_probe(
            client,
            routes=routes,
            users=args.users,
            waves=args.waves,
            token=token,
            think_time_seconds=args.think_time_seconds,
        )

    summary = summarize_samples(samples)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenario": scenario.name,
        "base_url": args.base_url,
        "users": args.users,
        "waves": args.waves,
        "routes": list(routes),
        "summary": summary,
        "slo": evaluate_slo(
            summary,
            client_p95_ms=args.client_p95_ms,
            backend_p95_ms=args.backend_p95_ms,
            max_failure_rate=args.max_failure_rate,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), required=True)
    parser.add_argument("--users", type=int, default=2)
    parser.add_argument("--waves", type=int, default=3)
    parser.add_argument("--think-time-seconds", type=float, default=1.0)
    parser.add_argument("--timeout-seconds", type=float, default=30.0)
    parser.add_argument("--var", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--token-env", default="MYRO_LOAD_AUTH_TOKEN")
    parser.add_argument("--allow-production", action="store_true")
    parser.add_argument("--client-p95-ms", type=float, default=2000.0)
    parser.add_argument("--backend-p95-ms", type=float, default=1000.0)
    parser.add_argument("--max-failure-rate", type=float, default=0.0)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        report = asyncio.run(_execute(args))
    except ValueError as exc:
        parser.error(str(exc))

    _write_report(args.output, report)
    print(
        f"Wrote {report['summary']['request_count']} samples to {args.output}; "
        f"SLO passed={report['slo']['passed']}."
    )
    if not report["slo"]["passed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
