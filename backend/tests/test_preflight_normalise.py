"""What a stored line MEANS, as against how its producer filed it.

Every fixture here is a real statement from the prod order `33b66361`
(2026-08-24) — the row whose screen read `Won't take · 10 of 6`.
"""
from __future__ import annotations

from app.services.preflight import lines as ops
from app.services.preflight import normalise, payload


def line(**kw) -> ops.OrderLine:
    base = dict(
        id=kw.pop("id", ops.new_id()),
        kind="wont_take",
        text="",
        source="user_said",
        origin="preflight",
        status="kept",
    )
    base.update(kw)
    return ops.OrderLine(**base)


def test_a_location_filed_as_an_exclusion_is_read_as_a_location() -> None:
    assert normalise.refile(line(text="Requires roles based in India"))[0] == "location"


def test_a_stated_preference_filed_as_an_exclusion_becomes_a_tilt() -> None:
    kind, note = normalise.refile(line(text="Prefers professional services or corporate environment"))
    assert kind == "lean"
    assert note


def test_a_negative_preference_stays_an_exclusion() -> None:
    """`soft` is True on this line AND on the one above. Polarity is the signal."""
    assert normalise.refile(
        line(text="Prefers to avoid roles with 'specialist' in the title", soft=True)
    )[0] == "wont_take"


def test_a_bare_phrase_is_left_alone() -> None:
    """`_strip_lead` stores "No large corporations" as "Large corporations". A
    missing negative is silence, not evidence — refiling this would widen the search."""
    assert normalise.refile(line(text="Large corporations"))[0] == "wont_take"


def test_a_seniority_exclusion_is_not_downgraded_to_a_tilt() -> None:
    assert normalise.refile(line(text="Avoids senior management roles"))[0] == "wont_take"


def test_a_fact_about_the_person_files_to_no_slot() -> None:
    kind, _ = normalise.refile(line(text="Notice period is 60 days"))
    assert kind == "fact"
    assert payload.slot_for(line(kind=kind, text="Notice period is 60 days")) is None


def test_two_pay_floors_are_one_question_not_two_exclusions() -> None:
    order = ops.Order(
        lines=[
            line(id="p1", kind="pay_floor", text="more than 30 lakhs"),
            line(id="p2", kind="pay_floor", text="Pay floor \u20b945L total comp"),
            line(id="r", kind="role", text="tech sales"),
        ]
    )
    result = payload.resolve(order)
    clashes = [c for c in result.conflicts if c.kind == "value_clash"]
    assert len(clashes) == 1
    assert set(clashes[0].line_ids) == {"p1", "p2"}


def test_the_invisible_contradiction_reaching_the_matcher_is_caught() -> None:
    """Both of these are kept in prod, in one spec, and nothing says a word."""
    order = ops.Order(
        lines=[
            line(id="w", kind="wont_take", text="Avoids large corporations"),
            line(id="l", kind="lean", text="Prefers large or established companies"),
        ]
    )
    result = payload.resolve(order)
    assert [c.kind for c in result.conflicts] == ["contradiction"]


def test_unrelated_exclusions_do_not_collide() -> None:
    order = ops.Order(
        lines=[
            line(id="a", kind="wont_take", text="Avoids large corporations"),
            line(id="b", kind="lean", text="Prefers working with AI and data"),
            line(id="r", kind="role", text="tech sales"),
        ]
    )
    assert payload.resolve(order).conflicts == ()


def test_the_whole_prod_order_stops_asking_the_user_to_drop_anything() -> None:
    """The regression that started this: ten kept lines, `drop 4 more`."""
    texts = [
        "Avoids early-stage start-ups",
        "Prefers to avoid roles with 'specialist' in the title",
        "Avoids roles focused on financial accounting",
        "Requires roles based in India",
        "Prefers professional services or corporate environment",
        "Notice period is 60 days",
        "Avoids senior management roles",
    ]
    order = ops.Order(
        lines=[line(id=f"w{i}", text=t) for i, t in enumerate(texts)]
        + [line(id="r", kind="role", text="tech sales")]
    )
    result = payload.resolve(order)
    assert not [c for c in result.conflicts if c.kind == "arity"], "no slot should overflow"
    assert len(result.spec["deal_breakers"]) == 4


def test_the_yield_map_only_names_slots_the_spec_has() -> None:
    """The drift check `_YIELD_TO_NATIVE` has always claimed and never had.

    It is a local copy of part of `SLOT_KINDS`, kept local to avoid an import
    cycle. A copy with no check is how it went on saying "slots that hold
    exactly one value" for a slot that holds three.
    """
    from app.services.preflight import spec

    for slot, kinds in normalise._YIELD_TO_NATIVE.items():
        assert spec.SLOT_KINDS[slot] == kinds


def test_a_refiled_location_yields_to_one_the_user_stated() -> None:
    """Arity is no longer what triggers this — see `normalise.apply`.

    "Requires roles based in India" reads as a location. Beside a stated
    Mumbai and Bengaluru it would widen the search to the whole country, which
    is Myro's reinterpretation overruling the user's own answer. It steps
    aside as a fact instead, and stays on screen.
    """
    lines = [
        line(kind="location", text="Mumbai", status="kept"),
        line(kind="location", text="Bengaluru", status="kept"),
        line(kind="wont_take", text="Requires roles based in India", status="kept"),
    ]
    out = normalise.apply(lines)
    kinds = {x.text: x.kind for x in out}
    assert kinds["Mumbai"] == "location"
    assert kinds["Bengaluru"] == "location"
    assert kinds["Requires roles based in India"] == "fact"


def test_a_refiled_location_still_stands_when_the_user_stated_none() -> None:
    """Nothing to yield to — the refile is the only claimant, so it keeps the slot."""
    out = normalise.apply([line(kind="wont_take", text="Requires roles based in India")])
    assert [x.kind for x in out] == ["location"]
