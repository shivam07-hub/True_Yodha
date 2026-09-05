"""cause_key = class + fingerprint. Route is never in the key."""

from __future__ import annotations

import re
import traceback
from pathlib import Path

from app.notice.types import CloseProof, Sighting

_TOKEN = re.compile(r"^[A-Za-z0-9_./-]+$")

_BREAK_KINDS = frozenset({"object_no_job", "job_never_claimed"})
_SLOW_KINDS = frozenset({"reads_over_budget", "capacity_queue"})
_DEATH_KINDS = frozenset({"oom", "crash", "failed_deploy", "runner_exit"})
_BELTS = frozenset({"skill_floor", "listing_verifier"})


def cause_key_for(sighting: Sighting) -> str:
    if sighting.cause_class == "unhandled_500":
        if sighting.exc is None:
            return "unhandled_500:unknown:unknown:unknown"
        file, function = app_frame(sighting.exc)
        return f"unhandled_500:{type(sighting.exc).__name__}:{file}:{function}"
    if sighting.cause_class == "capacity_503":
        return f"capacity_503:{_token(sighting.limiter)}"
    if sighting.cause_class == "process_death":
        death = _token(sighting.death_kind)
        if death not in _DEATH_KINDS:
            death = "crash"
        return f"process_death:{_token(sighting.process)}:{death}"
    if sighting.cause_class == "upload_guarantee":
        kind = _token(sighting.break_kind)
        if kind not in _BREAK_KINDS:
            kind = "job_never_claimed"
        return f"upload_guarantee:{kind}"
    if sighting.cause_class == "work_lane":
        return (
            f"work_lane:{_token(sighting.job_type)}:{_token(sighting.terminal_class)}"
        )
    if sighting.cause_class == "dead_man":
        belt = _token(sighting.belt)
        if belt not in _BELTS:
            belt = "unknown"
        return f"dead_man:{belt}"
    if sighting.cause_class == "slow_200":
        kind = _token(sighting.slow_kind)
        if kind not in _SLOW_KINDS:
            kind = "capacity_queue"
        return f"slow_200:{kind}"
    return f"{sighting.cause_class}:unspecified"


def cause_key_for_proof(proof: CloseProof) -> str:
    if proof.cause_key:
        return proof.cause_key
    return f"unhandled_500:{proof.exception_type}:{proof.file}:{proof.function}"


def app_frame(exc: BaseException) -> tuple[str, str]:
    frames = traceback.extract_tb(exc.__traceback__) or []
    for frame in reversed(frames):
        rel = _app_relative(frame.filename)
        if rel is not None:
            return rel, frame.name
    if frames:
        last = frames[-1]
        return Path(last.filename).name, last.name
    return "unknown", "unknown"


def _token(value: str | None) -> str:
    text = (value or "").strip()
    if not text or ":" in text or not _TOKEN.match(text):
        return "unknown"
    return text


def _app_relative(filename: str) -> str | None:
    parts = filename.replace("\\", "/").split("/")
    try:
        index = len(parts) - 1 - parts[::-1].index("app")
    except ValueError:
        return None
    return "/".join(parts[index:])
