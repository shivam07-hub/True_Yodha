from datetime import datetime, timezone
from pathlib import Path

from app.services.job_unload_archive import archive_then_retire, write_archive_bundle
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
            return type("R", (), {"data": [{"job_id": "j1"}]})()
        return type("R", (), {"data": [{"job_id": "j1", "deleted_at": "now"}]})()


class _Query:
    def __init__(self, db: "_Db", table: str):
        self.db = db
        self.table = table

    def select(self, _cols: str):
        return self

    def in_(self, _col: str, _ids: list[str]):
        return self

    def execute(self):
        if self.table == "jobs":
            return type("R", (), {"data": [{"job_id": "j1", "job_title": "Role"}]})()
        return type("R", (), {"data": [{"job_id": "j1", "skill_id": 1}]})()


class _Db:
    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict) -> _Rpc:
        return _Rpc(self, name, params)

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def test_archive_then_retire_writes_files_before_delete(tmp_path: Path) -> None:
    db = _Db()
    deleted = archive_then_retire(
        db,  # type: ignore[arg-type]
        limit=10,
        now=lambda: datetime(2026, 9, 13, 12, tzinfo=timezone.utc),
        local_root=tmp_path,
    )

    assert deleted == 1
    assert db.rpc_calls[0][0] == "list_unload_candidates"
    assert db.rpc_calls[-1] == (
        "retire_closed_jobs",
        {"p_limit": 10, "p_job_ids": ["j1"]},
    )
    batch_dirs = list(tmp_path.glob("2026-09-13/*"))
    assert len(batch_dirs) == 1
    assert (batch_dirs[0] / "archive_jobs.json").exists()


def test_archive_then_retire_is_a_no_op_when_nothing_is_due() -> None:
    class Empty(_Db):
        def rpc(self, name: str, params: dict) -> _Rpc:
            self.rpc_calls.append((name, params))

            class Reply:
                def execute(self_inner):
                    return type("X", (), {"data": []})()

            return Reply()

    db = Empty()
    assert archive_then_retire(db, limit=50) == 0  # type: ignore[arg-type]
    assert db.rpc_calls == [("list_unload_candidates", {"p_limit": 50})]


def test_archive_then_retire_does_not_delete_when_disk_write_fails(tmp_path: Path) -> None:
    db = _Db()
    blocker = tmp_path / "not-a-directory"
    blocker.write_text("x", encoding="utf-8")
    try:
        archive_then_retire(
            db,  # type: ignore[arg-type]
            limit=10,
            now=lambda: datetime(2026, 9, 13, 12, tzinfo=timezone.utc),
            local_root=blocker,
        )
    except (NotADirectoryError, FileExistsError, OSError):
        pass
    else:
        raise AssertionError("disk failure must surface")

    assert all(name != "retire_closed_jobs" for name, _ in db.rpc_calls)


def test_railway_without_archive_dir_does_not_delete(monkeypatch) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.delenv("JOB_UNLOAD_ARCHIVE_DIR", raising=False)
    db = _Db()
    assert archive_then_retire(db, limit=10) == 0  # type: ignore[arg-type]
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
