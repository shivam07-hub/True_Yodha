"""Order → six-slot spec. The interface is `resolve()`, tested with Order fixtures."""
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


def test_resolve_collapses_normalized_duplicates_silently() -> None:
    order = ops.Order(
        lines=[
            line(id="a", kind="wont_take", text="Large corporations"),
            line(id="b", kind="wont_take", text="large  corporations."),
            line(id="c", kind="lean", text="Senior IC tracks"),
        ]
    )
    result = payload.resolve(order)
    assert result.spec["deal_breakers"] == ["Large corporations"]
    assert result.duplicates_collapsed == 1
    assert result.conflicts == ()
    assert result.used_line_ids == ("a", "c")


def test_three_kept_goals_are_an_arity_conflict_not_a_silent_first() -> None:
    order = ops.Order(
        lines=[
            line(id="g1", kind="goal", text="Staff engineer"),
            line(id="g2", kind="goal", text="Founding PM"),
            line(id="g3", kind="goal", text="Research scientist"),
        ]
    )
    result = payload.resolve(order)
    assert "career_goal" not in result.spec
    assert len(result.conflicts) == 1
    conflict = result.conflicts[0]
    assert conflict.slot == "career_goal"
    assert conflict.kind == "arity"
    assert conflict.line_ids == ("g1", "g2", "g3")
    assert result.used_line_ids == ()


def test_a_single_goal_still_fills_the_slot() -> None:
    order = ops.Order(lines=[line(kind="goal", text="Staff engineer")])
    result = payload.resolve(order)
    assert result.spec["career_goal"] == "Staff engineer"
    assert result.conflicts == ()


def test_wont_take_against_the_same_lean_is_a_contradiction() -> None:
    order = ops.Order(
        lines=[
            line(id="w", kind="wont_take", text="Prefers onsite work"),
            line(id="l", kind="lean", text="Prefers onsite work"),
        ]
    )
    result = payload.resolve(order)
    assert result.spec.get("deal_breakers") in (None, [])
    assert result.spec.get("lean") in (None, [])
    assert len(result.conflicts) == 1
    conflict = result.conflicts[0]
    assert conflict.kind == "contradiction"
    assert set(conflict.line_ids) == {"w", "l"}


def test_a_location_requirement_against_relocate_openness_is_a_contradiction() -> None:
    order = ops.Order(
        lines=[
            line(id="loc", kind="location", text="Bengaluru"),
            line(id="lean", kind="lean", text="Open to relocating"),
        ]
    )
    result = payload.resolve(order)
    assert "target_location" not in result.spec
    assert result.spec.get("lean") in (None, [])
    conflict = result.conflicts[0]
    assert conflict.kind == "contradiction"
    assert set(conflict.line_ids) == {"loc", "lean"}


def test_project_still_returns_the_spec_for_the_patch() -> None:
    order = ops.Order(
        lines=[
            line(kind="role", text="tech sales"),
            line(kind="location", text="Bengaluru"),
            line(kind="wont_take", text="Large corporations"),
        ]
    )
    assert payload.project(order) == payload.resolve(order).spec
    assert payload.project(order)["target_role_titles"] == ["tech sales"]
    assert payload.project(order)["target_location"] == "Bengaluru"
