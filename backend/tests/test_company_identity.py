"""One company, one key (CONTEXT → Company Identity).

Measured 2026-10-29: `resolve_company_entity` stripped every character outside
`a-z0-9` BEFORE lowercasing, so capitals vanished — "OpenAI" keyed `pen`, and
Meta and Zeta both keyed `eta`. Four ids held ten employers. The scraper fetches
a company's jobs by that id and closes the ones its run did not see, so KPMG
India's run closed all 71 EY India and 32 BDO India listings, Zeta's closed all
36 of Meta's, and DBS Bank and ANZ Bank closed each other daily (301 of DBS
Bank's 558 reopened in 30 days). The Python intel lookup lowercased first, so
its key never matched a stored one.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
CUT = "20261029120000"
DEFINITION = MIGRATIONS / f"{CUT}_company_key.sql"


def _code(path: Path) -> str:
    """A migration without its `--` comments: prose about the rule is not a copy."""
    return re.sub(r"--[^\n]*", "", path.read_text())


def _function(text: str, name: str) -> str:
    start = re.search(rf"function\s+public\.{name}\s*\(", text, re.I)
    assert start, f"public.{name} is defined in {DEFINITION.name}"
    end = text.find("$$;", text.find("$$", start.end()) + 2)
    return text[start.start(): end]


# ── the key lowercases, then strips ─────────────────────────────────────────

def test_the_key_lowercases_before_it_strips() -> None:
    body = _function(_code(DEFINITION), "company_key")
    assert re.search(r"regexp_replace\(\s*lower\(", body, re.I), body
    assert "'[^a-z0-9]+'" in body


def test_the_resolver_and_unfollow_call_the_two_keys() -> None:
    text = _code(DEFINITION)
    resolver = _function(text, "resolve_company_entity")
    assert "public.company_key(" in resolver
    assert "public.company_alias_key(" in resolver
    assert "public.company_alias_key(" in _function(text, "unfollow_company")


# ── nothing else spells either key ──────────────────────────────────────────

_STRIP = re.compile(r"\[\^a-z0-9\]")
_ALIAS_FOLD = re.compile(r"""regexp_replace\(\s*btrim\([^)]*company[^)]*\)\s*,\s*'\\s\+'""", re.I)


def test_no_migration_after_the_cut_spells_a_company_key() -> None:
    offenders = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name[:14] < CUT:
            continue
        text = _code(path)
        if path == DEFINITION:
            # The two key functions are the only place the folds are spelled.
            for name in ("company_key", "company_alias_key"):
                text = text.replace(_function(text, name), "")
        for pattern in (_STRIP, _ALIAS_FOLD):
            for hit in pattern.finditer(text):
                offenders.append(f"{path.name}:{text.count(chr(10), 0, hit.start()) + 1}")
    assert offenders == [], "call public.company_key / company_alias_key: " + ", ".join(offenders)


def test_no_python_computes_a_company_key() -> None:
    offenders = []
    for path in (ROOT / "backend" / "app").rglob("*.py"):
        text = path.read_text()
        for hit in re.finditer(r"""canonical_key|alias_key""", text):
            offenders.append(f"{path.relative_to(ROOT)}:{text.count(chr(10), 0, hit.start()) + 1}")
    assert offenders == [], "resolve through public.company_for_name: " + ", ".join(offenders)


# ── the intel page finds its company through the database rule ──────────────

class _Rpc:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def execute(self) -> Any:
        return type("R", (), {"data": self._rows})()


class _DB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
        self.calls.append((name, params))
        return _Rpc(self.rows)


def test_intel_resolves_a_name_through_one_rpc() -> None:
    from app.repositories.company_intelligence import CompanyIntelligenceRepository

    db = _DB([{"id": 7, "canonical_name": "KPMG India", "slug": "kpmgindia"}])
    found = CompanyIntelligenceRepository(db)._resolve("KPMG India")  # type: ignore[arg-type]
    assert found == {"id": 7, "canonical_name": "KPMG India", "slug": "kpmgindia"}
    assert db.calls == [("company_for_name", {"p_company_name": "KPMG India"})]


def test_an_unknown_name_is_no_company() -> None:
    from app.repositories.company_intelligence import CompanyIntelligenceRepository

    assert CompanyIntelligenceRepository(_DB([]))._resolve("Nobody Ltd") is None  # type: ignore[arg-type]
