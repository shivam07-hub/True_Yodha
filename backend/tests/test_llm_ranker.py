from __future__ import annotations

from datetime import date
from typing import Any

from app.services import llm_ranker


class _FakeQuery:
    def __init__(self, tape: dict[str, Any]) -> None:
        self._tape = tape

    def upsert(self, rows: list[dict[str, Any]], on_conflict: str) -> "_FakeQuery":
        self._tape["rows"] = rows
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


def test_persist_matches_upserts_on_weekly_unique_key() -> None:
    db = _FakeDB()

    written = llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[
            {"job_id": "job-1", "overlap_score": 82.0, "matched_skills": ["Python"]},
        ],
        ranked=[
            {"job_id": "job-1", "rank": 1, "explanation": "Strong fit."},
        ],
    )

    assert written == 1
    assert db.tape["table"] == "user_job_matches"
    assert db.tape["on_conflict"] == "user_id,job_id,batch_week"
    assert db.tape["executed"] is True


def test_persist_matches_dedupes_repeated_job_ids() -> None:
    db = _FakeDB()

    written = llm_ranker.persist_matches(
        db=db,  # type: ignore[arg-type]
        user_id="user-1",
        batch_week=date(2026, 5, 25),
        top_jobs=[
            {"job_id": "job-1", "overlap_score": 72.0, "matched_skills": ["Python"]},
            {"job_id": "job-1", "overlap_score": 88.0, "matched_skills": ["Python", "SQL"]},
            {"job_id": "job-2", "overlap_score": 61.0, "matched_skills": ["SQL"]},
        ],
        ranked=[
            {"job_id": "job-1", "rank": 1, "explanation": "High fit."},
            {"job_id": "job-2", "rank": 2, "explanation": "Good fit."},
        ],
    )

    assert written == 2
    rows = db.tape["rows"]
    assert len(rows) == 2
    by_job_id = {row["job_id"]: row for row in rows}
    assert by_job_id["job-1"]["overlap_score"] == 88.0
    assert by_job_id["job-1"]["matched_skills"] == ["Python", "SQL"]
    assert by_job_id["job-2"]["overlap_score"] == 61.0
