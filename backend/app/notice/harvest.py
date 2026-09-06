"""Harvest Railway deaths and belt stalls for the daily closer."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from collections.abc import Callable
from typing import Any

from app.notice.types import CloseProof, Sighting

_logger = logging.getLogger("app.notice")

PROD_API = "mirror-backend-prod"
JOB_RUNNER = "True_Yodha"
_PROCESSES = (PROD_API, JOB_RUNNER)


def sightings_from_deployments(rows: list[dict[str, Any]], process: str) -> list[Sighting]:
    seen: set[str] = set()
    out: list[Sighting] = []
    for row in rows:
        kind = _death_kind(row, process)
        if kind is None:
            continue
        key = f"{process}:{kind}"
        if key in seen:
            continue
        seen.add(key)
        out.append(Sighting.process_death(process=process, death_kind=kind))
    return out


def flatten_deployments(payload: object) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("deployments", "data", "items"):
        nested = payload.get(key)
        if isinstance(nested, dict) and isinstance(nested.get("edges"), list):
            nodes: list[dict[str, Any]] = []
            for edge in nested["edges"]:
                if isinstance(edge, dict) and isinstance(edge.get("node"), dict):
                    nodes.append(edge["node"])
            return nodes
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
    if "status" in payload or "state" in payload:
        return [payload]
    return []


def harvest_railway(
    run: Callable[[list[str]], str] | None = None,
) -> list[Sighting]:
    runner = run or _railway
    if runner is _railway and (
        not os.environ.get("RAILWAY_TOKEN", "").strip() or shutil.which("railway") is None
    ):
        return []
    out: list[Sighting] = []
    for process in _PROCESSES:
        try:
            raw = runner(
                ["deployment", "list", "--service", process, "--limit", "20", "--json"]
            )
            payload = json.loads(raw) if raw.strip() else []
        except Exception:
            _logger.exception("metric notice.harvest_railway_failed process=%s", process)
            continue
        out.extend(sightings_from_deployments(flatten_deployments(payload), process))
    return out


def harvest_belts(
    *,
    skill_awaiting: int | None,
    verifier_state: str | None,
    sha: str,
    on_main: bool,
    alert_above: int = 100,
) -> tuple[list[Sighting], list[CloseProof]]:
    sightings: list[Sighting] = []
    proofs: list[CloseProof] = []
    if skill_awaiting is not None:
        if skill_awaiting >= alert_above:
            sightings.append(Sighting.dead_man(belt="skill_floor"))
        else:
            proofs.append(
                CloseProof(
                    cause_key="dead_man:skill_floor",
                    test_nodeid="harvest:skill_floor_recovered",
                    sha=sha,
                    on_main=on_main,
                )
            )
    if verifier_state in {"stalled", "degraded"}:
        sightings.append(Sighting.dead_man(belt="listing_verifier"))
    elif verifier_state == "ok":
        proofs.append(
            CloseProof(
                cause_key="dead_man:listing_verifier",
                test_nodeid="harvest:listing_verifier_ok",
                sha=sha,
                on_main=on_main,
            )
        )
    return sightings, proofs


def harvest_upload_stalls(has_spent_budget: bool) -> list[Sighting]:
    if not has_spent_budget:
        return []
    return [Sighting.upload_guarantee(break_kind="job_never_claimed")]


def _death_kind(row: dict[str, Any], process: str) -> str | None:
    status = str(row.get("status") or row.get("state") or "").upper()
    blob = json.dumps(row).lower()
    if status == "FAILED":
        return "failed_deploy"
    if status != "CRASHED":
        return None
    if "oom" in blob or "out of memory" in blob:
        return "oom"
    if process == JOB_RUNNER:
        return "runner_exit"
    return "crash"


def _railway(args: list[str]) -> str:
    result = subprocess.run(
        ["railway", *args],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"railway exit {result.returncode}")
    return result.stdout
