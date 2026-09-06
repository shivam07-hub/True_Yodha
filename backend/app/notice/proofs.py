"""CloseProofs already on this checkout. NOTICE_CAUSE_KEY in a test is the marker."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from app.notice.types import CloseProof

_MARKER = re.compile(
    r'NOTICE_CAUSE_KEY\s*=\s*["\']([^"\']+)["\']',
)


def proofs_from_tests(
    tests_root: Path,
    *,
    sha: str,
    on_main: bool,
) -> list[CloseProof]:
    proofs: list[CloseProof] = []
    if not tests_root.is_dir():
        return proofs
    for path in sorted(tests_root.rglob("test_*.py")):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        match = _MARKER.search(text)
        if match is None:
            continue
        proofs.append(
            CloseProof(
                cause_key=match.group(1),
                test_nodeid=f"{path.as_posix()}::NOTICE_CAUSE_KEY",
                sha=sha,
                on_main=on_main,
            )
        )
    return proofs


def proofs_from_git_ref(repo: Path, ref: str, *, sha: str) -> list[CloseProof]:
    result = subprocess.run(
        ["git", "grep", "-h", "NOTICE_CAUSE_KEY", ref, "--", "backend/tests"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    proofs: list[CloseProof] = []
    seen: set[str] = set()
    for line in result.stdout.splitlines():
        match = _MARKER.search(line)
        if match is None:
            continue
        key = match.group(1)
        if key in seen:
            continue
        seen.add(key)
        proofs.append(
            CloseProof(
                cause_key=key,
                test_nodeid=f"{ref}::NOTICE_CAUSE_KEY",
                sha=sha,
                on_main=True,
            )
        )
    return proofs
