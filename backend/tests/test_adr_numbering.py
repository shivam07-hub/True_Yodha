"""One ADR number means one decision.

`ADR-0021` was cited in live code for two unrelated decisions at once — the
Notice mailbox retirement and the reservoir-as-Master-CV — because two files
claimed the number four days apart. A citation that resolves to two documents
is worse than no citation: every reader picks the wrong one half the time.

This is a repo-shape test rather than a code test, and it lives in pytest
because pytest is in the five gates every agent runs.
"""
from __future__ import annotations

import re
from pathlib import Path

ADR_DIR = Path(__file__).resolve().parents[2] / "docs" / "adr"
_NUMBERED = re.compile(r"^(\d{4})-")


def _numbered_adrs() -> dict[str, list[str]]:
    by_number: dict[str, list[str]] = {}
    for path in sorted(ADR_DIR.glob("*.md")):
        match = _NUMBERED.match(path.name)
        if match:
            by_number.setdefault(match.group(1), []).append(path.name)
    return by_number


def test_adr_directory_is_present_and_tracked():
    """docs/ is gitignored except adr/. If this fails, the negation was dropped
    and every ADR is invisible to every other machine again."""
    assert ADR_DIR.is_dir(), f"no ADR directory at {ADR_DIR}"
    assert _numbered_adrs(), "no numbered ADRs found — check .gitignore's !/docs/adr/"


def test_no_two_adrs_claim_the_same_number():
    clashes = {n: files for n, files in _numbered_adrs().items() if len(files) > 1}
    assert not clashes, (
        "each ADR number must name exactly one decision; a companion document "
        f"belongs outside the numeric sequence: {clashes}"
    )
