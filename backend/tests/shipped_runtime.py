"""The suite runs on the runtime that ships, or not at all.

Railway builds `backend/Dockerfile` (its `FROM python:X.Y`) and installs
`requirements.lock`, every package pinned and hashed; Backend CI does the same.
A venv on another Python or other library versions passes code that cannot boot
in production: b9d4785e was green on FastAPI 0.135 and crashed at import on the
pinned 0.110.3. conftest calls this before it imports `app`, so a wrong
environment hears this first.

`requirements.txt` is what we ask for; `requirements.lock` is what ships. The
lock must still satisfy the ask, or an edit to requirements.txt would ship
nothing while every test passed.
"""
from __future__ import annotations

import re
import sys
from importlib import metadata
from pathlib import Path

import pytest
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version

_BACKEND = Path(__file__).resolve().parents[1]


def _shipped_python() -> tuple[int, int]:
    match = re.search(r"^FROM python:(\d+)\.(\d+)", (_BACKEND / "Dockerfile").read_text(), re.M)
    assert match, "backend/Dockerfile names no python:X.Y base image"
    return int(match.group(1)), int(match.group(2))


def _requirements(name: str) -> list[Requirement]:
    lines = (_BACKEND / name).read_text().splitlines()
    specs = (line.split("#", 1)[0].rstrip(" \\").strip() for line in lines)
    return [Requirement(spec) for spec in specs if spec and not spec.startswith("--")]


def _relock_command() -> str:
    """The lock's own header names the command that rebuilt it."""
    header = (_BACKEND / "requirements.lock").read_text().splitlines()[:2]
    return header[1].lstrip("# ").strip()


def _locked() -> dict[str, str]:
    """Package → pinned version, for the lock lines whose markers hold here."""
    pins: dict[str, str] = {}
    for req in _requirements("requirements.lock"):
        if req.marker is None or req.marker.evaluate():
            (spec,) = req.specifier
            pins[canonicalize_name(req.name)] = spec.version
    return pins


def mismatches() -> list[str]:
    found: list[str] = []
    shipped = _shipped_python()
    if sys.version_info[:2] != shipped:
        found.append(f"python {sys.version_info[0]}.{sys.version_info[1]}, ships {shipped[0]}.{shipped[1]}")
    locked = _locked()
    for req in _requirements("requirements.txt"):
        pinned = locked.get(canonicalize_name(req.name))
        if pinned is None or not req.specifier.contains(pinned, prereleases=True):
            found.append(f"requirements.lock has {req.name} {pinned}, requirements.txt asks {req.specifier} — relock: {_relock_command()}")
    for name, pinned in sorted(locked.items()):
        try:
            installed = metadata.version(name)
        except metadata.PackageNotFoundError:
            found.append(f"{name} not installed, ships {pinned}")
            continue
        if Version(installed) != Version(pinned):
            found.append(f"{name} {installed}, ships {pinned}")
    return found


def refuse_off_the_shipped_runtime() -> None:
    found = mismatches()
    if found:
        pytest.exit(
            "Not the runtime that ships (backend/Dockerfile + requirements.lock):\n  "
            + "\n  ".join(found)
            + "\nRun backend/.venv/bin/pytest — setup in CONTRIBUTING.md.",
            returncode=4,
        )
