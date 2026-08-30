from __future__ import annotations

from datetime import date
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

    def update(self, payload: dict[str, Any]) -> "_FakeQuery":
        self._tape["payload"] = payload
        return self

    def insert(self, payload: Any) -> "_FakeQuery":
        self._tape["payload"] = payload
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
    def __init__(
        self,
        rows: list[dict[str, Any]] | None = None,
        tables: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self.tape: dict[str, Any] = {}
        self._tables = tables or {"user_job_matches": rows or []}

    def table(self, name: str) -> _FakeQuery:
        self.tape["table"] = name
        return _FakeQuery(self.tape, list(self._tables.get(name, [])))


class _SelectHistoryQuery(_FakeQuery):
    def __init__(
        self,
        tape: dict[str, Any],
        rows: list[dict[str, Any]],
        selects: list[str],
    ) -> None:
        super().__init__(tape, rows)
        self._selects = selects

    def select(self, value: str) -> "_SelectHistoryQuery":
        self._selects.append(value)
        super().select(value)
        return self


class _SelectHistoryDB(_FakeDB):
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        super().__init__(tables=tables)
        self.selects: list[str] = []

    def table(self, name: str) -> _SelectHistoryQuery:
        self.tape["table"] = name
        return _SelectHistoryQuery(
            self.tape,
            list(self._tables.get(name, [])),
            self.selects,
        )


class _RpcDB(_FakeDB):
    def rpc(self, name: str, params: dict[str, Any]) -> _FakeQuery:
        self.tape["rpc"] = name
        self.tape["params"] = params
        return _FakeQuery(self.tape)


class _MissingSavedApplicationQuery(_FakeQuery):
    def execute(self) -> "_MissingSavedApplicationQuery":
        from postgrest.exceptions import APIError

        raise APIError(
            {
                "code": "P0002",
                "message": "Saved application not found",
                "hint": None,
                "details": None,
            }
        )


class _MissingSavedApplicationDB(_RpcDB):
    def rpc(self, name: str, params: dict[str, Any]) -> _FakeQuery:
        self.tape["rpc"] = name
        self.tape["params"] = params
        return _MissingSavedApplicationQuery(self.tape)


def test_upsert_job_match_uses_permanent_conflict_key() -> None:
    """Backlog #36 de-weekly: eval identity is (user, job) — permanent, not
    per-week (migration 20260710). `batch_week` still rides in the payload for
    provenance, just no longer part of the conflict key."""
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
    assert admin_db.tape["on_conflict"] == "user_id,job_id"
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
            "jobs": {"location": "Bengaluru, India", "is_active": True, "listing_confidence": "active"},
        },
        {
            "id": 2,
            "user_id": "user-1",
            "job_id": "repeat-job",
            "batch_week": "2026-05-25",
            "computed_at": "2026-05-25T10:00:00+00:00",
            "llm_rank": 2,
            "jobs": {"location": "Remote", "is_active": True, "listing_confidence": "active"},
        },
        {
            "id": 3,
            "user_id": "user-1",
            "job_id": "fresh-job",
            "batch_week": "2026-06-01",
            "computed_at": "2026-06-01T09:00:00+00:00",
            "llm_rank": 1,
            "jobs": {"location": "Mumbai, India", "is_active": True, "listing_confidence": "active"},
        },
        {
            "id": 4,
            "user_id": "user-1",
            "job_id": "repeat-job",
            "batch_week": "2026-06-01",
            "computed_at": "2026-06-01T09:00:00+00:00",
            "llm_rank": 2,
            "jobs": {"location": "Remote", "is_active": True, "listing_confidence": "active"},
        },
    ]
    repo = JobsRepository(_FakeDB(rows), _FakeDB())  # type: ignore[arg-type]

    stack = repo.get_user_match_stack("user-1")

    assert [row["job_id"] for row in stack] == ["fresh-job", "repeat-job", "old-job"]
    assert [row["batch_week"] for row in stack] == ["2026-06-01", "2026-06-01", "2026-05-25"]


def test_get_user_match_stack_selects_job_lifecycle_fields() -> None:
    user_db = _SelectHistoryDB(
        {
            "user_job_matches": [],
            "user_dismissed_job_cards": [],
        }
    )
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    repo.get_user_match_stack("user-1")

    match_select = next(value for value in user_db.selects if "jobs(" in value)
    assert "first_seen" in match_select
    assert "last_seen" in match_select
    assert "is_active" in match_select
    assert "listing_confidence" in match_select
    assert "last_verified_live_at" in match_select


def test_get_user_match_stack_hides_untrusted_listings() -> None:
    repo = JobsRepository(
        _FakeDB(
            tables={
                "user_job_matches": [
                    {
                        "id": 1,
                        "user_id": "user-1",
                        "job_id": "trusted-job",
                        "computed_at": "2026-06-01T09:00:00+00:00",
                        "jobs": {"is_active": True, "listing_confidence": "active"},
                    },
                    {
                        "id": 2,
                        "user_id": "user-1",
                        "job_id": "uncertain-job",
                        "computed_at": "2026-06-01T10:00:00+00:00",
                        "jobs": {"is_active": True, "listing_confidence": "uncertain"},
                    },
                ],
                "user_dismissed_job_cards": [],
            }
        ),
        _FakeDB(),
    )  # type: ignore[arg-type]

    stack = repo.get_user_match_stack("user-1")

    assert [row["job_id"] for row in stack] == ["trusted-job"]


def test_get_user_match_stack_excludes_user_dismissed_cards() -> None:
    repo = JobsRepository(
        _FakeDB(
            tables={
                "user_job_matches": [
                    {
                        "id": 1,
                        "user_id": "user-1",
                        "job_id": "keep-job",
                        "batch_week": "2026-06-01",
                        "computed_at": "2026-06-01T09:00:00+00:00",
                        "llm_rank": 1,
                        "jobs": {"location": "Bengaluru, India", "is_active": True, "listing_confidence": "active"},
                    },
                    {
                        "id": 2,
                        "user_id": "user-1",
                        "job_id": "dismissed-job",
                        "batch_week": "2026-06-01",
                        "computed_at": "2026-06-01T09:00:00+00:00",
                        "llm_rank": 2,
                        "jobs": {"location": "Remote", "is_active": True, "listing_confidence": "active"},
                    },
                ],
                "user_dismissed_job_cards": [
                    {"user_id": "user-1", "job_id": "dismissed-job"},
                ],
            },
        ),
        _FakeDB(),
    )  # type: ignore[arg-type]

    stack = repo.get_user_match_stack("user-1")

    assert [row["job_id"] for row in stack] == ["keep-job"]


def test_get_existing_match_job_ids_includes_dismissed_cards_for_refresh_exclusion() -> None:
    repo = JobsRepository(
        _FakeDB(
            tables={
                "user_job_matches": [
                    {"user_id": "user-1", "job_id": "prior-job", "batch_week": "2026-06-01"},
                ],
                "user_dismissed_job_cards": [
                    {"user_id": "user-1", "job_id": "dismissed-job"},
                ],
            },
        ),
        _FakeDB(),
    )  # type: ignore[arg-type]

    assert repo.get_existing_match_job_ids("user-1") == ["prior-job", "dismissed-job"]
    assert repo.get_existing_match_job_ids("user-1", batch_week=date(2026, 6, 1)) == ["prior-job"]


def test_record_recommendation_exposures_captures_confidence_at_show() -> None:
    admin_db = _FakeDB()
    repo = JobsRepository(_FakeDB(), admin_db)  # type: ignore[arg-type]

    written = repo.record_recommendation_exposures(
        "user-1",
        [
            {
                "id": 42,
                "job_id": "job-1",
                "jobs": {
                    "is_active": True,
                    "listing_confidence": "active",
                    "last_verified_live_at": "2026-07-11T09:00:00+00:00",
                },
            },
            {
                "job_id": "job-2",
                "is_active": True,
                "listing_confidence": "active",
                "last_verified_live_at": "2026-07-11T10:00:00+00:00",
            },
            {
                "job_id": "job-3",
                "is_active": True,
                "listing_confidence": "uncertain",
            },
        ],
        surface="dashboard",
    )

    assert written == 2
    assert admin_db.tape["table"] == "job_recommendation_exposures"
    payload = admin_db.tape["payload"]
    assert [row["job_id"] for row in payload] == ["job-1", "job-2"]
    assert payload[0]["match_id"] == 42
    assert payload[0]["confidence_at_show"] == "active"
    assert payload[0]["metadata"] == {"position": 1}


def test_record_recommendation_exposures_debounces_identical_reload() -> None:
    admin_db = _FakeDB()
    repo = JobsRepository(_FakeDB(), admin_db)  # type: ignore[arg-type]
    rows = [{"job_id": "job-1", "is_active": True, "listing_confidence": "active"}]

    assert repo.record_recommendation_exposures("user-reload", rows, surface="market") == 1
    assert repo.record_recommendation_exposures("user-reload", rows, surface="market") == 0


def test_dismiss_dashboard_job_card_upserts_dismissal() -> None:
    user_db = _FakeDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    repo.dismiss_dashboard_job_card("user-1", "job-1")

    assert user_db.tape["table"] == "user_dismissed_job_cards"
    assert user_db.tape["payload"] == {"user_id": "user-1", "job_id": "job-1"}
    assert user_db.tape["on_conflict"] == "user_id,job_id"


def test_dismiss_saved_job_uses_authenticated_atomic_rpc() -> None:
    user_db = _RpcDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    dismissed = repo.dismiss_saved_job("user-1", "job-1")

    assert dismissed is True
    assert user_db.tape["rpc"] == "dismiss_saved_job"
    assert user_db.tape["params"] == {"p_job_id": "job-1"}
    assert user_db.tape["executed"] is True


def test_dismiss_saved_job_returns_false_when_saved_intent_is_missing() -> None:
    user_db = _MissingSavedApplicationDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    dismissed = repo.dismiss_saved_job("user-1", "job-1")

    assert dismissed is False


def test_restore_saved_job_uses_authenticated_atomic_rpc() -> None:
    user_db = _RpcDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    restored = repo.restore_saved_job("user-1", "job-1")

    assert restored is True
    assert user_db.tape["rpc"] == "restore_saved_job"
    assert user_db.tape["params"] == {"p_job_id": "job-1"}
    assert user_db.tape["executed"] is True


def test_record_apply_intent_uses_authenticated_identity_scoped_rpc() -> None:
    user_db = _RpcDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    repo.record_apply_intent(
        "user-1",
        "job-1",
        {
            "client_event_id": "123e4567-e89b-12d3-a456-426614174000",
            "surface": "market",
            "destination_type": "direct_role",
        },
    )

    assert user_db.tape["rpc"] == "record_job_apply_intent"
    assert user_db.tape["params"] == {
        "p_job_id": "job-1",
        "p_client_event_id": "123e4567-e89b-12d3-a456-426614174000",
        "p_surface": "market",
        "p_destination_type": "direct_role",
    }
    assert user_db.tape["executed"] is True


def test_context_refresh_clears_old_recommendations() -> None:
    user_db = _FakeDB()
    repo = JobsRepository(user_db, _FakeDB())  # type: ignore[arg-type]

    repo.clear_recommendations("user-1")

    assert user_db.tape["table"] == "user_job_matches"
    assert user_db.tape["payload"] == {"is_recommended": False}
    assert ("user_id", "user-1") in user_db.tape["eq"]
    assert ("is_recommended", True) in user_db.tape["eq"]


class _Raises204Builder:
    """Mimics a PostgREST builder whose .execute() hits the postgrest-py
    204 / 'Missing response' quirk (no row). safe_read must absorb it."""

    def select(self, *_a: Any, **_k: Any) -> "_Raises204Builder":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_Raises204Builder":
        return self

    def maybe_single(self, *_a: Any, **_k: Any) -> "_Raises204Builder":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_Raises204Builder":
        return self

    def execute(self) -> Any:
        from postgrest.exceptions import APIError

        raise APIError(
            {
                "code": "204",
                "message": "Missing response",
                "hint": "Please check traceback of the code",
                "details": "Postgrest couldn't retrieve response",
            }
        )


class _EmptyRowsBuilder:
    def select(self, *_a: Any, **_k: Any) -> "_EmptyRowsBuilder":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_EmptyRowsBuilder":
        return self

    def execute(self) -> Any:
        class _R:
            data: list[dict[str, Any]] = []

        return _R()


class _Profile204DB:
    """user_profiles read raises the 204 quirk; cv_versions returns no rows."""

    def table(self, name: str) -> Any:
        if name == "user_profiles":
            return _Raises204Builder()
        return _EmptyRowsBuilder()


def test_get_user_profile_targeting_survives_postgrest_204() -> None:
    # Regression: the paid Refresh hot path called .maybe_single().execute()
    # raw, so a 204 'Missing response' propagated, crashed compute_job_matches,
    # and refunded XP — the user saw "no new matches". safe_read must absorb it.
    repo = JobsRepository(_Profile204DB(), _Profile204DB())  # type: ignore[arg-type]

    profile = repo.get_user_profile_targeting("user-1")

    assert profile == {"cv_markdown": ""}
    assert profile.get("target_roles") is None  # degrades, does not raise


# ── extension-imported job persistence ────────────────────────────────────────


class _RecordingQuery:
    """Minimal PostgREST builder that records writes and filters seeded rows."""

    def __init__(self, table: str, rows: list[dict[str, Any]], writes: list[dict[str, Any]]) -> None:
        self._table = table
        self._rows = rows
        self._writes = writes
        self._single = False

    def upsert(self, payload: Any, on_conflict: str | None = None) -> "_RecordingQuery":
        self._writes.append({"table": self._table, "payload": payload, "on_conflict": on_conflict})
        return self

    def select(self, *_a: Any, **_k: Any) -> "_RecordingQuery":
        return self

    def eq(self, key: str, value: Any) -> "_RecordingQuery":
        self._rows = [row for row in self._rows if row.get(key) == value]
        return self

    def in_(self, key: str, values: list[Any]) -> "_RecordingQuery":
        wanted = set(values)
        self._rows = [row for row in self._rows if row.get(key) in wanted]
        return self

    def order(self, key: str, desc: bool = False) -> "_RecordingQuery":
        self._rows = sorted(self._rows, key=lambda r: r.get(key) or 0, reverse=desc)
        return self

    def limit(self, _n: int) -> "_RecordingQuery":
        return self

    def single(self) -> "_RecordingQuery":
        self._single = True
        return self

    def execute(self) -> Any:
        class _R:
            pass

        result = _R()
        result.data = (self._rows[0] if self._rows else None) if self._single else self._rows
        return result


class _ImportDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self.writes: list[dict[str, Any]] = []

    def table(self, name: str) -> _RecordingQuery:
        return _RecordingQuery(name, [dict(r) for r in self._tables.get(name, [])], self.writes)


def _import_body(**overrides: Any) -> Any:
    from types import SimpleNamespace

    base = dict(
        role_name="Data Engineer",
        company_name="Acme",
        location="Bengaluru",
        job_description="Build pipelines.",
        source_url="https://example.com/job/1",
        source_platform="generic",
        primary_skills=["Python (Programming Language)"],
        secondary_skills=["SQL (Programming Language)"],
        emerging_skills=[],
        status="saved",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _import_db(job_rows: list[dict[str, Any]] | None = None) -> _ImportDB:
    return _ImportDB(
        {
            "jobs": job_rows or [],
            "skills": [
                {"id": 11, "taxonomy_key": "Python (Programming Language)"},
                {"id": 22, "taxonomy_key": "SQL (Programming Language)"},
            ],
            "job_applications": [{"id": 5, "user_id": "u1", "status": "saved", "source": "user_discovery"}],
        }
    )


def _writes_to(db: _ImportDB, table: str) -> list[dict[str, Any]]:
    return [w for w in db.writes if w["table"] == table]


def test_save_imported_job_writes_canonical_job_skills() -> None:
    # Prod 2026-08-06: all 17 extension jobs had ZERO job_skills rows, so the
    # matcher's candidate pool (job_skills-derived) could never see them — and
    # role_family, set by a trigger on that table, stayed NULL forever.
    db = _import_db()
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    repo.save_imported_job("u1", _import_body())

    written = _writes_to(db, "job_skills")
    assert len(written) == 1
    assert written[0]["on_conflict"] == "job_id,skill_id"
    assert [(r["skill_id"], r["is_primary"], r["required_level"]) for r in written[0]["payload"]] == [
        (11, True, 4),
        (22, False, 2),
    ]
    assert {r["job_id"] for r in written[0]["payload"]} == {
        _writes_to(db, "jobs")[0]["payload"]["job_id"]
    }


def test_save_imported_job_stamps_feed_markers() -> None:
    db = _import_db()
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    repo.save_imported_job("u1", _import_body())

    job_row = _writes_to(db, "jobs")[0]["payload"]
    today = int(date.today().strftime("%Y%m%d"))
    assert job_row["first_seen"] == today
    assert job_row["last_seen"] == today


def test_save_imported_job_keeps_the_original_first_seen_on_reimport() -> None:
    # Re-importing is a new sighting, not a new discovery: last_seen moves,
    # first_seen must not, or the upsert keeps resetting "when did this appear".
    body = _import_body()
    from app.services.job_importer import build_extension_job_id

    job_id = build_extension_job_id(body.source_url, body.role_name, body.company_name, body.location)
    db = _import_db([{"job_id": job_id, "first_seen": 20260101}])
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    repo.save_imported_job("u1", body)

    job_row = _writes_to(db, "jobs")[0]["payload"]
    assert job_row["first_seen"] == 20260101
    assert job_row["last_seen"] == int(date.today().strftime("%Y%m%d"))


def test_save_imported_job_skips_skills_the_taxonomy_table_does_not_know() -> None:
    # job_skills.skill_id is an FK — an unresolved key is a failed write, not a
    # partial one, so it must never reach the payload.
    db = _import_db()
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    repo.save_imported_job(
        "u1", _import_body(primary_skills=["Python (Programming Language)"], secondary_skills=[])
    )

    written = _writes_to(db, "job_skills")
    assert [r["skill_id"] for r in written[0]["payload"]] == [11]


def test_get_agent_picks_drops_skipped_and_saved_jobs() -> None:
    # Skip and Save write the feed tables. The Agent Picks band is the same
    # undecided card, so a skipped or saved pick must not come back on refetch.
    def _job(job_id: str) -> dict[str, Any]:
        return {
            "job_id": job_id,
            "job_title": job_id,
            "is_active": True,
            "listing_confidence": "active",
            "main_skills": [],
        }

    db = _ImportDB(
        {
            "user_agent_job_picks": [
                {"user_id": "u1", "job_id": "keep", "agent_rank": 1, "tier": "strong", "comment": "yes"},
                {"user_id": "u1", "job_id": "skipped", "agent_rank": 2, "tier": "strong", "comment": "no"},
                {"user_id": "u1", "job_id": "saved", "agent_rank": 3, "tier": "reach", "comment": "maybe"},
            ],
            "jobs": [_job("keep"), _job("skipped"), _job("saved")],
            "user_dismissed_job_cards": [{"user_id": "u1", "job_id": "skipped"}],
            "job_applications": [{"user_id": "u1", "job_id": "saved"}],
            "user_skills": [],
        }
    )
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    picks = repo.get_agent_picks("u1")

    assert [p["job_id"] for p in picks] == ["keep"]
