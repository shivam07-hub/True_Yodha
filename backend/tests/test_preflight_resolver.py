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


def test_client_report_exposes_conflicts_and_the_slot_arity() -> None:
    order = ops.Order(
        lines=[
            line(id="w", kind="wont_take", text="Prefers onsite work"),
            line(id="l", kind="lean", text="Prefers onsite work"),
        ]
    )
    report = payload.client_report(order)
    assert report["used"] == 0
    assert report["duplicates_collapsed"] == 0
    assert len(report["conflicts"]) == 1
    conflict = report["conflicts"][0]
    assert conflict["kind"] == "contradiction"
    assert conflict["keep"] == 6
    assert set(conflict["line_ids"]) == {"w", "l"}
    assert conflict["texts"] == ["Prefers onsite work", "Prefers onsite work"]


def test_client_report_counts_silent_duplicates() -> None:
    order = ops.Order(
        lines=[
            line(id="a", kind="wont_take", text="Large corporations"),
            line(id="b", kind="wont_take", text="large  corporations."),
        ]
    )
    report = payload.client_report(order)
    assert report["duplicates_collapsed"] == 1
    assert report["conflicts"] == []
    assert report["used"] == 1


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


# ── the slot view ────────────────────────────────────────────────────────────


def _slots(order):
    return {s["key"]: s for s in payload.client_report(order)["slots"]}


def test_the_slot_view_is_the_spec_addressed_by_line_id():
    """What the screen renders and what the run uses are one set.

    While the client filed lines into slots itself it was a second resolver
    reading the raw `lines` array, and it showed duplicates this one had
    already collapsed — `Won't take · 15 of 6`, a number that was never going
    to be run.
    """
    order = ops.Order(
        lines=[
            line(kind="role", text="Enterprise Sales", status="kept"),
            line(kind="wont_take", text="Large corporations", status="kept"),
            line(kind="wont_take", text="Agency work", status="kept"),
            line(kind="lean", text="Corporate functions", status="unanswered"),
        ]
    )
    slots = _slots(order)
    placed = [line_id for s in slots.values() for line_id in s["line_ids"]]

    spec = payload.project(order)
    assert len(placed) == len(payload.resolve(order).used_line_ids)
    assert len(slots["deal_breakers"]["line_ids"]) == len(spec["deal_breakers"]) == 2
    assert len(slots["target_role_titles"]["line_ids"]) == 1
    # An unanswered line is on no slot — it is not part of the order yet.
    assert slots["lean"]["line_ids"] == []
    # Every slot states its own arity, so nothing downstream re-derives it.
    assert slots["target_location"]["arity"] == 1
    assert slots["deal_breakers"]["arity"] == 6


def test_an_over_arity_slot_places_nothing_and_contests_everything():
    lines = [line(kind="wont_take", text=f"Thing {i}", status="kept") for i in range(9)]
    slots = _slots(ops.Order(lines=lines))["deal_breakers"]
    # The resolver skips the whole group, so nothing is claimed as placed —
    # a plate under this header would be a line the run is not going to use.
    assert slots["line_ids"] == []
    assert len(slots["contested_ids"]) == 9


def test_a_duplicate_is_placed_once_and_contested_never():
    """The twin the importer used to append renders as one plate, not two."""
    order = ops.Order(
        lines=[
            line(id="a", kind="wont_take", text="Large corporations", status="kept"),
            line(id="b", kind="wont_take", text="large corporations", status="kept"),
        ]
    )
    slot = _slots(order)["deal_breakers"]
    assert slot["line_ids"] == ["a"]
    assert slot["contested_ids"] == []


def test_a_contradiction_contests_its_line_in_each_slot_it_touches():
    order = ops.Order(
        lines=[
            line(id="w", kind="wont_take", text="Large corporations", status="kept"),
            line(id="l", kind="lean", text="Large corporations", status="kept"),
        ]
    )
    slots = _slots(order)
    # The card is filed to one slot; both slots know their own line is held.
    assert slots["deal_breakers"]["contested_ids"] == ["w"]
    assert slots["lean"]["contested_ids"] == ["l"]
    assert slots["deal_breakers"]["line_ids"] == slots["lean"]["line_ids"] == []
