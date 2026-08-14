"""The direction axis on step 2 — what the user is drawn to, and what they're not.

Onboarding is where Myro's reach actually is: on 2026-08-14, 72 users had
confirmed a direction while 4 held any memory fact and 1 had a deal-breaker. So
this is the step that gets to ask, and these cover the two halves being stored
where each is already canonical — `avoid` in the `deal_breakers` column the
matcher reads, `lean` as authored `preference` facts that ride to the brain as
`known_facts` — plus the rule that a proposal must never be mistaken for an
answer.
"""

from __future__ import annotations

from typing import Any

from app.services.onboarding_service import (
    _direction_answer,
    _normalize_direction_phrases,
    _replace_authored_leans,
)


class _MemoryDB:
    """Minimal user_memory table stand-in: list / insert / delete by id."""

    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = list(rows or [])
        self.deleted: list[str] = []
        self.inserted: list[dict[str, Any]] = []

    def table(self, _name: str) -> "_MemoryDB":
        return self

    # list_active chain
    def select(self, *_a: Any, **_k: Any) -> "_MemoryDB":
        return self

    def eq(self, *_a: Any) -> "_MemoryDB":
        return self

    def in_(self, _col: str, kinds: list[str]) -> "_MemoryDB":
        self._kinds = kinds
        return self

    def order(self, *_a: Any, **_k: Any) -> "_MemoryDB":
        return self

    def limit(self, *_a: Any) -> "_MemoryDB":
        return self

    def insert(self, row: dict[str, Any]) -> "_MemoryDB":
        self.inserted.append(row)
        return self

    def delete(self) -> "_MemoryDB":
        self._deleting = True
        return self

    def execute(self) -> Any:
        kinds = getattr(self, "_kinds", None)
        data = [r for r in self.rows if kinds is None or r.get("kind") in kinds]
        return type("R", (), {"data": data})()


def test_phrases_are_clauses_deduped_case_insensitively_and_capped() -> None:
    assert _normalize_direction_phrases(
        ["Avoids large corporations", "avoids LARGE corporations", "  no   night shifts "]
    ) == ["Avoids large corporations", "no night shifts"]
    assert len(_normalize_direction_phrases([f"phrase {i}" for i in range(20)])) == 6


def test_a_phrase_is_never_truncated_into_a_tag() -> None:
    """These are read back as a sentence, so a whole clause has to survive."""
    phrase = "May prefer consultative or partnering work over pure quota carrying"
    assert _normalize_direction_phrases([phrase]) == [phrase]


def test_confirmed_answers_win_over_myros_reading() -> None:
    """A column value and an authored fact are the user's own words. Neither is
    ever replaced by a distilled guess, and neither is labelled as proposed."""
    db = _MemoryDB([
        {"id": "1", "kind": "preference", "text": "distilled lean", "source": "distilled"},
        {"id": "2", "kind": "preference", "text": "my own lean", "source": "authored"},
        {"id": "3", "kind": "constraint", "text": "distilled avoid", "source": "distilled"},
    ])
    answer = _direction_answer(db, "u1", {"deal_breakers": ["my own avoid"]})
    assert answer["lean"] == ["my own lean"]
    assert answer["avoid"] == ["my own avoid"]
    assert answer["proposed"] == []


def test_an_empty_half_is_gap_filled_and_named_as_a_reading() -> None:
    db = _MemoryDB([
        {"id": "1", "kind": "preference", "text": "consultative work", "source": "distilled"},
        {"id": "3", "kind": "constraint", "text": "avoids large corporations", "source": "distilled"},
    ])
    answer = _direction_answer(db, "u1", {})
    assert answer["lean"] == ["consultative work"]
    assert answer["avoid"] == ["avoids large corporations"]
    # Both halves are Myro's reading — the step has to say so, or a guess is
    # presented as a decision the user already made.
    assert sorted(answer["proposed"]) == ["avoid", "lean"]


def test_a_memory_outage_does_not_block_the_step() -> None:
    class _Broken:
        def table(self, _name: str) -> Any:
            raise RuntimeError("memory down")

    answer = _direction_answer(_Broken(), "u1", {"deal_breakers": ["kept"]})
    assert answer["avoid"] == ["kept"]
    assert answer["lean"] == []


def test_leans_replace_only_authored_facts() -> None:
    """Myro's own reading is not deleted behind the user's back — it gets proposed
    again next time instead."""
    db = _MemoryDB([
        {"id": "keep", "kind": "preference", "text": "distilled", "source": "distilled"},
        {"id": "drop", "kind": "preference", "text": "old lean", "source": "authored"},
    ])
    changed = _replace_authored_leans(db, "u1", ["new lean"])
    assert changed is True
    assert db.inserted == [{
        "user_id": "u1", "kind": "preference", "text": "new lean",
        "resolved": None, "source": "authored", "confidence": None,
    }]


def test_resubmitting_the_same_leans_is_not_a_change() -> None:
    """Guards the refresh gate: an unchanged answer must not spend an LLM pass."""
    db = _MemoryDB([
        {"id": "1", "kind": "preference", "text": "same", "source": "authored"},
    ])
    assert _replace_authored_leans(db, "u1", ["same"]) is False
    assert db.inserted == []
