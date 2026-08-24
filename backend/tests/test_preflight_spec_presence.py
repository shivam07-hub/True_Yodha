"""An empty slot means three different things and they write three different patches.

Regression for the 2026-08-24 prod row (`33b66361`): the screen said
`Won't take · 10 of 6` while pressing Run would have written `career_goal=NULL`
over "a high paying job in an MNC with flexible working hours" and emptied six
stored deal-breakers — neither of which the user had answered.
"""
from __future__ import annotations

from app.services.preflight import lines as ops
from app.services.preflight import payload


def line(**kw) -> ops.OrderLine:
    base = dict(
        id=kw.pop("id", ops.new_id()),
        kind="wont_take",
        text="Large corporations",
        source="user_said",
        origin="preflight",
        status="kept",
    )
    base.update(kw)
    return ops.OrderLine(**base)


def test_an_unanswered_guess_never_clears_the_stored_column() -> None:
    """`drop_unanswered` leaves `answered_at` None. That is the whole signal."""
    order = ops.Order(
        lines=[
            line(kind="goal", text="Staff engineer", status="unanswered"),
            line(kind="role", text="AE"),
        ]
    )
    order = ops.drop_unanswered(order)
    spec = payload.project(order)
    assert "career_goal" not in spec, "an unanswered goal must not write NULL"
    assert "superpower" not in spec


def test_answering_no_to_everything_in_a_slot_does_clear_it() -> None:
    """"Myro runs on the lines above and nothing else" — an emptied slot is empty."""
    order = ops.Order(lines=[line(id="g", kind="goal", text="Staff engineer")])
    order, _ = ops.drop(order, "g", now="2026-08-24T00:00:00Z")
    spec = payload.project(order)
    assert spec["career_goal"] is None


def test_a_slot_that_never_existed_is_absent_not_cleared() -> None:
    assert payload.project(ops.Order(lines=[line(kind="role", text="AE")])) == {
        "target_role_titles": ["AE"]
    }


def test_a_contested_slot_writes_nothing_at_all() -> None:
    """The prod shape: deal_breakers over arity. It used to write []."""
    order = ops.Order(
        lines=[line(id=f"w{i}", kind="wont_take", text=f"Exclusion {i}") for i in range(10)]
    )
    result = payload.resolve(order)
    assert any(c.kind == "arity" and c.slot == "deal_breakers" for c in result.conflicts)
    assert "deal_breakers" not in result.spec, "a contested slot must not erase the column"


def test_a_contradiction_silences_both_slots_it_touches() -> None:
    order = ops.Order(
        lines=[
            line(id="w", kind="wont_take", text="Large corporations"),
            line(id="l", kind="lean", text="Large corporations"),
        ]
    )
    result = payload.resolve(order)
    assert result.conflicts and result.conflicts[0].kind == "contradiction"
    assert "deal_breakers" not in result.spec
    assert "lean" not in result.spec, "the lean side of a contradiction must not write either"
