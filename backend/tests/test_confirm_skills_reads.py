"""The confirm-skills button resolves a CV's skills in one read, not one each.

Traced 2026-10-03 for a CV naming six skills: 16 reads, six of them
`ensure_skill_in_db` one name at a time, plus the baseline read three times
and skill keys read back after review dropped them. Prod logged 18 reads and
4.3s on this button (`slow_200:reads_over_budget`). Now 8, flat in skill count.
"""

from __future__ import annotations

from typing import Any

from app.services import skill_confirmation, taxonomy_loader

NOTICE_CAUSE_KEY = "slow_200:reads_over_budget"


class _Query:
    def __init__(self, rows: list[dict[str, Any]], log: list[tuple[str, Any]]) -> None:
        self._rows, self._log = rows, log

    def select(self, *_a: Any) -> "_Query":
        return self

    def in_(self, column: str, values: list[Any]) -> "_Query":
        self._log.append(("in_", (column, list(values))))
        self._rows = [row for row in self._rows if row.get(column) in set(values)]
        return self

    def execute(self) -> Any:
        class _R:
            pass

        result = _R()
        result.data = self._rows
        return result


class _DB:
    def __init__(self, skills: list[dict[str, Any]]) -> None:
        self.skills = skills
        self.log: list[tuple[str, Any]] = []

    def table(self, name: str) -> _Query:
        self.log.append(("table", name))
        return _Query([dict(row) for row in self.skills], self.log)


def test_many_skills_resolve_in_one_read(monkeypatch) -> None:
    db = _DB([{"id": i, "taxonomy_key": f"Skill {i}"} for i in range(1, 13)])
    inserted: list[str] = []
    monkeypatch.setattr(
        taxonomy_loader,
        "ensure_skill_in_db",
        lambda _db, name: inserted.append(name) or 99,
    )

    ids = taxonomy_loader.ensure_skills_in_db(db, [f"Skill {i}" for i in range(1, 13)] + ["New Skill"])

    assert db.log.count(("table", "skills")) == 1
    assert ids["Skill 7"] == 7
    # The catalog is preloaded; insert remains the safety net for the rare miss.
    assert inserted == ["New Skill"] and ids["New Skill"] == 99


def test_review_keeps_the_key_it_already_holds() -> None:
    rows = skill_confirmation._reviewed_rows(
        [
            {
                "skill_id": 7,
                "taxonomy_key": "Python (Programming Language)",
                "matched_level": 3,
                "proficiency_title": "Ranger",
                "evidence_text": "Built Python services",
            }
        ],
        [],
    )

    # An empty key here is what made the publish path read `skills` again.
    assert rows[0]["taxonomy_key"] == "Python (Programming Language)"


def test_key_named_overrides_resolve_in_one_read() -> None:
    class _Scores:
        calls: list[list[str]] = []

        def get_skill_ids_for_keys(self, keys: list[str]) -> dict[str, int]:
            self.calls.append(list(keys))
            return {"SQL (Programming Language)": 22, "Python (Programming Language)": 11}

    scores = _Scores()
    out = skill_confirmation._normalized_overrides(
        scores,  # type: ignore[arg-type]
        [
            {"taxonomy_key": "SQL (Programming Language)", "action": "include"},
            {"taxonomy_key": "Python (Programming Language)", "action": "exclude"},
            {"taxonomy_key": "Not In Catalog", "action": "include"},
        ],
    )

    assert len(scores.calls) == 1
    assert {row["skill_id"] for row in out} == {11, 22}
