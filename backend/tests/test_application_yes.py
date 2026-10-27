"""The Application Yes — the person's own statement that they sent a job's application.

CONTEXT.md → Application Yes. Five doors used to write it four ways: the tracker
and the filing receipt did the full set, hosted Apply here skipped the CV, the
judge and the door, and a logged job or a `saved → interviewing` drag wrote no
`applied_at` at all, so the north star missed them. These lock the one writer.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.schemas.jobs import APPLICATION_STATUSES
from app.services import application_yes


class _Repo:
    """The three JobsRepository calls the writer makes, over one application row."""

    def __init__(self, row: dict[str, Any] | None) -> None:
        self.row = dict(row) if row is not None else None
        self.writes: list[dict[str, Any]] = []
        self.answered: list[str] = []

    def get_application_with_job(self, _uid: str, _job_id: str) -> dict[str, Any] | None:
        return dict(self.row) if self.row is not None else None

    def upsert_application(self, _uid: str, _job_id: str, updates: dict[str, Any]) -> None:
        self.writes.append(dict(updates))
        self.row = {**(self.row or {}), **updates}

    def answer_apply_intents(self, _uid: str, job_id: str) -> None:
        self.answered.append(job_id)


class _Tasks:
    def __init__(self) -> None:
        self.queued: list[tuple[Any, tuple[Any, ...]]] = []

    def add_task(self, fn: Any, *args: Any) -> None:
        self.queued.append((fn, args))


@pytest.fixture
def effects(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    seen: dict[str, list[Any]] = {"cv": [], "judge": [], "door": []}
    monkeypatch.setattr(
        application_yes.cv_of_record,
        "record_on_apply",
        lambda uid, jid, *, since: seen["cv"].append((jid, since)),
    )
    monkeypatch.setattr(
        application_yes.on_demand, "open_job_eval", lambda _r, _uid, jid: seen["judge"].append(jid)
    )
    monkeypatch.setattr(
        application_yes.core_loop, "record_step", lambda *a: seen["door"].append(a)
    )
    return seen


def _run(tasks: _Tasks) -> None:
    for fn, args in tasks.queued:
        fn(*args)


def _move(repo: _Repo, stage: str, door: str | None = "collections", **fields: Any):
    tasks = _Tasks()
    moved = application_yes.move(
        repo, tasks, user_id="u1", job_id="j1", stage=stage, door=door, fields=fields or None
    )
    _run(tasks)
    return moved


def _say_yes(repo: _Repo, door: str, **fields: Any):
    tasks = _Tasks()
    moved = application_yes.say_yes(
        repo, tasks, user_id="u1", job_id="j1", door=door, fields=fields or None
    )
    _run(tasks)
    return moved


def test_sent_stages_are_every_stage_past_saved() -> None:
    assert application_yes.SENT_STAGES == frozenset(APPLICATION_STATUSES - {"saved"})


def test_the_first_yes_does_everything_a_first_yes_entails(effects) -> None:
    repo = _Repo({"status": "saved", "applied_at": None})

    moved = _move(repo, "applied", door="extension")

    assert moved.yes is True and moved.withdrawn is False
    stamped = repo.row["applied_at"]
    assert stamped is not None
    assert repo.row["status"] == "applied"
    assert repo.row["last_stage_changed_at"] == stamped
    assert repo.answered == ["j1"]
    assert effects["cv"] == [("j1", stamped)]
    assert effects["judge"] == ["j1"]
    assert effects["door"] == [("u1", "j1", "applied", "extension")]


def test_a_second_yes_is_not_a_second_application(effects) -> None:
    repo = _Repo({"status": "applied", "applied_at": "2026-10-01T00:00:00+00:00"})

    moved = _move(repo, "applied")

    assert moved.yes is False
    assert repo.row["applied_at"] == "2026-10-01T00:00:00+00:00"
    assert effects == {"cv": [], "judge": [], "door": []}


def test_skipping_straight_to_interviewing_is_a_yes(effects) -> None:
    """A sent stage implies the Yes. The drag used to write no applied_at, so the
    north star never saw the person reach the stage the product exists for."""
    repo = _Repo({"status": "saved", "applied_at": None})

    moved = _move(repo, "interviewing", door="tracker")

    assert moved.yes is True
    assert repo.row["status"] == "interviewing"
    assert repo.row["applied_at"] is not None
    assert effects["door"] == [("u1", "j1", "applied", "tracker")]


def test_sent_stays_sent_as_the_stage_moves_on(effects) -> None:
    repo = _Repo({"status": "applied", "applied_at": "2026-10-01T00:00:00+00:00"})

    for stage in ("interviewing", "ghosted", "rejected", "offer"):
        moved = _move(repo, stage)
        assert moved.yes is False and moved.withdrawn is False
        assert repo.row["applied_at"] == "2026-10-01T00:00:00+00:00"
    assert effects == {"cv": [], "judge": [], "door": []}


def test_back_to_saved_withdraws_the_yes(effects) -> None:
    """The person is saying they did not send it."""
    repo = _Repo({"status": "interviewing", "applied_at": "2026-10-01T00:00:00+00:00"})

    moved = _move(repo, "saved")

    assert moved.withdrawn is True and moved.yes is False
    assert repo.row["applied_at"] is None
    assert repo.row["status"] == "saved"
    assert repo.answered == []
    assert effects == {"cv": [], "judge": [], "door": []}


def test_a_yes_after_a_withdrawal_freezes_a_fresh_cv(effects) -> None:
    repo = _Repo({"status": "applied", "applied_at": "2026-10-01T00:00:00+00:00"})

    _move(repo, "saved")
    moved = _move(repo, "applied", door="cv_export")

    assert moved.yes is True
    assert effects["cv"] == [("j1", repo.row["applied_at"])]


def test_the_stage_clock_moves_only_when_the_stage_does(effects) -> None:
    repo = _Repo({"status": "applied", "applied_at": "2026-10-01T00:00:00+00:00"})

    _move(repo, "applied", notes="called the recruiter")

    assert "last_stage_changed_at" not in repo.writes[-1]
    assert repo.writes[-1]["notes"] == "called the recruiter"


def test_a_door_that_only_knows_it_was_sent_records_applied(effects) -> None:
    """Hosted Apply here: the intern apply page IS the submit."""
    repo = _Repo(None)

    moved = _say_yes(repo, application_yes.DOOR_HOSTED, source="user_discovery")

    assert moved.yes is True
    assert repo.row["status"] == "applied"
    assert repo.row["source"] == "user_discovery"
    assert effects["door"] == [("u1", "j1", "applied", "hosted")]
    assert effects["judge"] == ["j1"] and len(effects["cv"]) == 1


def test_a_yes_door_never_moves_the_stage_backwards(effects) -> None:
    """A filing receipt landing after the person reached Interviewing."""
    repo = _Repo({"status": "interviewing", "applied_at": None})

    moved = _say_yes(repo, application_yes.DOOR_FILING)

    assert moved.yes is True
    assert repo.row["status"] == "interviewing"
    assert repo.row["applied_at"] is not None


def test_a_logged_job_already_at_applied_gets_its_yes(effects) -> None:
    """An import writes the stage the person picked. The Yes follows it."""
    repo = _Repo({"status": "applied", "applied_at": None})

    moved = _say_yes(repo, application_yes.DOOR_LOGGED)

    assert moved.yes is True
    assert moved.applied_at == repo.row["applied_at"]
    assert effects["door"] == [("u1", "j1", "applied", "logged")]


def test_a_repeated_yes_door_queues_nothing(effects) -> None:
    repo = _Repo({"status": "applied", "applied_at": "2026-10-01T00:00:00+00:00"})

    moved = _say_yes(repo, application_yes.DOOR_FILING)

    assert moved.yes is False
    assert effects == {"cv": [], "judge": [], "door": []}


# ── the forward pass's cheap check ──────────────────────────────────────────


class _Query:
    def __init__(self, rows: list[dict[str, Any]], log: list[tuple[str, Any]]) -> None:
        self._rows = rows
        self._log = log

    def select(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self._log.append(("eq", (column, value)))
        return self

    @property
    def not_(self) -> "_Query":
        self._log.append(("not", None))
        return self

    def is_(self, column: str, value: Any) -> "_Query":
        self._log.append(("is", (column, value)))
        return self

    def in_(self, column: str, values: list[str]) -> "_Query":
        self._rows = [r for r in self._rows if str(r.get(column)) in set(values)]
        return self

    def limit(self, *_a: Any) -> "_Query":
        return self

    def execute(self) -> Any:
        return type("R", (), {"data": self._rows})()


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self.tables = tables
        self.log: dict[str, list[tuple[str, Any]]] = {}

    def table(self, name: str) -> _Query:
        return _Query(list(self.tables.get(name, [])), self.log.setdefault(name, []))


def test_unrated_yeses_are_the_ones_the_judge_can_still_rate() -> None:
    db = _DB({
        "job_applications": [
            {"job_id": "rated"}, {"job_id": "unrated"}, {"job_id": "settled"}, {"job_id": "gone"},
        ],
        "user_job_matches": [
            {"job_id": "rated", "overall_score": 4.2, "eval_outcome": None},
            {"job_id": "settled", "overall_score": None, "eval_outcome": "invalid_input"},
        ],
        "jobs": [{"job_id": "rated"}, {"job_id": "unrated"}, {"job_id": "settled"}],
    })

    assert application_yes.unrated_yes_job_ids(db, "u1") == ["unrated"]
    # Only Yeses are read: applied_at is set, whatever the stage says.
    assert ("is", ("applied_at", "null")) in db.log["job_applications"]
    assert ("not", None) in db.log["job_applications"]


def test_no_yes_reads_nothing_else() -> None:
    db = _DB({"job_applications": []})

    assert application_yes.unrated_yes_job_ids(db, "u1") == []
    assert "user_job_matches" not in db.log
