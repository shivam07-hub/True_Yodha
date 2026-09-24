"""Myro's own accounts count for nothing — asserted per counter.

Dev and prod share one database, so the Match Quality personas walk the real
journey into the real tables. `user_profiles.is_test_account` keeps them out of
the numbers we steer by, but only for the counters that ASK. A counter that
stops asking is silent: the number simply drifts up, and it drifts in the
direction that flatters us.

These are behaviour tests over fakes, not greps over source, so a counter that
keeps the word and loses the filter still fails. The last test is the grep, and
it exists for the opposite reason: to catch a NEW population counter that never
learned about the flag.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.services import test_accounts

ROOT = Path(__file__).resolve().parents[2]


class _Builder:
    """Records the filters a caller applies, returns the rows it was seeded with."""

    def __init__(self, rows: list[dict[str, Any]], recorder: dict[str, Any]) -> None:
        self._rows = rows
        self._rec = recorder

    def select(self, *_a: Any, **kw: Any) -> "_Builder":
        self._rec.setdefault("count_mode", kw.get("count"))
        return self

    def eq(self, column: str, value: Any) -> "_Builder":
        self._rec.setdefault("eq", {})[column] = value
        return self

    def gte(self, *_a: Any) -> "_Builder":
        return self

    def order(self, *_a: Any, **_k: Any) -> "_Builder":
        return self

    def limit(self, *_a: Any) -> "_Builder":
        return self

    def range(self, *_a: Any) -> "_Builder":
        return self

    @property
    def not_(self) -> "_Builder":
        self._rec["not_used"] = True
        return self

    def in_(self, column: str, values: list[str]) -> "_Builder":
        self._rec.setdefault("not_in", {})[column] = list(values)
        return self

    def is_(self, *_a: Any) -> "_Builder":
        return self

    def execute(self) -> Any:
        rows = self._rows
        return type("Result", (), {"data": rows, "count": len(rows)})()


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self.calls: dict[str, dict[str, Any]] = {}

    def table(self, name: str) -> _Builder:
        rec = self.calls.setdefault(name, {})
        return _Builder(self._tables.get(name, []), rec)


@pytest.fixture(autouse=True)
def _clear_memo() -> Any:
    test_accounts.reset_cache()
    yield
    test_accounts.reset_cache()


def test_excluded_user_ids_reads_only_marked_accounts() -> None:
    db = _DB({"user_profiles": [{"id": "persona-1"}, {"id": "persona-2"}]})

    ids = test_accounts.excluded_user_ids(db)

    assert ids == frozenset({"persona-1", "persona-2"})
    assert db.calls["user_profiles"]["eq"] == {"is_test_account": True}


def test_excluded_user_ids_is_memoised_between_counters() -> None:
    db = _DB({"user_profiles": [{"id": "persona-1"}]})

    first = test_accounts.excluded_user_ids(db)
    db._tables["user_profiles"] = [{"id": "persona-1"}, {"id": "persona-2"}]
    second = test_accounts.excluded_user_ids(db)

    # One batch of counts asks once. Freshness is not the point; agreement is.
    assert first == second == frozenset({"persona-1"})


def test_seeker_count_excludes_myros_own_accounts(monkeypatch: Any) -> None:
    from app.routers import public

    db = _DB({"user_profiles": [{"id": "real-1"}]})
    monkeypatch.setattr(public, "get_supabase_admin", lambda: db)

    public._count_seekers()

    assert db.calls["user_profiles"]["eq"] == {"is_test_account": False}


def test_upload_alert_denominator_excludes_persona_uploads(monkeypatch: Any) -> None:
    """The alert fires on a failure RATE. A persona uploading on every gate run
    inflates the denominator, which pushes a real failure rate under the
    threshold — the one direction of error an alert must not have."""
    from app.routers import telemetry

    db = _DB({
        "user_profiles": [{"id": "persona-1"}],
        "cv_upload_phase_events": [{"id": 1}],
    })
    monkeypatch.setattr(telemetry, "get_supabase_admin", lambda: db)

    telemetry._count_cv_upload_events(phase="parse", since_iso="2026-09-20T00:00:00Z")

    assert db.calls["cv_upload_phase_events"]["not_in"] == {"user_id": ["persona-1"]}


def test_band_peers_drop_personas_without_collapsing_unknown_bands() -> None:
    """A persona must not be ranked against anyone. A real user whose profile
    row is missing is a DIFFERENT case — unknown band — and the two must not
    collapse into the same bucket."""
    from app.repositories import scores as scores_repo

    rows = {
        "mirror_scores": [
            {"user_id": "persona-1", "total_score": 90.0, "domain_scores": {}, "domain_skill_counts": {}},
            {"user_id": "real-1", "total_score": 30.0, "domain_scores": {}, "domain_skill_counts": {}},
        ],
        "user_profiles": [
            {"id": "persona-1", "target_seniority": "mid", "is_test_account": True},
            {"id": "real-1", "target_seniority": "mid", "is_test_account": False},
        ],
    }
    repo = scores_repo.ScoresRepository(_DB(rows))

    peers = repo.get_all_band_scores()

    assert peers == [("mid", 30.0)]


def test_loop_reach_subtracts_personas_from_every_step() -> None:
    """The spine counts distinct users across fourteen tables, and a persona
    appears in all of them — it would read as the model user in the instrument
    built to tell us how few there are."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "loop_reach", ROOT / "backend" / "scripts" / "loop_reach.py"
    )
    assert spec and spec.loader
    loop_reach = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loop_reach)

    db = _DB({"cv_versions": [{"user_id": "persona-1"}, {"user_id": "real-1"}]})

    counted = loop_reach._count(
        db, "cv_versions", "user_id", {}, frozenset({"persona-1"})
    )

    assert counted == 1


def test_signed_up_step_filters_the_column_because_it_counts_rows() -> None:
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "loop_reach", ROOT / "backend" / "scripts" / "loop_reach.py"
    )
    assert spec and spec.loader
    loop_reach = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loop_reach)

    signed_up = next(step for step in loop_reach.STEPS if step[0] == "signed up")
    _label, table, user_col, filters = signed_up

    # Row count, not a distinct-user set — so subtraction cannot reach it and
    # the filter has to ride on the query.
    assert table == "user_profiles"
    assert user_col is None
    assert filters == {"is_test_account": False}


def test_no_unregistered_population_counter_over_user_profiles() -> None:
    """The grep, and the only one here: a NEW counter that counts people.

    Narrow on purpose — an exact-count read of `user_profiles`. Per-user reads
    (`.eq("id", …)`) are not population counts and never appear this way.
    """
    # Matched within ONE statement, not "both strings somewhere in the file" —
    # that first version flagged four files that count jobs, comments and CV
    # versions and merely mention user_profiles elsewhere.
    counter = re.compile(
        r'table\(\s*"user_profiles"\s*\)\s*(?:#[^\n]*\n\s*)*\.\s*select\([^)]*count\s*=\s*"exact"',
        re.S,
    )
    known = {"backend/app/routers/public.py"}
    offenders: list[str] = []

    for path in (ROOT / "backend").rglob("*.py"):
        if "tests" in path.parts:
            continue
        if not counter.search(path.read_text(encoding="utf-8")):
            continue
        rel = str(path.relative_to(ROOT))
        if rel in known:
            continue
        offenders.append(rel)

    assert not offenders, (
        "These count people without asking about is_test_account: "
        f"{offenders}. Either filter `is_test_account` / subtract "
        "`test_accounts.excluded_user_ids`, then add the file here."
    )
