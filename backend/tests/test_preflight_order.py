"""The pre-flight order's invariants.

The one that matters most: **the ops payload is built from kept lines and
nothing else.** An unanswered guess is dropped at run time — never defaulted to
kept, never inferred from "well, Myro proposed it". Everything else here exists
because the surface promises it in writing on the review screen.
"""
from __future__ import annotations

import pytest

from app.services.matching.targeting import MemoryFact, TargetingBrief
from app.services.preflight import lines as ops
from app.services.preflight import memory_import, payload, proposals

NOW = "2026-08-16T00:00:00+00:00"


def line(**kw) -> ops.OrderLine:
    base = dict(
        id=kw.pop("id", ops.new_id()),
        kind="wont_take",
        text="Large corporations",
        source="myro_inferred",
        origin="memory_import",
        status="unanswered",
    )
    base.update(kw)
    return ops.OrderLine(**base)


# ── the invariant ────────────────────────────────────────────────────────────


def test_ops_payload_carries_only_kept_lines():
    order = ops.Order(
        said="tech sales",
        lines=[
            line(kind="wont_take", text="Large corporations", status="kept"),
            line(kind="wont_take", text="Data scientist roles", status="dropped"),
            line(kind="wont_take", text="Consultative work", status="unanswered"),
            line(kind="lean", text="Senior IC tracks", status="unanswered"),
            line(kind="lean", text="Corporate functions", status="kept"),
            line(kind="goal", text="Staff engineer", status="unanswered"),
        ],
    )
    body = payload.project(order)
    assert body["deal_breakers"] == ["Large corporations"]
    assert body["lean"] == ["Corporate functions"]
    # An unanswered goal is not a goal.
    assert body["career_goal"] is None
    for value in ("Data scientist", "Consultative", "Senior IC", "Staff engineer"):
        assert value not in str(body)


def test_drop_unanswered_settles_everything_before_dispatch():
    order = ops.Order(lines=[line(status="unanswered"), line(status="kept"), line(status="dropped")])
    settled = ops.drop_unanswered(order)
    assert [x.status for x in settled.lines] == ["dropped", "kept", "dropped"]
    # Idempotent — a second pass moves nothing.
    assert ops.drop_unanswered(settled).to_dict() == settled.to_dict()


def test_an_empty_order_never_wipes_stored_targeting():
    # A user who opens the gate, says nothing and hits Run must not have their
    # role titles cleared by a PATCH carrying an empty list.
    body = payload.project(ops.Order())
    assert "target_role_titles" not in body
    assert "target_location" not in body


def test_a_pay_floor_reaches_the_matcher_as_a_constraint():
    order = ops.Order(lines=[line(kind="pay_floor", text="₹45L total comp", status="kept")])
    assert payload.project(order)["deal_breakers"] == ["Below ₹45L total comp"]


# ── answering ────────────────────────────────────────────────────────────────


def test_yes_is_refused_on_a_line_myro_cannot_run():
    bad = line(kind="goal", text="No", unusable=True, source="user_said")
    order, entry = ops.keep(ops.Order(lines=[bad]), bad.id, now=NOW)
    assert entry is None
    assert order.find(bad.id).status == "unanswered"


def test_a_reword_counts_as_yes_and_is_user_reworded_forever():
    bad = line(kind="goal", text="No", unusable=True, source="user_said")
    order, _ = ops.reword(ops.Order(lines=[bad]), bad.id, "Staff engineer at a product company.", now=NOW)
    got = order.find(bad.id)
    assert got.status == "kept"
    assert got.source == "user_reworded"
    assert got.unusable is False
    assert got.original_text == "No"
    # Stored bare — the prose module adds the full stop back.
    assert got.text == "Staff engineer at a product company"
    # And a reworded line CAN then be kept, because the user just wrote it.
    assert ops.keep(order, bad.id, now=NOW)[1] is not None


def test_undo_restores_unanswered_rather_than_the_other_answer():
    guess = line(status="unanswered")
    order, entry = ops.drop(ops.Order(lines=[guess]), guess.id, now=NOW)
    assert order.find(guess.id).status == "dropped"
    restored = ops.undo(order, entry.id)
    assert restored.find(guess.id).status == "unanswered"
    assert restored.log == []


def test_undo_of_an_add_removes_the_line_outright():
    order, entry = ops.add(ops.Order(), kind="wont_take", text="Companies over 5,000 people")
    assert len(order.lines) == 1
    assert ops.undo(order, entry.id).lines == []


# ── importing ────────────────────────────────────────────────────────────────


def brief(profile=None, facts=()) -> TargetingBrief:
    return TargetingBrief(profile=profile or {}, facts=[MemoryFact(k, t) for k, t in facts])


def test_every_imported_guess_carries_a_source():
    guesses = memory_import.guesses_from(
        brief(facts=[("constraint", "No large corporations"), ("preference", "Prefers corporate functions")])
    )
    assert guesses
    for guess in guesses:
        assert guess.source
        assert guess.source_note, f"{guess.text} reached the screen with no attribution"


def test_a_junk_stored_answer_is_flagged_unusable_not_run():
    # The prod case: a career_goal of "No" printed as "You're heading for No."
    guesses = memory_import.guesses_from(brief(profile={"career_goal": "No"}))
    goal = next(g for g in guesses if g.kind == "goal")
    assert goal.unusable is True
    assert goal.status == "unanswered"
    assert "reword it or drop it" in goal.source_note


def test_a_soft_note_is_marked_soft_rather_than_filed_as_a_hard_no():
    guesses = memory_import.guesses_from(brief(facts=[("constraint", "Would rather avoid agency work")]))
    assert guesses[0].soft is True


def test_a_stored_wont_take_is_kept_not_re_asked():
    confirmed = memory_import.confirmed_from(brief(profile={"deal_breakers": ["No relocation"]}))
    assert [(c.status, c.text, c.source) for c in confirmed] == [("kept", "relocation", "user_said")]


def test_imported_ids_are_stable_across_reads():
    # A uuid minted per read would change between the GET that rendered a guess
    # and the PATCH that answers it, so every yes would 404.
    facts = [("constraint", "No large corporations")]
    first = memory_import.guesses_from(brief(facts=facts))
    second = memory_import.guesses_from(brief(facts=facts))
    assert [x.id for x in first] == [x.id for x in second]


def test_merge_keeps_the_users_answer_over_a_re_import():
    facts = [("constraint", "No large corporations")]
    imported = memory_import.guesses_from(brief(facts=facts))
    answered, _ = ops.keep(ops.Order(lines=imported), imported[0].id, now=NOW)
    merged = ops.merge_imports(answered, memory_import.guesses_from(brief(facts=facts)))
    assert len(merged.lines) == 1
    assert merged.lines[0].status == "kept"


def test_merge_stops_asking_about_a_note_the_user_deleted():
    imported = memory_import.guesses_from(brief(facts=[("constraint", "No large corporations")]))
    stored = ops.Order(lines=imported)
    assert ops.merge_imports(stored, []).lines == []
    # But an ANSWERED line is the user's now, and stays.
    answered, _ = ops.drop(stored, imported[0].id, now=NOW)
    assert len(ops.merge_imports(answered, []).lines) == 1


def test_rounds_group_by_kind_and_keep_answered_lines_in_their_round():
    order = ops.Order(
        lines=[
            line(kind="wont_take", status="kept"),
            line(kind="wont_take", status="unanswered"),
            line(kind="lean", text="Corporate functions"),
            line(kind="goal", text="Staff engineer", origin="cv_import", source="user_said"),
        ]
    )
    rounds = {r["key"]: r["line_ids"] for r in ops.rounds(order)}
    assert len(rounds["wont"]) == 2, "the tally reads answered / total — answered lines stay"
    assert len(rounds["drawn"]) == 1
    assert len(rounds["about"]) == 1
    # A line the user set themselves is not a guess.
    settled = ops.Order(lines=[line(kind="wont_take", origin="preflight", source="user_said", status="kept")])
    assert ops.rounds(settled) == []


# ── proposals ────────────────────────────────────────────────────────────────


def test_a_topic_proposes_a_diff_against_the_saved_order():
    order = ops.Order(lines=[line(kind="wont_take", text="Senior management roles", status="kept")])
    proposal = proposals.from_topic("the level", order)
    ops_taken = {(e.op, e.kind) for e in proposal.effects}
    assert ("drop", None) in ops_taken, "the level topic must strike the line capping it"
    assert ("add", "lean") in ops_taken
    assert proposal.costly is True, "widening needs a fresh scan"


def test_a_topic_with_nothing_to_strike_does_not_quote_a_re_run_cost():
    # Charging for a scan that isn't happening is how a "free" promise and a
    # debit end up on the same screen.
    proposal = proposals.from_topic("the level", ops.Order())
    assert proposal.costly is False
    assert all(e.op == "add" for e in proposal.effects)


def test_narrowing_topics_are_free():
    for topic in ("the work", "the place", "the pay"):
        assert proposals.from_topic(topic, ops.Order()).costly is False


@pytest.mark.parametrize(
    "text,topic",
    [
        ("these are all too junior", "the level"),
        ("the pay is too low", "the pay"),
        ("I'd rather not commute across the city", "the place"),
        ("too many big-corp roles", "the work"),
    ],
)
def test_free_text_routes_to_the_nearest_topic(text, topic):
    assert proposals.route(text) == topic


def test_an_unroutable_complaint_is_saved_verbatim_and_says_so():
    # Guessing at an unmatched sentence is how a gripe about pay becomes a
    # location filter.
    proposal = proposals.from_free_text("no more ghost listings please", ops.Order())
    assert proposal.effects[0].text == "no more ghost listings please"
    assert "exactly as you typed it" in proposal.why
    assert proposal.costly is False


def test_a_proposal_already_on_the_order_is_not_proposed_back():
    order = ops.Order(lines=[line(kind="location", text="Bengaluru", status="kept")])
    built = proposals.from_utterance({"locations": ["Bengaluru"]}, order)
    assert built == []


def test_a_lean_rewrite_is_two_round_trips_not_two_per_lean():
    """`replace_authored_leans` ran inside POST /preflight/run. Deleting and
    inserting one row at a time meant a user with 19 confirmed leans paid 38
    sequential requests inside the call that starts their search — the client
    timed out at 15s, the user pressed Run again, and was charged again."""
    from app.services import onboarding_service

    calls: list[str] = []

    class FakeRepo:
        def list_active(self, user_id, kinds=None):
            return [{"id": f"m{i}", "text": f"lean {i}", "source": "authored"} for i in range(19)]

        def delete_many(self, user_id, ids):
            calls.append(f"delete_many:{len(ids)}")

        def add_many(self, user_id, rows, **kw):
            calls.append(f"add_many:{len(rows)}")

        def delete(self, *a, **kw):  # pragma: no cover — must not be reached
            calls.append("delete")

        def add(self, *a, **kw):  # pragma: no cover — must not be reached
            calls.append("add")

    import app.repositories.user_memory as memory_module

    original = memory_module.UserMemoryRepository
    memory_module.UserMemoryRepository = lambda db: FakeRepo()  # type: ignore[assignment]
    try:
        onboarding_service.replace_authored_leans(object(), "u1", ["a", "b", "c"])
    finally:
        memory_module.UserMemoryRepository = original  # type: ignore[assignment]

    assert calls == ["delete_many:19", "add_many:3"]
    assert "delete" not in calls and "add" not in calls


def test_an_utterance_yields_one_proposal_per_field():
    built = proposals.from_utterance(
        {"locations": ["Remote-first roles, anywhere in India"],
         "deal_breakers": ["No people-management roles"],
         "seniority": "Senior IC tracks"},
        ops.Order(),
    )
    assert [p.eyebrow for p in built] == ["LOCATION", "WON'T TAKE", "DRAWN TO"]
    # Stored bare — "Skip No people-management roles" is the bug this prevents.
    assert built[1].value == "people-management roles"


# ── concurrent writes ────────────────────────────────────────────────────────


class _FakeTable:
    """Enough Postgrest to exercise the compare-and-set path."""

    def __init__(self, store: dict):
        self._store = store
        self._filters: dict = {}
        self._op = None
        self._payload = None

    def select(self, *a, **kw):
        self._op = "select"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, payload, **kw):
        self._op = "upsert"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def limit(self, *a, **kw):
        return self

    def execute(self):
        row = self._store.get("row")
        if self._op == "select":
            return type("R", (), {"data": [row] if row else [], "count": 0})()
        if self._op == "upsert":
            self._store["row"] = dict(self._payload)
            return type("R", (), {"data": [self._store["row"]]})()
        # update — honours the updated_at guard
        if row and row.get("updated_at") == self._filters.get("updated_at"):
            row.update(self._payload)
            return type("R", (), {"data": [row]})()
        return type("R", (), {"data": []})()


class _FakeDB:
    def __init__(self):
        self.store: dict = {}

    def table(self, name):
        return _FakeTable(self.store)


def _repo_with_empty_brief():
    """An OrderRepository whose imports and CV lookup are inert, so the test is
    about the write path and nothing else."""
    from app.services.preflight import repository as repo_module

    db = _FakeDB()
    repo = repo_module.OrderRepository(db)
    repo.store = db.store  # type: ignore[attr-defined]
    repo.load_bundle = lambda user_id: repo_module.OrderBundle(  # type: ignore[method-assign]
        order=ops.Order.from_dict(repo._row(user_id)),
        starters=[], memory_count=0, cv_readiness="ready",
    )
    return repo


def test_a_concurrent_answer_is_replayed_not_clobbered():
    """Two answers in flight both read the same `lines` array; without the
    guard the second write erases the first. Silently — the response looks
    right, the row is wrong, and the run dispatches from the row."""
    repo = _repo_with_empty_brief()
    a = line(id="a", text="A")
    b = line(id="b", text="B")
    repo.mutate("u1", lambda o: replace_lines(o, [a, b]))

    # Simulate a stale writer: capture the order, let another write land, then
    # try to write from the stale copy.
    stale = repo.load("u1")
    repo.mutate("u1", lambda o: ops.keep(o, "a", now=NOW)[0])
    assert repo._write("u1", stale, expected=stale.updated_at) is None, "stale write must be refused"

    # And the retrying path still lands, on top of the other answer.
    repo.mutate("u1", lambda o: ops.drop(o, "b", now=NOW)[0])
    final = repo.load("u1")
    assert final.find("a").status == "kept", "the first answer survived"
    assert final.find("b").status == "dropped", "the second answer landed"


def replace_lines(order: ops.Order, lines: list) -> ops.Order:
    import dataclasses
    return dataclasses.replace(order, lines=lines)


def test_a_recent_run_is_reported_instead_of_charged_again():
    from datetime import datetime, timedelta, timezone

    repo = _repo_with_empty_brief()
    repo.mutate("u1", lambda o: o)
    assert repo.recent_run("u1", within_seconds=90) is None, "no run yet"

    repo.save("u1", repo.load("u1"), ticket_id="tick-1")
    assert repo.recent_run("u1", within_seconds=90) == "tick-1"

    # Outside the window it is a genuine second search, not a double click.
    repo.store["row"]["last_run_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=600)
    ).isoformat()
    assert repo.recent_run("u1", within_seconds=90) is None
