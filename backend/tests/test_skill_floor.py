"""The one writer of job_skills, and the heartbeat that polices it."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import skill_floor
from app.services.skill_extraction import ExtractedSkill


class _Query:
    def __init__(self, table: str, rows: list[dict[str, Any]], writes: list[dict[str, Any]]) -> None:
        self._table, self._rows, self._writes = table, rows, writes

    def select(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def in_(self, key: str, values: list[Any]) -> "_Query":
        wanted = set(values)
        self._rows = [row for row in self._rows if row.get(key) in wanted]
        return self

    def upsert(self, payload: Any, on_conflict: str | None = None) -> "_Query":
        self._writes.append({"table": self._table, "payload": payload, "on_conflict": on_conflict})
        return self

    def execute(self) -> Any:
        class _R:
            pass

        result = _R()
        result.data = self._rows
        return result


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]], rpc: dict[str, Any] | None = None) -> None:
        self._tables, self._rpc = tables, rpc or {}
        self.writes: list[dict[str, Any]] = []
        self.rpc_calls: list[str] = []
        self.table_calls: list[str] = []

    def table(self, name: str) -> _Query:
        self.table_calls.append(name)
        return _Query(name, [dict(r) for r in self._tables.get(name, [])], self.writes)

    def rpc(self, name: str, _params: dict[str, Any]) -> _Query:
        self.rpc_calls.append(name)
        return _Query(name, list(self._rpc.get(name, [])), self.writes)


def _db(**rpc: Any) -> _DB:
    return _DB(
        {
            "skills": [
                {"id": 11, "taxonomy_key": "Python (Programming Language)"},
                {"id": 22, "taxonomy_key": "SQL (Programming Language)"},
            ],
            "jobs": [
                {"job_id": "j1", "job_title": "Data Engineer", "job_description": "Requirements:\nStrong Python."},
                {"job_id": "j2", "job_title": "Ghost", "job_description": "   "},
            ],
        },
        rpc,
    )


class _ClaimDB(_DB):
    """Serves successive claim batches, then an empty one to end the drain."""

    def __init__(self, batches: list[list[dict[str, Any]]]) -> None:
        super().__init__(
            {
                "skills": [
                    {"id": 11, "taxonomy_key": "Python (Programming Language)"},
                    {"id": 22, "taxonomy_key": "SQL (Programming Language)"},
                ]
            }
        )
        self._batches = list(batches)
        self.rpc_payloads: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Query:
        self.rpc_calls.append(name)
        self.rpc_payloads.append((name, params))
        rows: list[dict[str, Any]] = []
        if name == "claim_skill_floor_lease":
            rows = self._batches.pop(0) if self._batches else []
        return _Query(name, rows, self.writes)

    def settled(self) -> list[list[str]]:
        return [params["p_job_ids"] for name, params in self.rpc_payloads if name == "settle_skill_floor_claims"]


def test_write_skill_floor_marks_where_the_skills_came_from() -> None:
    # Without provenance a deterministic floor row is indistinguishable from a
    # judgment-model row, so Stage B has no work queue and no match can honestly
    # be labelled provisional.
    db = _db()
    written = skill_floor.write_skill_floor(
        db, "j1", [ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.82)]
    )

    assert written == 1
    payload = db.writes[0]["payload"]
    assert payload[0]["evidence_source"] == "stage_a"
    assert payload[0]["is_primary"] is True
    assert payload[0]["required_level"] == 4
    assert db.writes[0]["on_conflict"] == "job_id,skill_id"


def test_write_skill_floor_records_a_contributors_own_confirmation() -> None:
    db = _db()
    skill_floor.write_skill_floor(
        db,
        "j1",
        [ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.9)],
        evidence_source=skill_floor.USER_CONFIRMED,
    )

    assert db.writes[0]["payload"][0]["evidence_source"] == "user_confirmed"


def test_write_skill_floor_never_writes_a_key_the_taxonomy_lacks() -> None:
    # job_skills.skill_id is a foreign key: an unresolved key is not a partial
    # write, it is a failed one that takes the whole batch down.
    db = _db()
    written = skill_floor.write_skill_floor(db, "j1", [ExtractedSkill("Nonexistent Skill", "must_have", 4, 0.8)])

    assert written == 0
    assert db.writes == []


def test_write_skill_floor_dedupes_before_the_upsert() -> None:
    # job_skills is UNIQUE (job_id, skill_id) and Postgres errors on a duplicate
    # inside one batch rather than deduping it.
    db = _db()
    skill_floor.write_skill_floor(
        db,
        "j1",
        [
            ExtractedSkill("Python (Programming Language)", "mentioned", 2, 0.68),
            ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.82),
        ],
    )

    payload = db.writes[0]["payload"]
    assert len(payload) == 1
    assert payload[0]["required_level"] == 4


def test_drain_claims_from_the_one_work_queue() -> None:
    # ONE definition of the work set: jobs.has_skill_floor, trigger-maintained.
    # Deriving it a second way from an anti-join over job_skills is what broke
    # conceptual integrity, and it silently truncated at PostgREST's 1,000-row
    # cap besides. Stage A touches only its own attempt column.
    db = _ClaimDB([[{"job_id": "j1", "job_title": "Data Engineer",
                     "job_description": "Requirements:\nStrong Python."}], []])

    result = skill_floor.drain_skill_floor_queue(db)

    assert result == {"jobs_seen": 1, "jobs_written": 1, "jobs_empty": 0}
    assert set(db.rpc_calls) == {"claim_skill_floor_lease", "settle_skill_floor_claims"}


def test_a_barren_job_is_left_for_stage_b_not_terminated() -> None:
    # "Stage A found nothing" is not "nothing is findable". These are 380-540
    # char summary blurbs naming no skill literally; a judgment model reading
    # prose may still extract one. Terminating them on a weaker method's failure
    # removed 586 jobs from Stage B's queue in prod before this was corrected.
    db = _ClaimDB([[{"job_id": "j2", "job_title": "Ghost", "job_description": "A fine company."}], []])

    result = skill_floor.drain_skill_floor_queue(db)

    assert result["jobs_empty"] == 1
    assert db.writes == []  # no skills written, and no lifecycle touched
    # Stage A's own verdict is recorded, so the job leaves Stage A's queue and
    # stays in Stage B's.
    assert db.settled() == [["j2"]]


def test_a_batch_costs_the_same_round_trips_for_one_job_or_a_hundred() -> None:
    # One job at a time was a resolve and an upsert per job: ~50 jobs a minute,
    # so a 14k-job scrape outran the drain's two-hour timeout (2026-09-30).
    jobs = [
        {"job_id": f"j{i}", "job_title": "Data Engineer",
         "job_description": "Requirements:\nStrong Python and SQL."}
        for i in range(100)
    ]
    db = _ClaimDB([jobs, []])

    result = skill_floor.drain_skill_floor_queue(db)

    assert result == {"jobs_seen": 100, "jobs_written": 100, "jobs_empty": 0}
    assert db.table_calls.count("skills") == 1, "one resolve for the whole batch"
    assert len(db.writes) == 1, "one upsert for the whole batch"
    assert {row["job_id"] for row in db.writes[0]["payload"]} == {job["job_id"] for job in jobs}


def test_the_verdict_is_written_only_after_the_skills_land() -> None:
    # The claim used to BE the verdict, so a drain killed mid-batch stranded
    # its jobs as "attempted" with no skills: 96 and 37 of them on 2026-09-30.
    db = _ClaimDB([[{"job_id": "j1", "job_title": "Data Engineer",
                     "job_description": "Requirements:\nStrong Python."}], []])
    order: list[str] = []
    original_rpc = db.rpc

    def rpc(name: str, params: dict[str, Any]) -> _Query:
        order.append(name)
        return original_rpc(name, params)

    def table(name: str) -> _Query:
        order.append(f"table:{name}")
        return _DB.table(db, name)

    db.rpc = rpc  # type: ignore[method-assign]
    db.table = table  # type: ignore[method-assign]

    skill_floor.drain_skill_floor_queue(db)

    assert order.index("settle_skill_floor_claims") > order.index("table:job_skills")


def test_a_failed_write_leaves_the_lease_unsettled(monkeypatch) -> None:
    db = _ClaimDB([[{"job_id": "j1", "job_title": "Data Engineer",
                     "job_description": "Requirements:\nStrong Python."}], []])

    def boom(*_a: Any, **_k: Any) -> dict[str, int]:
        raise RuntimeError("upsert failed")

    monkeypatch.setattr(skill_floor, "write_skill_floors", boom)

    with pytest.raises(RuntimeError):
        skill_floor.drain_skill_floor_queue(db)

    assert db.settled() == [], "an unsettled lease is served again; a settled one never is"


def test_the_drain_claims_under_its_owner_so_a_retry_takes_its_batch_back() -> None:
    db = _ClaimDB([[]])

    skill_floor.drain_skill_floor_queue(db, owner="run-7")

    assert db.rpc_payloads[0] == ("claim_skill_floor_lease", {"p_limit": 100, "p_owner": "run-7"})


def test_count_missing_floor_separates_the_stall_from_the_backlog() -> None:
    # A job Stage A has already tried and found no taxonomy skill in is waiting
    # on Stage B — a known number that would fire the dead-man every six hours
    # until S2 ships. Only never-attempted jobs mean the pipeline is stopped.
    db = _db(
        count_jobs_missing_skill_floor=[
            {"total": 967, "recommendable": 213, "awaiting_stage_a": 0}
        ]
    )

    gap = skill_floor.count_missing_floor(db)

    assert (gap.total, gap.recommendable, gap.awaiting_stage_a) == (967, 213, 0)


def test_the_dead_man_alerts_on_unattempted_work_not_on_the_backlog() -> None:
    from app.services import skill_floor_heartbeat

    assert skill_floor_heartbeat.ALERT_ABOVE_AWAITING > 0
    quiet = skill_floor.FloorGap(total=967, recommendable=213, awaiting_stage_a=0)
    loud = skill_floor.FloorGap(total=967, recommendable=213, awaiting_stage_a=500)

    assert quiet.awaiting_stage_a < skill_floor_heartbeat.ALERT_ABOVE_AWAITING
    assert loud.awaiting_stage_a >= skill_floor_heartbeat.ALERT_ABOVE_AWAITING


def test_alert_incident_opens_once_reminds_then_recovers(monkeypatch) -> None:
    from app.config import settings
    from app.services import skill_floor_heartbeat

    monkeypatch.setattr(settings, "redis_url", "")
    monkeypatch.setattr(
        skill_floor_heartbeat,
        "_local_incident_state",
        {"state": "closed", "last_alert_at": 0},
    )

    assert skill_floor_heartbeat._incident_transition(True, now=100) == "opened"
    assert skill_floor_heartbeat._incident_transition(True, now=101) == "quiet"
    assert (
        skill_floor_heartbeat._incident_transition(
            True,
            now=100 + skill_floor_heartbeat.INCIDENT_REMINDER_SECONDS,
        )
        == "reminder"
    )
    assert skill_floor_heartbeat._incident_transition(False, now=200_000) == "recovered"
    assert skill_floor_heartbeat._incident_transition(False, now=200_001) == "quiet"


def test_only_production_owns_skill_floor_alerts(monkeypatch) -> None:
    from app.config import settings
    from app.services import skill_floor_heartbeat

    monkeypatch.setattr(settings, "myro_env", "dev")
    assert skill_floor_heartbeat._owns_alerts() is False
    monkeypatch.setattr(settings, "myro_env", "prod")
    assert skill_floor_heartbeat._owns_alerts() is True


def test_cli_accepts_explicit_count_mode(monkeypatch) -> None:
    from app.workers import skill_floor_cli

    monkeypatch.setattr(skill_floor_cli, "get_supabase_admin_batch", object)
    monkeypatch.setattr(
        skill_floor_cli.skill_floor,
        "count_missing_floor",
        lambda _db: skill_floor.FloorGap(total=9, recommendable=2, awaiting_stage_a=0),
    )

    assert skill_floor_cli.main(["--count"]) == 0
