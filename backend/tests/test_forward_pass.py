"""The forward pass — how a returning user gets the platform we have now.

Myro does not backfill, so every one of these is about a user who came back:
what brings them forward, what must never fire twice, and what must never be
paid for on the read path they are waiting on.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.services import career_reservoir, forward_pass


class _Result:
    def __init__(self, data: list[dict[str, Any]]):
        self.data = data


class _Query:
    """Enough PostgREST to answer the two existence questions a pass asks."""

    def __init__(self, db: "_Db", table: str):
        self._db = db
        self._table = table
        self._filters: dict[str, Any] = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._filters[f"{col}__in"] = vals
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        self._db.queries.append((self._table, dict(self._filters)))
        return _Result(self._db.rows.get(self._table, []))


class _Db:
    def __init__(self, rows: dict[str, list[dict[str, Any]]]):
        self.rows = rows
        self.queries: list[tuple[str, dict]] = []

    def table(self, name: str):
        return _Query(self, name)


BASELINE_TEXT = "Ten years of procurement work. " * 20


@pytest.fixture
def wired(monkeypatch):
    """A user with a real baseline and nothing banked, and a won claim."""
    banked: list[dict[str, Any]] = []
    db = _Db({
        "cv_dump_entries": [],
        "cv_versions": [{"id": 41, "body_text": BASELINE_TEXT}],
    })
    monkeypatch.setattr(forward_pass.debounce, "claim", lambda key, ttl: True)
    import app.database as database_mod
    monkeypatch.setattr(database_mod, "get_supabase_admin", lambda: db)
    monkeypatch.setattr(
        career_reservoir, "bank_uploaded_cv",
        lambda uid, text, vid, *, source: banked.append(
            {"user": uid, "text": text, "version": vid, "source": source}
        ) or "e1",
    )
    return db, banked


def test_a_returning_user_with_an_unbanked_cv_is_brought_forward(wired):
    db, banked = wired
    assert forward_pass.bank_existing_baseline("u1") is True
    assert banked[0]["user"] == "u1"
    assert banked[0]["version"] == 41
    # Its own source, so the ledger can answer "how many did we bring forward".
    assert banked[0]["source"] == career_reservoir.BASELINE_BANK_SOURCE


def test_a_user_who_already_banked_is_left_alone(monkeypatch, wired):
    db, banked = wired
    db.rows["cv_dump_entries"] = [{"id": "already"}]
    assert forward_pass.bank_existing_baseline("u1") is False
    assert banked == []


def test_a_hand_dumped_cv_counts_as_already_forward(monkeypatch, wired):
    """The inflow ledger IS the record the pass ran — every door leaves a row,
    so someone who dumped their CV themselves is not asked to do it twice."""
    db, _banked = wired
    forward_pass.bank_existing_baseline("u1")
    ledger_query = next(q for t, q in db.queries if t == "cv_dump_entries")
    assert "reservoir_dump" in ledger_query["source__in"]
    assert "onboarding_cv" in ledger_query["source__in"]


def test_the_claim_gates_everything_before_a_single_query(monkeypatch):
    """A polled or repeated read must not become N jobs — and must not become
    N database round trips either."""
    db = _Db({"cv_dump_entries": [], "cv_versions": []})
    import app.database as database_mod
    monkeypatch.setattr(database_mod, "get_supabase_admin", lambda: db)
    monkeypatch.setattr(forward_pass.debounce, "claim", lambda key, ttl: False)
    assert forward_pass.bank_existing_baseline("u1") is False
    assert db.queries == []


def test_a_user_with_no_baseline_is_not_invented_one(monkeypatch, wired):
    db, banked = wired
    db.rows["cv_versions"] = []
    assert forward_pass.bank_existing_baseline("u1") is False
    assert banked == []


def test_a_failed_parse_is_not_a_career(monkeypatch, wired):
    db, banked = wired
    db.rows["cv_versions"] = [{"id": 41, "body_text": "Resume"}]
    assert forward_pass.bank_existing_baseline("u1") is False
    assert banked == []


def test_a_broken_pass_never_touches_the_read_it_rode_in_on(monkeypatch):
    monkeypatch.setattr(forward_pass.debounce, "claim", lambda key, ttl: True)
    import app.database as database_mod

    def _boom():
        raise RuntimeError("postgrest is down")

    monkeypatch.setattr(database_mod, "get_supabase_admin", _boom)
    assert forward_pass.bank_existing_baseline("u1") is False
    forward_pass.on_cv_read("u1")  # must not raise


def test_one_bad_pass_does_not_stop_the_others(monkeypatch):
    ran: list[str] = []

    def _bad(_uid):
        raise RuntimeError("nope")

    monkeypatch.setattr(
        forward_pass, "PASSES",
        (("bad", _bad), ("good", lambda uid: ran.append(uid))),
    )
    forward_pass.on_cv_read("u1")
    assert ran == ["u1"]


def test_a_forward_passed_cv_is_the_users_own_document():
    """The trap that would have silently eaten every one of them.

    The foreign-document guard judges on the profile name plus the baseline's
    contact block, and at bank time that baseline's `cv_structured` may be null
    — so one token mismatch reads as `foreign` and the CV is dropped in silence.
    A bulk dump can carry someone else's CV. A document we ourselves stored for
    this user cannot.
    """
    assert career_reservoir.BASELINE_BANK_SOURCE in career_reservoir.OWN_CV_SOURCES
    assert career_reservoir.ONBOARDING_CV_SOURCE in career_reservoir.OWN_CV_SOURCES
    assert "reservoir_dump" not in career_reservoir.OWN_CV_SOURCES


def test_every_registered_pass_is_callable_with_just_a_user_id():
    for name, run in forward_pass.PASSES:
        assert callable(run), name


def test_a_gap_answer_does_not_count_as_a_banked_cv(wired):
    """`e91eef0b` built a whole reservoir from three gap answers and no upload.

    Those stories are real, but their CV has still never been banked — so they
    ARE behind on the bridge and the pass must fire. The stories that arrive are
    deduped by `story_identity`, and `pick_keep` prefers the told row, so the
    answers they typed still beat the CV lines the bridge lifts.
    """
    db, banked = wired
    db.rows["cv_dump_entries"] = []
    forward_pass.bank_existing_baseline("u1")
    ledger_query = next(q for t, q in db.queries if t == "cv_dump_entries")
    assert "jd_gap_answer" not in ledger_query["source__in"]
    assert banked, "a gap-answer user is still owed their CV"


def test_a_bucket_primary_is_promoted_on_the_next_visit(monkeypatch) -> None:
    profile = {
        "target_role_titles": ["Scripting Languages", "Software Development"],
        "target_roles": ["Scripting Languages", "Software Development"],
        "target_role_title": "Scripting Languages",
    }
    saved: list[dict[str, Any]] = []
    monkeypatch.setattr(forward_pass.debounce, "claim", lambda *_a, **_k: True)
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())

    def _save(_db: Any, user_id: str, **kwargs: Any) -> None:
        assert user_id == "u1"
        saved.append(kwargs)

    monkeypatch.setattr("app.services.onboarding_service.save_target", _save)
    forward_pass.on_profile_read("u1", profile)

    assert saved == [{
        "role_titles": ["Scripting Languages", "Software Development"],
        "role_families": ["Scripting Languages", "Software Development"],
    }]
    assert profile["target_role_title"] == "Software Development"
    assert profile["target_role_titles"][0] == "Software Development"
    assert profile["target_roles"][0] == "Software Development"


def test_a_real_primary_does_not_touch_the_write_path(monkeypatch) -> None:
    profile = {
        "target_role_titles": ["Software Development", "Scripting Languages"],
        "target_roles": ["Software Development", "Scripting Languages"],
    }
    monkeypatch.setattr(
        "app.services.onboarding_service.save_target",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("write path")),
    )
    forward_pass.on_profile_read("u1", profile)
    assert profile["target_role_titles"][0] == "Software Development"


def test_a_lone_bucket_is_left_alone(monkeypatch) -> None:
    profile = {"target_role_titles": ["Scripting Languages"]}
    monkeypatch.setattr(
        "app.services.onboarding_service.save_target",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("write path")),
    )
    forward_pass.on_profile_read("u1", profile)
    assert profile["target_role_titles"] == ["Scripting Languages"]
