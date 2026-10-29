"""loop_reach counts the north star on the Yes, not the stage.

DECISIONS APPLY1, amended 2026-10-27: a Yes stays counted when the stage moves
on. Counting `status = 'applied'` dropped everyone who reached Interviewing.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def _loop_reach() -> Any:
    spec = importlib.util.spec_from_file_location(
        "loop_reach", ROOT / "backend" / "scripts" / "loop_reach.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Query:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def select(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    @property
    def not_(self) -> "_Query":
        return self

    def is_(self, *_a: Any) -> "_Query":
        return self

    def in_(self, column: str, values: list[str]) -> "_Query":
        self._rows = [r for r in self._rows if str(r.get(column)) in set(values)]
        return self

    def execute(self) -> Any:
        return type("R", (), {"data": self._rows})()


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _Query:
        return _Query(list(self._tables.get(name, [])))


def test_the_applied_step_counts_the_yes() -> None:
    applied = next(step for step in _loop_reach().STEPS if step[0] == "applied")
    assert applied[1:] == ("job_applications", "user_id", {"applied_at": "__not_null__"})


def test_the_north_star_is_a_yes_on_a_job_rated_at_least_three_and_a_half() -> None:
    db = _DB({
        # Yeses only — the query asks for applied_at set.
        "job_applications": [
            {"user_id": "a", "job_id": "j1"},  # rated 4.2, stage moved on
            {"user_id": "a", "job_id": "j2"},  # rated 3.2
            {"user_id": "b", "job_id": "j3"},  # never rated
            {"user_id": "c", "job_id": "j4"},  # rated 3.8
            {"user_id": "persona", "job_id": "j5"},
        ],
        "user_job_matches": [
            {"user_id": "a", "job_id": "j1", "overall_score": 4.2},
            {"user_id": "a", "job_id": "j2", "overall_score": 3.2},
            {"user_id": "c", "job_id": "j4", "overall_score": 3.8},
            {"user_id": "persona", "job_id": "j5", "overall_score": 4.9},
            # Someone else's verdict on the same job is not this person's.
            {"user_id": "b", "job_id": "j1", "overall_score": 4.5},
        ],
    })

    people, sent, unrated = _loop_reach()._qualified_yeses(db, frozenset({"persona"}))

    assert (people, sent, unrated) == (2, 2, 1)
