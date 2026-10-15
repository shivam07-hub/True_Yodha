from datetime import datetime, timezone
from pathlib import Path

from app.services.job_unload_archive import unload, write_archive_bundle
from scripts.restore_job_archive import skill_rows_for_restore


def test_write_archive_bundle_matches_prior_unload_shape(tmp_path: Path) -> None:
    jobs = [{
        "job_id": "j1",
        "job_title": "Data Engineer",
        "company_name": "Acme",
        "listing_confidence": "closed",
        "last_seen": 20260901,
        "apply_url": "https://example.com/j1",
        "location": "Bengaluru",
    }]
    skills = [{"job_id": "j1", "skill_id": 9, "is_primary": True, "required_level": 3}]
    created = datetime(2026, 9, 13, 12, tzinfo=timezone.utc)

    manifest = write_archive_bundle(jobs, skills, tmp_path, created_at=created)

    assert manifest["archive_format"] == "job_archive_v1"
    assert manifest["jobs"]["count"] == 1
    assert (tmp_path / "archive_jobs.json").read_text(encoding="utf-8").find("j1") > 0
    csv_text = (tmp_path / "archive_jobs.csv").read_text(encoding="utf-8")
    assert "job_id,job_title,company_name" in csv_text
    assert "j1,Data Engineer,Acme" in csv_text
    assert (tmp_path / "archive_manifest.json").exists()


class _Rpc:
    def __init__(self, db: "_Db", name: str, params: dict):
        self.db = db
        self.name = name
        self.params = params

    def execute(self):
        self.db.rpc_calls.append((self.name, self.params))
        if self.name == "list_unload_candidates":
            limit = int(self.params.get("p_limit") or 500)
            protected = set(self.db.protected)
            ids = [job_id for job_id in self.db.due if job_id not in protected][:limit]
            return type("R", (), {"data": [{"job_id": job_id} for job_id in ids]})()
        return type("R", (), {"data": [{"job_id": job_id, "deleted_at": "now"} for job_id in self.params.get("p_job_ids", [])]})()


_HISTORY = {
    "user_job_matches",
    "job_applications",
    "job_feedback_events",
    "job_reports",
}


class _Query:
    def __init__(self, db: "_Db", table: str):
        self.db = db
        self.table = table
        self.cols = ""
        self.start = 0
        self.end = 10**9
        self._in_ids: list[str] | None = None

    def select(self, cols: str):
        self.cols = cols
        return self

    def eq(self, *_args):
        return self

    def lte(self, *_args):
        return self

    def order(self, *_args):
        return self

    def limit(self, *_args):
        return self

    def range(self, start: int, end: int):
        self.start = start
        self.end = end
        return self

    def in_(self, col: str, ids: list[str]):
        self.db.filters.append((self.table, col, list(ids)))
        self._in_ids = list(ids)
        return self

    def update(self, payload: dict):
        self.db.updates.append((self.table, payload))
        return self

    def insert(self, payload):
        self.db.inserts.append((self.table, payload))
        return self

    def execute(self):
        if self.table in _HISTORY:
            ids = self.db.protected
            if self._in_ids is not None:
                wanted = set(self._in_ids)
                ids = [job_id for job_id in ids if job_id in wanted]
            if self.start:
                ids = []
            return type("R", (), {"data": [{"job_id": job_id} for job_id in ids]})()
        if self.table == "jobs" and self.cols == "job_id":
            page = self.db.due[self.start : self.end + 1]
            return type("R", (), {"data": [{"job_id": job_id} for job_id in page]})()
        if self.table == "jobs":
            ids = self._in_ids if self._in_ids is not None else self.db.due
            return type(
                "R",
                (),
                {
                    "data": [{
                        "job_id": job_id,
                        "job_title": "Role",
                        "last_verified_live_at": "2026-09-01T00:00:00+00:00",
                    } for job_id in ids]
                },
            )()
        return type("R", (), {"data": [{"job_id": "j1", "skill_id": 1}]})()


class _Db:
    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict]] = []
        self.updates: list[tuple[str, dict]] = []
        self.inserts: list[tuple[str, object]] = []
        self.filters: list[tuple[str, str, list[str]]] = []
        self.due: list[str] = ["j1"]
        self.protected: list[str] = []

    def rpc(self, name: str, params: dict) -> _Rpc:
        return _Rpc(self, name, params)

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _batch_dir(root: Path) -> Path:
    return next(root.glob("*/*"))


def test_unload_writes_files_before_delete(tmp_path: Path) -> None:
    db = _Db()
    deleted = unload(db, limit=10, archive_dir=tmp_path)  # type: ignore[arg-type]

    assert deleted == 1
    assert db.rpc_calls[0][0] == "list_unload_candidates"
    assert db.updates == [("job_applications", {"match_id": None})]
    assert db.inserts == [(
        "job_listing_observations",
        [{
            "job_id": "j1",
            "observer": "scraper",
            "result": "seen_live",
            "strength": "strong",
            "observed_at": "2026-09-01T00:00:00+00:00",
            "evidence": {"source": "retire_freeze"},
            "verifier_version": "thin-ledger-v1",
        }],
    )]
    assert ("job_applications", "job_id", ["j1"]) in db.filters
    assert db.rpc_calls[-1] == (
        "retire_closed_jobs",
        {"p_limit": 10, "p_job_ids": ["j1"]},
    )
    assert (_batch_dir(tmp_path) / "archive_jobs.json").exists()


def test_unload_is_a_no_op_when_nothing_is_due(tmp_path: Path) -> None:
    db = _Db()
    db.due = []
    assert unload(db, limit=50, archive_dir=tmp_path) == 0  # type: ignore[arg-type]
    assert db.rpc_calls == [("list_unload_candidates", {"p_limit": 50})]


def test_unload_does_not_delete_when_disk_write_fails(tmp_path: Path) -> None:
    db = _Db()
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("x", encoding="utf-8")
    try:
        unload(db, limit=10, archive_dir=blocker)  # type: ignore[arg-type]
    except (NotADirectoryError, FileExistsError, OSError):
        pass
    else:
        raise AssertionError("disk failure must surface")

    assert all(name != "retire_closed_jobs" for name, _ in db.rpc_calls)


def test_user_history_is_not_archived_or_deleted(tmp_path: Path) -> None:
    db = _Db()
    db.due = ["keep-me", "delete-me"]
    db.protected = ["keep-me"]
    deleted = unload(db, limit=10, archive_dir=tmp_path)  # type: ignore[arg-type]

    assert deleted == 1
    assert db.rpc_calls[-1] == (
        "retire_closed_jobs",
        {"p_limit": 10, "p_job_ids": ["delete-me"]},
    )
    archived = (_batch_dir(tmp_path) / "archive_jobs.json").read_text()
    assert "delete-me" in archived
    assert "keep-me" not in archived


def test_protected_listing_does_not_stall_the_batch(tmp_path: Path) -> None:
    db = _Db()
    db.due = ["keep-me"]
    db.protected = ["keep-me"]
    deleted = unload(db, limit=10, archive_dir=tmp_path)  # type: ignore[arg-type]

    assert deleted == 0
    assert [name for name, _ in db.rpc_calls] == ["list_unload_candidates"]
    assert list(tmp_path.glob("*/*")) == []


def test_missing_archive_dir_does_not_touch_the_database(monkeypatch) -> None:
    monkeypatch.delenv("JOB_UNLOAD_ARCHIVE_DIR", raising=False)
    db = _Db()
    assert unload(db, limit=10) == 0  # type: ignore[arg-type]
    assert db.rpc_calls == []


def test_restore_drops_serial_skill_ids() -> None:
    rows = skill_rows_for_restore([
        {
            "id": 99,
            "job_id": "j1",
            "skill_id": 3,
            "is_primary": False,
            "required_level": 2,
        },
    ])
    assert rows == [{
        "job_id": "j1",
        "skill_id": 3,
        "is_primary": False,
        "required_level": 2,
    }]
