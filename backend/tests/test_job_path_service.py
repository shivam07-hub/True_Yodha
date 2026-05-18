import pytest
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services import job_path


class _Result:
    def __init__(self, data: Any):
        self.data = data


class _FakeQuery:
    def __init__(self, db: "_FakeDB", table: str):
        self.db = db
        self.table = table
        self.filters: list[tuple[str, str, Any]] = []
        self.order_field: str | None = None
        self.order_desc = False
        self.limit_count: int | None = None
        self.operation = "select"
        self.payload: dict[str, Any] | list[dict[str, Any]] | None = None

    def select(self, _columns: str) -> "_FakeQuery":
        return self

    def eq(self, field: str, value: Any) -> "_FakeQuery":
        self.filters.append(("eq", field, value))
        return self

    def gte(self, field: str, value: Any) -> "_FakeQuery":
        self.filters.append(("gte", field, value))
        return self

    def in_(self, field: str, values: list[Any]) -> "_FakeQuery":
        self.filters.append(("in", field, values))
        return self

    def order(self, field: str, desc: bool = False) -> "_FakeQuery":
        self.order_field = field
        self.order_desc = desc
        return self

    def limit(self, count: int) -> "_FakeQuery":
        self.limit_count = count
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> "_FakeQuery":
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "_FakeQuery":
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self) -> _Result:
        if self.operation == "insert":
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for row in rows:
                stored = dict(row or {})
                stored.setdefault("id", self.db.next_id(self.table))
                stored.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                self.db.tables.setdefault(self.table, []).append(stored)
                inserted.append(stored)
            return _Result(inserted)
        if self.operation == "update":
            updated = []
            for row in self._filtered_rows():
                row.update(dict(self.payload or {}))
                updated.append(row)
            return _Result(updated)
        return _Result(self._filtered_rows())

    def _filtered_rows(self) -> list[dict[str, Any]]:
        rows = list(self.db.tables.get(self.table, []))
        for op, field, value in self.filters:
            if op == "eq":
                rows = [row for row in rows if row.get(field) == value]
            elif op == "in":
                rows = [row for row in rows if row.get(field) in value]
            elif op == "gte":
                rows = [row for row in rows if str(row.get(field) or "") >= str(value)]
        if self.order_field:
            rows.sort(key=lambda row: str(row.get(self.order_field) or ""), reverse=self.order_desc)
        if self.limit_count is not None:
            rows = rows[: self.limit_count]
        return rows


class _FakeDB:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "jobs": [
                {
                    "job_id": "job-1",
                    "job_title": "Data Analyst",
                    "company_name": "Acme",
                    "job_description": "Use SQL to inspect product metrics.",
                    "apply_url": "https://example.com",
                }
            ],
            "job_skills": [
                {"job_id": "job-1", "is_primary": True,  "skills": {"taxonomy_key": "SQL"}},
                {"job_id": "job-1", "is_primary": False, "skills": {"taxonomy_key": "Communication"}},
            ],
            "job_applications": [{"id": 1, "user_id": "u1", "job_id": "job-1", "status": "pending"}],
            "cv_history": [{"id": 1, "user_id": "u1", "version_number": 1, "cv_raw_text": "Built APIs with Python and SQL."}],
            "user_profiles": [{"id": "u1", "cv_raw_text": "Built APIs with Python and SQL."}],
            "job_application_skill_targets": [{"user_id": "u1", "job_id": "job-1", "skill": "SQL", "is_primary": True}],
            "job_application_milestones": [],
            "job_cv_variants": [],
        }
        self._ids: dict[str, int] = {"job_cv_variants": 1}

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self, name)

    def next_id(self, table: str) -> int:
        current = self._ids.get(table, 1)
        self._ids[table] = current + 1
        return current


def test_readiness_uses_content_math_for_existing_targets_and_proof() -> None:
    result = job_path.compute_readiness(
        main_skills=["SQL", "Python"],
        side_skills=["Stakeholder Management"],
        user_skill_levels={"python": 3},
        targets=[
            {"skill": "SQL", "is_primary": True},
            {"skill": "Stakeholder Management", "is_primary": False},
        ],
        completed_proof_counts={"sql": 1},
    )

    # Numerator: Python existing 1.0*2 + SQL proof 0.6*2 + stakeholder target 0.2*1 = 3.4
    # Denominator: Python 2 + SQL 2 + stakeholder 1 = 5
    assert result["readiness_pct"] == 68
    assert result["tier"]["id"] == "competitive"



def test_follow_up_priority_prefers_abandoned_over_no_response() -> None:
    playbook = job_path.select_follow_up_playbook(
        status="applied",
        applied_at=datetime.now(timezone.utc) - timedelta(days=25),
        response_at=None,
    )

    assert playbook is not None
    assert playbook["id"] == "abandoned"


def test_follow_up_uses_explicit_ghosted_status() -> None:
    # PTL v1 (2026-05-17) — status vocabulary moved from {no_response, abandoned}
    # to {ghosted, withdrew}. select_follow_up_playbook still keys playbooks by
    # the old IDs internally; ghosted → "no_response" playbook is the new mapping.
    playbook = job_path.select_follow_up_playbook(
        status="ghosted",
        applied_at=datetime.now(timezone.utc),
        response_at=None,
    )

    assert playbook is not None
    assert playbook["id"] == "no_response"


def test_cv_confidence_label_is_based_on_completed_job_proofs() -> None:
    assert job_path.cv_confidence_for_proof_count(0)["id"] == "starter"
    assert job_path.cv_confidence_for_proof_count(2)["id"] == "proof_backed"
    assert job_path.cv_confidence_for_proof_count(3)["id"] == "strong_evidence"


def test_polish_quality_gate_rejects_banned_phrases_and_excess_length() -> None:
    baseline = "Built APIs with Python."
    inputs = {
        "baseline_text": baseline,
        "job_description": "Python API work",
        "target_skills": ["Python"],
        "proof_texts": ["Built APIs with Python."],
    }

    assert not job_path.polish_output_passes_quality_gates(
        "World-class rockstar who leveraged cutting-edge synergy.",
        baseline,
        inputs,
    ).accepted
    assert not job_path.polish_output_passes_quality_gates(
        " ".join(["Python"] * 200),
        baseline,
        inputs,
    ).accepted
    assert not job_path.polish_output_passes_quality_gates(
        "Built a platform for 5000 users with 42% growth.",
        baseline,
        inputs,
    ).accepted


