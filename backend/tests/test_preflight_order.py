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
    # An unanswered goal is not a goal — and it is not a CLEARED goal either.
    # This asserted `is None` until 2026-08-25, which is the destructive
    # behaviour itself: `None` reached `update_profile` and NULLed a stored
    # career_goal the user had never answered. Absent omits the key.
    assert "career_goal" not in body
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
    # Vacuous against the old singular key after the 2026-08-28 rename — the
    # slot is `target_locations` now, and that is what must stay absent.
    assert "target_locations" not in body


def test_a_pay_floor_reaches_the_matcher_in_the_users_own_words():
    """This asserted `["Below ₹45L total comp"]` until 2026-08-28.

    `spec` is the PATCH body, so that prefix was persisted, re-seeded by
    `memory_import` as a `wont_take` line on the next open, and would have
    grown another "Below" on the run after that.

    Accepted trade, stated rather than hidden: the deal-breakers list reaches
    the brain as flat prose with no kind attached, so dropping the word costs
    one signal that this constraint is a floor. It is worth it — the screen
    still says PAY FLOOR on the plate, and a value that mutates every time it
    is read is a worse problem than a slightly thinner prompt line. If the
    prompt needs the word back it belongs at the prompt seam, not in storage.
    """
    order = ops.Order(lines=[line(kind="pay_floor", text="₹45L total comp", status="kept")])
    assert payload.project(order)["deal_breakers"] == ["₹45L total comp"]


def test_a_reseeded_pay_floor_collapses_instead_of_duplicating():
    """Why raw text fixes the round trip rather than just hiding a word.

    `pay_floor` and `wont_take` file to the SAME slot, so once both carry the
    user's own words they normalise to one dedupe key. The prod order that held
    both "less than 30 lakhs" and "Below less than 30 lakhs" heals on its next
    run.
    """
    order = ops.Order(lines=[
        line(kind="pay_floor", text="less than 30 lakhs", status="kept"),
        line(kind="wont_take", text="less than 30 lakhs", status="kept"),
    ])
    assert payload.project(order)["deal_breakers"] == ["less than 30 lakhs"]


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


def test_import_dedupes_the_same_statement_across_kinds():
    guesses = memory_import.guesses_from(
        brief(
            facts=[
                ("work_mode", "Prefers onsite work"),
                ("preference", "Prefers onsite work"),
                ("preference", "Prefers corporate functions"),
            ]
        )
    )
    texts = {(g.kind, g.text) for g in guesses}
    assert ("wont_take", "Prefers onsite work") in texts
    assert ("lean", "Prefers onsite work") not in texts
    assert ("lean", "Prefers corporate functions") in texts


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


def test_the_gate_extracts_it_does_not_interview():
    # The interview prompt asks one question per reply. That question has no
    # yes/no on this screen, so it cannot be closed. extract=True is the switch.
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "app/routers/preflight.py").read_text()
    assert "extract=True" in src


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


# ── how many questions a screen may ask ──────────────────────────────────────


def _brief(facts):
    from app.services.matching.targeting import MemoryFact, TargetingBrief

    return TargetingBrief(
        profile={}, facts=[MemoryFact(kind=k, text=t) for k, t in facts]
    )


def test_guesses_never_exceed_the_slot_that_would_hold_them():
    """One prod order held 53 lines and 37 rejections. `brief.facts` is uncapped
    — the 8-fact cap in `targeting` is the ranking prompt's — so a user with 66
    notes met about forty questions in slots that hold six. Proposing twenty
    into a six-slot budget guarantees fourteen rejections whatever they want."""
    from app.services.preflight import memory_import

    brief = _brief(
        [("constraint", f"no thing {i}") for i in range(20)]
        + [("preference", f"likes {i}") for i in range(15)]
    )
    guesses = memory_import.guesses_from(brief)
    assert sum(1 for g in guesses if g.kind == "wont_take") == 6
    assert sum(1 for g in guesses if g.kind == "lean") == 6


def test_the_cap_is_read_from_the_resolver_not_picked():
    """A number typed here would drift from the slot it is protecting."""
    from app.services.preflight import memory_import, spec

    brief = _brief([("constraint", f"no thing {i}") for i in range(30)])
    kept = sum(1 for g in memory_import.guesses_from(brief) if g.kind == "wont_take")
    assert kept == spec.SLOT_ARITY["deal_breakers"]


def test_a_note_said_more_than_once_wins_the_budget():
    """Repetition is the only evidence of strength this module has: the
    distiller filing the same note twice means the user said it twice."""
    from app.services.preflight import memory_import

    brief = _brief(
        [("constraint", f"filler {i}") for i in range(6)]
        + [("constraint", "no night shifts"), ("constraint", "no night shifts")]
    )
    texts = [g.text for g in memory_import.guesses_from(brief) if g.kind == "wont_take"]
    assert "night shifts" in texts


def test_capping_does_not_reshuffle_what_survives():
    """The ranking decides WHICH guesses survive, never where they sit — a
    screen that reorders itself between opens is one the user cannot learn."""
    from app.services.preflight import memory_import

    brief = _brief([("constraint", f"no thing {i}") for i in range(10)])
    texts = [g.text for g in memory_import.guesses_from(brief) if g.kind == "wont_take"]
    assert texts == sorted(texts, key=lambda t: int(t.split()[-1]))


# ── a second search ──────────────────────────────────────────────────────────

_TWO_SEARCHES = {
    "add_roles": ["Consulting"],
    "second_search": {"label": "Marketing", "role_titles": ["Product Marketing Manager"]},
}


def test_a_second_search_is_never_proposed_behind_a_shut_gate():
    """`can_open` is false until the first search has produced a tailored CV.
    Proposing something the server will 409 is worse than not offering it — the
    user says yes and Myro appears to change its mind."""
    built = proposals.from_utterance(_TWO_SEARCHES, ops.Order(), can_open_track=False)
    assert all(p.eyebrow != "A SECOND SEARCH" for p in built)
    # …and the FIRST search is still proposed. A shut track gate must not
    # swallow the roles they actually named.
    assert [p.eyebrow for p in built] == ["THE WORK"]


def test_a_second_search_is_one_question_carrying_its_own_titles():
    built = proposals.from_utterance(_TWO_SEARCHES, ops.Order(), can_open_track=True)
    track = next(p for p in built if p.eyebrow == "A SECOND SEARCH")
    assert track.value == "Marketing"
    assert len(track.effects) == 1, "one question, not a form"
    effect = track.effects[0]
    assert effect.op == "open_track"
    assert effect.role_titles == ["Product Marketing Manager"]
    # Opening it scores nothing on its own — it runs on its own quota next time.
    assert track.costly is False


def test_open_track_carries_titles_through_the_wire_shape():
    built = proposals.from_utterance(_TWO_SEARCHES, ops.Order(), can_open_track=True)
    effect = next(p for p in built if p.eyebrow == "A SECOND SEARCH").effects[0].to_dict()
    assert effect["role_titles"] == ["Product Marketing Manager"]
    assert effect["kind"] is None, "a track is not a line kind"


def test_apply_ignores_an_open_track_effect_by_construction():
    """A track is created by `POST /tracks`, never by the order's apply loop.
    If one ever reaches apply it must be inert rather than half-applied — the
    loop acts on add and drop only."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "app/routers/preflight.py").read_text()
    # The apply-EFFECTS loop specifically — the file has more than one local
    # `apply`, and the others act on a single line id.
    body = src[src.index("for effect in body.effects:"):]
    body = body[: body.index("return _mutated")]
    assert 'effect.op == "drop"' in body
    assert 'effect.op == "add"' in body
    assert "open_track" not in body


def test_the_extract_prompt_says_when_two_searches_are_one():
    """88 of 106 users with a target set exactly ONE role title, and most of the
    18 who set more said one intent several ways. The prompt has to lean that
    way or every "Software Engineer / Full Stack" utterance opens a track."""
    from app.services.intent_chat_service import EXTRACT_TASK

    assert "second_search" in EXTRACT_TASK
    assert "When in doubt it is one search." in EXTRACT_TASK


def test_a_second_search_needs_both_a_label_and_titles():
    from app.services.intent_chat_service import _second_search

    assert _second_search({"label": "Marketing", "role_titles": []}) is None
    assert _second_search({"label": "", "role_titles": ["PMM"]}) is None
    assert _second_search("Marketing") is None
    assert _second_search({"label": " Marketing ", "role_titles": [" PMM ", ""]}) == {
        "label": "Marketing", "role_titles": ["PMM"],
    }


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
            # Counted: the write path's whole defect was how many of these one
            # tap issued.
            self._store["reads"] = self._store.get("reads", 0) + 1
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


def _write_path_repo():
    """An OrderRepository over a fake row store.

    Nothing is stubbed. A write reads the STORED row and nothing else — no
    profile, no `user_memory`, no CV count — which is the whole point of
    `load_stored`, so a fake DB with one table is enough to exercise it.
    """
    from app.services.preflight import repository as repo_module

    db = _FakeDB()
    repo = repo_module.OrderRepository(db)
    repo.store = db.store  # type: ignore[attr-defined]
    return repo


def test_a_write_reads_the_stored_row_and_nothing_else():
    """Answering one line used to re-read the profile, re-scan `user_memory`,
    re-import every note and count CV versions before touching the order — five
    sequential round trips at a ~165ms floor each. That is the 1.5-4.1s per tap
    in the 2026-08-21 logs."""
    repo = _write_path_repo()
    repo.mutate("u1", lambda o: replace_lines(o, [line(id="a", text="A")]))
    reads = repo.store.get("reads", 0)
    repo.mutate("u1", lambda o: ops.keep(o, "a", now=NOW)[0])
    assert repo.store.get("reads", 0) - reads == 1, "one read per write, not five"


def test_a_concurrent_answer_is_replayed_not_clobbered():
    """Two answers in flight both read the same `lines` array; without the
    guard the second write erases the first. Silently — the response looks
    right, the row is wrong, and the run dispatches from the row."""
    repo = _write_path_repo()
    a = line(id="a", text="A")
    b = line(id="b", text="B")
    repo.mutate("u1", lambda o: replace_lines(o, [a, b]))

    # Simulate a stale writer: capture the order, let another write land, then
    # try to write from the stale copy.
    stale = repo.load_stored("u1")
    repo.mutate("u1", lambda o: ops.keep(o, "a", now=NOW)[0])
    assert repo._write("u1", stale, expected=stale.updated_at) is None, "stale write must be refused"

    # And the retrying path still lands, on top of the other answer.
    repo.mutate("u1", lambda o: ops.drop(o, "b", now=NOW)[0])
    final = repo.load_stored("u1")
    assert final.find("a").status == "kept", "the first answer survived"
    assert final.find("b").status == "dropped", "the second answer landed"


def replace_lines(order: ops.Order, lines: list) -> ops.Order:
    import dataclasses
    return dataclasses.replace(order, lines=lines)


def test_a_recent_run_is_reported_instead_of_charged_again():
    from datetime import datetime, timedelta, timezone

    repo = _write_path_repo()
    repo.mutate("u1", lambda o: o)
    assert repo.recent_run("u1", within_seconds=90) is None, "no run yet"

    repo.save("u1", repo.load_stored("u1"), ticket_id="tick-1")
    assert repo.recent_run("u1", within_seconds=90) == "tick-1"

    # Outside the window it is a genuine second search, not a double click.
    repo.store["row"]["last_run_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=600)
    ).isoformat()
    assert repo.recent_run("u1", within_seconds=90) is None



def test_apply_accepts_a_full_proposal_screen() -> None:
    """The screen sends every accepted proposal's effects in one body. Cap 6
    was the slot-arity constant and 422'd a real yes-to-all (2026-08-18)."""
    from pydantic import ValidationError

    from app.routers.preflight import ApplyRequest

    effect = {"op": "add", "kind": "wont_take", "text": "x", "label": "new line · won't take"}
    ApplyRequest(effects=[effect] * 7, origin="preflight")
    ApplyRequest(effects=[effect] * 32, origin="preflight")
    with pytest.raises(ValidationError):
        ApplyRequest(effects=[effect] * 33, origin="preflight")


# ── the twin ─────────────────────────────────────────────────────────────────


def test_a_statement_already_on_the_order_is_not_re_imported_under_a_second_ref():
    """The prod defect behind `Won't take · 15 of 6`.

    A deal-breaker lives in `user_memory` as a distiller note AND, the moment a
    run projects it, in `user_profiles.deal_breakers`. The two imports hash
    different refs for one statement, so ref-only dedupe appended a twin on
    every read after the first run. On screen the twin rendered as a settled
    plate beside the conflict holding its original.
    """
    facts = [("constraint", "No large corporations")]
    guess = memory_import.guesses_from(brief(facts=facts))[0]
    answered, _ = ops.keep(ops.Order(lines=[guess]), guess.id, now=NOW)

    # Next read: the run has written the answer to the profile column, so the
    # same statement now arrives from BOTH stores under two different refs.
    reread = brief(profile={"deal_breakers": ["No large corporations"]}, facts=facts)
    candidates = memory_import.confirmed_from(reread) + memory_import.guesses_from(reread)
    assert len({c.ref for c in candidates}) == 2, "two stores, two refs — that is the setup"

    merged = ops.merge_imports(answered, candidates)
    # Stored bare: both importers strip the leading "No ".
    assert [x.text for x in merged.lines] == ["large corporations"]
    assert merged.lines[0].status == "kept", "the user's answer survives the re-import"

    # And it stays at one however many times the modal is opened.
    assert len(ops.merge_imports(merged, candidates).lines) == 1


def test_the_same_statement_in_two_slots_is_not_a_duplicate():
    """Cross-slot repeats are contradictions for the resolver to report — the
    importer must not silently swallow one half of the clash."""
    order = ops.Order(lines=[line(kind="wont_take", text="Large corporations", status="kept")])
    merged = ops.merge_imports(
        order, [line(kind="lean", text="Large corporations", status="unanswered")]
    )
    assert len(merged.lines) == 2
    assert payload.client_report(ops.keep(merged, merged.lines[1].id, now=NOW)[0])["conflicts"]


# ── the work ─────────────────────────────────────────────────────────────────


def test_stored_role_titles_arrive_as_kept_lines():
    """The slot that defines the search is imported like the two that narrow it.

    Without this every returning user opened the modal with "The work" empty —
    and the run still dispatched, on titles the modal had just declined to show.
    """
    confirmed = memory_import.confirmed_from(
        brief(profile={"target_role_titles": ["Enterprise Sales", "Account Executive"]})
    )
    roles = [c for c in confirmed if c.kind == "role"]
    assert [r.text for r in roles] == ["Enterprise Sales", "Account Executive"]
    assert all(r.status == "kept" and r.source == "user_said" for r in roles)
    # Titles only. `target_roles` is the matcher's derived read model; feeding it
    # back would put a cluster name on screen as a title the user never wrote.
    derived = memory_import.confirmed_from(brief(profile={"target_roles": ["General Sales Practices"]}))
    assert [c for c in derived if c.kind == "role"] == []


def test_the_projected_spec_carries_the_roles_on_screen():
    order = ops.Order(
        lines=[
            line(kind="role", text="Enterprise Sales", status="kept", origin="preflight", source="user_said"),
            line(kind="wont_take", text="Large corporations", status="kept"),
        ]
    )
    assert payload.project(order)["target_role_titles"] == ["Enterprise Sales"]


def _stub_brief(monkeypatch, facts):
    """Point the repository's targeting read at a fixed brief. Restored by
    pytest, so a leaked global cannot decide another test's imports."""
    from app.services.preflight import repository as repo_module

    fixed = brief(facts=facts)
    monkeypatch.setattr(repo_module.targeting, "for_preflight", lambda db, uid: fixed)
    monkeypatch.setattr(
        repo_module, "UsersRepository",
        lambda db: type("U", (), {"has_baseline_cv": lambda self, uid: True})(),
    )


def test_the_open_materialises_its_guesses_so_a_write_can_find_them(monkeypatch):
    """The guarantee the whole write path now rests on.

    A guess exists only in the MERGED order, so while writes re-imported on
    every call they could find it. Now they read the stored row — which means
    the open has to have written the guess down before the client is handed its
    id, or every yes 404s.
    """
    repo = _write_path_repo()
    _stub_brief(monkeypatch, [("constraint", "No large corporations")])

    guess = repo.load_bundle("u1").order.lines[0]
    assert guess.status == "unanswered"

    # The write reads the stored row alone and still finds it.
    stored = repo.load_stored("u1")
    assert stored.find(guess.id) is not None, "the guess was never written down"

    answered = repo.mutate("u1", lambda o: ops.keep(o, guess.id, now=NOW)[0])
    assert answered.find(guess.id).status == "kept"


def test_a_second_open_learns_nothing_and_writes_nothing(monkeypatch):
    """`merge_imports` is idempotent, so materialising costs one write on the
    open that actually learns something and nothing on every open after."""
    repo = _write_path_repo()
    _stub_brief(monkeypatch, [("constraint", "No large corporations")])

    repo.load_bundle("u1")
    stamped = repo.store["row"]["updated_at"]
    repo.load_bundle("u1")
    assert repo.store["row"]["updated_at"] == stamped, "a second open rewrote the row"


# ── seeding the order from the stored profile ────────────────────────────────


def test_every_stored_location_is_seeded_not_just_the_scalar():
    """The kept lines ARE what Run writes back.

    Seeding one city for a user who stored three did not merely under-report
    the search — opening the modal and pressing Run wrote the narrower list
    over the wider one. A delete disguised as a read.
    """
    confirmed = memory_import.confirmed_from(
        brief(profile={
            "target_location": "Mumbai",
            "target_locations": ["Mumbai", "Bengaluru", "Pune"],
        })
    )
    cities = [x.text for x in confirmed if x.kind == "location"]
    assert cities == ["Mumbai", "Bengaluru", "Pune"]


def test_a_profile_with_only_the_legacy_scalar_still_seeds():
    confirmed = memory_import.confirmed_from(brief(profile={"target_location": "Mumbai."}))
    assert [x.text for x in confirmed if x.kind == "location"] == ["Mumbai"]


def test_a_repeated_city_is_seeded_once():
    confirmed = memory_import.confirmed_from(
        brief(profile={"target_locations": ["Mumbai", "mumbai", "Bengaluru"]})
    )
    assert [x.text for x in confirmed if x.kind == "location"] == ["Mumbai", "Bengaluru"]


def test_seeded_location_ids_are_derived_from_the_city():
    """Per the order's invariant: an imported line's id comes from its source.

    A uuid minted per read changes between the GET that renders the line and
    the PATCH that answers it, so every yes 404s.
    """
    first = memory_import.confirmed_from(brief(profile={"target_locations": ["Mumbai", "Pune"]}))
    again = memory_import.confirmed_from(brief(profile={"target_locations": ["Mumbai", "Pune"]}))
    assert [x.id for x in first] == [x.id for x in again]
    assert len({x.id for x in first}) == len(first)
