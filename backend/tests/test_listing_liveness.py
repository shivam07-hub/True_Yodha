"""Listing Liveness — live · uncertain · down, one definition per layer.

CONTEXT.md → Listing Liveness. Measured 2026-10-27: the live rule was spelled in
15 SQL functions, the jobs RLS policy, 12 partial indexes and 6 Python sites;
down in 3 Python sites that split on `likely_closed`; `refresh_sector_panel`
had dropped `is_active`, and `listing_trust` read a missing column as live.
These lock the Python half and the tripwires that keep both halves single.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.services import listing_liveness
from app.services.listing_liveness import is_down, is_live, liveness

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "backend" / "app"
MIGRATIONS = ROOT / "database" / "migrations"
#: Migrations from the Liveness cut on must not spell the rule again.
CUT = "20261027120000"


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ({"is_active": True, "listing_confidence": "active"}, "live"),
        ({"is_active": True, "listing_confidence": "uncertain"}, "uncertain"),
        ({"is_active": True, "listing_confidence": "likely_closed"}, "down"),
        ({"is_active": True, "listing_confidence": "closed"}, "down"),
        ({"is_active": False, "listing_confidence": "active"}, "down"),
        ({"is_active": False, "listing_confidence": "uncertain"}, "down"),
        ({"is_active": None, "listing_confidence": "active"}, "uncertain"),
    ],
)
def test_the_three_states(row: dict[str, Any], expected: str) -> None:
    assert liveness(row) == expected
    assert is_live(row) is (expected == "live")
    assert is_down(row) is (expected == "down")


@pytest.mark.parametrize(
    "row",
    [
        {"listing_confidence": "active"},  # is_active not selected
        {"is_active": True},  # listing_confidence not selected
        {},
    ],
)
def test_a_column_not_selected_is_never_live(row: dict[str, Any]) -> None:
    """A row that did not select both columns is a caller bug. It must not read
    as live (fail-open) — that is what `listing_trust` used to do."""
    assert liveness(row) == "uncertain"
    assert is_live(row) is False


def test_down_evidence_counts_from_either_column_alone() -> None:
    assert liveness({"is_active": False}) == "down"
    assert liveness({"listing_confidence": "closed"}) == "down"


def test_not_a_mapping_is_uncertain() -> None:
    assert liveness(None) == "uncertain"  # type: ignore[arg-type]


class _Query:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

    def eq(self, *args: Any) -> "_Query":
        self.calls.append(("eq", args))
        return self

    def is_(self, *args: Any) -> "_Query":
        self.calls.append(("is_", args))
        return self


def test_live_only_spells_what_the_partial_indexes_spell() -> None:
    """`is_active = true` cannot reach an index whose predicate says
    `is_active IS TRUE`, so the PostgREST filter says IS TRUE too."""
    query = _Query()
    assert listing_liveness.live_only(query) is query
    assert query.calls == [("is_", ("is_active", "true")), ("eq", ("listing_confidence", "active"))]


def test_the_sql_function_is_the_python_predicate() -> None:
    body = (MIGRATIONS / "20261027120000_listing_is_live.sql").read_text()
    match = re.search(r"\$\$\s*select\s+(.+?)\s*\$\$", body, re.S | re.I)
    assert match, "listing_is_live body not found"
    assert match.group(1).replace("j.", "") == listing_liveness.SQL_PREDICATE


# ── tripwires ───────────────────────────────────────────────────────────────

_PY_SPELLINGS = (
    re.compile(r"""["']listing_confidence["']\s*,\s*["']active["']"""),
    re.compile(r"""listing_confidence["']\)\s*[!=]=\s*["']active["']"""),
    re.compile(r"""LIVENESS_DOWN|["']likely_closed["']\s*[}\)]"""),
)


def test_no_python_outside_the_module_spells_the_rule() -> None:
    offenders = []
    for path in APP.rglob("*.py"):
        if path.name == "listing_liveness.py":
            continue
        text = path.read_text()
        for pattern in _PY_SPELLINGS:
            for hit in pattern.finditer(text):
                line = text.count("\n", 0, hit.start()) + 1
                offenders.append(f"{path.relative_to(ROOT)}:{line}")
    assert offenders == [], "use app.services.listing_liveness: " + ", ".join(offenders)


_SQL_RULE = re.compile(r"listing_confidence\s*=\s*'active'", re.I)


def _code(path: Path) -> str:
    """A migration without its `--` comments: prose about the rule is not a copy."""
    return re.sub(r"--[^\n]*", "", path.read_text())


def _allowed(before: str) -> bool:
    """An index predicate (an index cannot call a whole-row function), the
    function's own definition, or a write that sets the value."""
    tail = before[before.rfind(";") + 1:]
    return bool(
        re.search(r"create\s+index", tail, re.I)
        or re.search(r"function\s+public\.listing_is_live", tail, re.I)
        or re.search(r"(?:\bset|,)\s*$", before, re.I)
    )


def test_no_migration_after_the_cut_spells_the_rule() -> None:
    offenders = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name[:14] < CUT:
            continue
        text = _code(path)
        for hit in _SQL_RULE.finditer(text):
            if not _allowed(text[: hit.start()]):
                line = text.count("\n", 0, hit.start()) + 1
                offenders.append(f"{path.name}:{line}")
    assert offenders == [], "call public.listing_is_live(<row>): " + ", ".join(offenders)


def test_index_predicates_after_the_cut_say_is_true() -> None:
    """Postgres cannot prove `is_active IS TRUE` from bare `is_active`, or back."""
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name[:14] < CUT:
            continue
        for stmt in re.findall(r"create\s+index[^;]+;", _code(path), re.I | re.S):
            if _SQL_RULE.search(stmt):
                assert re.search(r"is_active\s+is\s+true", stmt, re.I), f"{path.name}: {stmt[:80]}"
