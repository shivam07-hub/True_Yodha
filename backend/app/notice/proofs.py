"""CloseProofs already on this checkout. NOTICE_CAUSE_KEY in a test is the marker."""

from __future__ import annotations

import re
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
        # One file may close several causes that share one root cause.
        for match in _MARKER.finditer(text):
            proofs.append(
                CloseProof(
                    cause_key=match.group(1),
                    test_nodeid=f"{path.as_posix()}::NOTICE_CAUSE_KEY",
                    sha=sha,
                    on_main=on_main,
                )
            )
    return proofs
