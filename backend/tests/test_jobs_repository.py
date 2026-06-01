from __future__ import annotations

from typing import Any

from app.repositories.jobs import JobsRepository


class _FakeQuery:
    def __init__(self, tape: dict[str, Any], rows: list[dict[str, Any]] | None = None) -> None:
        self._tape = tape
        self._rows = rows or []
        self.data: list[dict[str, Any]] = []

    def upsert(self, payload: dict[str, Any], on_conflict: str) -> "_FakeQuery":
        self._tape["payload"] = payload
        self._tape["on_conflict"] = on_conflict
        return self

    def select(self, value: str) -> "_FakeQuery":
        self._tape["select"] = value
        return self

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        self._tape.setdefault("eq", []).append((key, value))
        self._rows = [row for row in self._rows if row.get(key) == value]
        return self

    def execute(self) -> "_FakeQuery":
        self._tape["executed"] = True
        self.data = self._rows
        return self


class _FakeDB:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.tape: dict[str, Any] = {}
        self._rows = rows or []

    def table(self, name: str) -> _FakeQuery:
        self.tape["table"] = name
        return _FakeQuery(self.tape, list(self._rows))


def test_upsert_job_match_uses_weekly_conflict_key() -> None:
    user_db = _FakeDB()
    admin_db = _FakeDB()
    repo = JobsRepository(user_db, admin_db)  # type: ignore[arg-type]

    repo.upsert_job_match(
        user_id="user-1",
        job_id="job-1",
        data={
            "batch_week": "2026-05-26",
            "overlap_score": 88.0,
        },
    )

    assert admin_db.tape["table"] == "user_job_matches"
    assert admin_db.tape["on_conflict"] == "user_id,job_id,batch_week"
    assert admin_db.tape["payload"]["batch_week"] == "2026-05-26"
    assert admin_db.tape["executed"] is True


def test_get_user_match_stack_keeps_old_matches_under_new_refreshes() -> None:
    rows = [
        {
            "id": 1,
            "user_id": "user-1",
            "job_id": "old-job",
            "batch_week": "2026-05-25",
            "computed_at": "2026-05-25T10:00:00+00:00",
            "llm_rank": 1,
            "jobs": {"location": "Bengaluru, India"},
        },
        {
            "id": 2,
            "user_id": "user-1",
            "job_id": "repeat-job",
            "batch_week": "2026-05-25",
            "computed_at": "2026-05-25T10:00:00+00:00",
            "llm_rank": 2,
            "jobs": {"location": "Remote"},
        },
        {
            "id": 3,
            "user_id": "user-1",
            "job_id": "fresh-job",
            "batch_week": "2026-06-01",
            "computed_at": "2026-06-01T09:00:00+00:00",
            "llm_rank": 1,
            "jobs": {"location": "Mumbai, India"},
        },
        {
            "id": 4,
            "user_id": "user-1",
            "job_id": "repeat-job",
            "batch_week": "2026-06-01",
            "computed_at": "2026-06-01T09:00:00+00:00",
            "llm_rank": 2,
            "jobs": {"location": "Remote"},
        },
    ]
    repo = JobsRepository(_FakeDB(rows), _FakeDB())  # type: ignore[arg-type]

    stack = repo.get_user_match_stack("user-1")

    assert [row["job_id"] for row in stack] == ["fresh-job", "repeat-job", "old-job"]
    assert [row["batch_week"] for row in stack] == ["2026-06-01", "2026-06-01", "2026-05-25"]
