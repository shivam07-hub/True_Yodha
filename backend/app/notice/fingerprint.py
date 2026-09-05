"""cause_key = class + fingerprint. Route is never in the key."""

from __future__ import annotations

import traceback
from pathlib import Path

from app.notice.types import CloseProof, Sighting


def cause_key_for(sighting: Sighting) -> str:
    if sighting.cause_class == "unhandled_500":
        if sighting.exc is None:
            return "unhandled_500:unknown:unknown:unknown"
        file, function = app_frame(sighting.exc)
        return f"unhandled_500:{type(sighting.exc).__name__}:{file}:{function}"
    if sighting.cause_class == "capacity_503":
        limiter = sighting.limiter or "unknown"
        return f"capacity_503:{limiter}"
    if sighting.cause_class == "process_death":
        return f"process_death:{sighting.process or 'unknown'}:{sighting.death_kind or 'unknown'}"
    return f"{sighting.cause_class}:unspecified"


def cause_key_for_proof(proof: CloseProof) -> str:
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


def _app_relative(filename: str) -> str | None:
    parts = filename.replace("\\", "/").split("/")
    try:
        index = len(parts) - 1 - parts[::-1].index("app")
    except ValueError:
        return None
    return "/".join(parts[index:])
