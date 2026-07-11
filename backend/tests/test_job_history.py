from typing import Any

from app.services.job_history import attach_jobs, hydrate_job_snapshot


def test_live_job_wins_over_snapshot() -> None:
    row = {
        "jobs": {"job_title": "Current title"},
        "job_snapshot": {"job_title": "Old title"},
    }

    hydrate_job_snapshot(row)

    assert row["jobs"]["job_title"] == "Current title"


def test_snapshot_restores_retired_job_shape() -> None:
    row = {
        "jobs": None,
        "job_snapshot": {
            "job_title": "Data Analyst",
            "company_name": "Acme",
            "location": "Bengaluru",
        },
    }

    hydrate_job_snapshot(row)

    assert row["jobs"] == row["job_snapshot"]
    assert row["jobs"] is not row["job_snapshot"]


def test_empty_snapshot_does_not_invent_job() -> None:
    row = {"jobs": None, "job_snapshot": {}}

    hydrate_job_snapshot(row)

    assert row["jobs"] is None


# ── attach_jobs ──────────────────────────────────────────────────────────────
# job_applications/cv_versions carry no FK to `jobs` (dropped by the
# 20260711c retirement migration so retired listings can be physically deleted
# without orphaning history), so a PostgREST embedded `.select("*, jobs(...))")`
# can no longer resolve — regression that broke GET /cv/versions and
# GET /jobs/applications for every user. attach_jobs replaces the embed with a
# batched Python-side join and must preserve the same "live wins, snapshot
# falls back" contract.


class _FakeJobsQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows
        self.data: list[dict[str, Any]] = []
        self.selected: str | None = None
        self.filtered_ids: list[str] | None = None

    def select(self, value: str) -> "_FakeJobsQuery":
        self.selected = value
        return self

    def in_(self, key: str, values: list[str]) -> "_FakeJobsQuery":
        assert key == "job_id"
        self.filtered_ids = list(values)
        self._rows = [row for row in self._rows if row.get("job_id") in values]
        return self

    def execute(self) -> "_FakeJobsQuery":
        self.data = self._rows
        return self


class _FakeJobsDB:
    def __init__(self, jobs: list[dict[str, Any]]) -> None:
        self._jobs = jobs
        self.queries: list[_FakeJobsQuery] = []

    def table(self, name: str) -> _FakeJobsQuery:
        assert name == "jobs"
        query = _FakeJobsQuery(list(self._jobs))
        self.queries.append(query)
        return query


def test_attach_jobs_prefers_live_job_over_snapshot() -> None:
    db = _FakeJobsDB([{"job_id": "job-1", "job_title": "Live title", "company_name": "Acme"}])
    rows = [{"job_id": "job-1", "job_snapshot": {"job_title": "Stale title", "company_name": "Acme"}}]

    attach_jobs(rows, db, "job_title, company_name")

    assert rows[0]["jobs"] == {"job_title": "Live title", "company_name": "Acme"}


def test_attach_jobs_falls_back_to_snapshot_when_job_retired() -> None:
    db = _FakeJobsDB([])  # job physically deleted by retire_closed_jobs()
    rows = [{"job_id": "job-gone", "job_snapshot": {"job_title": "Retired role", "company_name": "OldCo"}}]

    attach_jobs(rows, db, "job_title, company_name")

    assert rows[0]["jobs"] == {"job_title": "Retired role", "company_name": "OldCo"}


def test_attach_jobs_batches_a_single_lookup_for_multiple_rows() -> None:
    db = _FakeJobsDB(
        [
            {"job_id": "job-1", "job_title": "A", "company_name": "Acme"},
            {"job_id": "job-2", "job_title": "B", "company_name": "Beta"},
        ]
    )
    rows = [{"job_id": "job-1"}, {"job_id": "job-2"}, {"job_id": "job-1"}]

    attach_jobs(rows, db, "job_title, company_name")

    assert len(db.queries) == 1
    assert db.queries[0].filtered_ids == ["job-1", "job-2"]
    assert rows[0]["jobs"]["job_title"] == "A"
    assert rows[1]["jobs"]["job_title"] == "B"
    assert rows[2]["jobs"]["job_title"] == "A"


def test_attach_jobs_skips_lookup_when_no_rows_have_job_ids() -> None:
    db = _FakeJobsDB([{"job_id": "job-1", "job_title": "A"}])
    rows: list[dict[str, Any]] = [{"job_id": None}]

    attach_jobs(rows, db, "job_title")

    assert db.queries == []
    assert rows[0].get("jobs") is None
