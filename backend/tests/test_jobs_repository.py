from __future__ import annotations

from typing import Any

from app.repositories.jobs import JobsRepository


class _FakeQuery:
    def __init__(self, tape: dict[str, Any]) -> None:
        self._tape = tape

    def upsert(self, payload: dict[str, Any], on_conflict: str) -> "_FakeQuery":
        self._tape["payload"] = payload
        self._tape["on_conflict"] = on_conflict
        return self

    def execute(self) -> "_FakeQuery":
        self._tape["executed"] = True
        return self


class _FakeDB:
    def __init__(self) -> None:
        self.tape: dict[str, Any] = {}

    def table(self, name: str) -> _FakeQuery:
        self.tape["table"] = name
        return _FakeQuery(self.tape)


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
