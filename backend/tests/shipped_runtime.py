"""The suite runs on the runtime that ships, or not at all.

Railway builds `backend/Dockerfile` (its `FROM python:X.Y`) and installs
`requirements.txt`; Backend CI does the same. A venv on another Python or other
library versions passes code that cannot boot in production: b9d4785e was green
on FastAPI 0.135 and crashed at import on the pinned 0.110.3. conftest calls
this before it imports `app`, so a wrong environment hears this first.
"""
from __future__ import annotations

import re
import sys
from importlib import metadata
from pathlib import Path

import pytest
from packaging.requirements import Requirement

_BACKEND = Path(__file__).resolve().parents[1]


def _shipped_python() -> tuple[int, int]:
    match = re.search(r"^FROM python:(\d+)\.(\d+)", (_BACKEND / "Dockerfile").read_text(), re.M)
    assert match, "backend/Dockerfile names no python:X.Y base image"
    return int(match.group(1)), int(match.group(2))


def mismatches() -> list[str]:
    found: list[str] = []
    shipped = _shipped_python()
    if sys.version_info[:2] != shipped:
        found.append(f"python {sys.version_info[0]}.{sys.version_info[1]}, ships {shipped[0]}.{shipped[1]}")
    for line in (_BACKEND / "requirements.txt").read_text().splitlines():
        spec = line.split("#", 1)[0].strip()
        if not spec:
            continue
        req = Requirement(spec)
        try:
            installed = metadata.version(req.name)
        except metadata.PackageNotFoundError:
            found.append(f"{req.name} not installed, ships {req.specifier}")
            continue
        if not req.specifier.contains(installed, prereleases=True):
            found.append(f"{req.name} {installed}, ships {req.specifier}")
    return found


def refuse_off_the_shipped_runtime() -> None:
    found = mismatches()
    if found:
        pytest.exit(
            "Not the runtime that ships (backend/Dockerfile + requirements.txt):\n  "
            + "\n  ".join(found)
            + "\nRun backend/.venv/bin/pytest — setup in CONTRIBUTING.md.",
            returncode=4,
        )
