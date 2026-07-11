"""Career Story Reservoir API — ingest / profile / curation / projection."""
import io
import zipfile
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user, get_user_db
from app.main import app
from app.repositories.career_reservoir import get_career_reservoir_repository
from app.repositories.cv import get_token_cv_repository
from app.repositories.cv_dump import get_cv_dump_repository
from app.services import career_reservoir

_H = {"Authorization": "Bearer t1"}


class _FakeDumpRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def add(self, user_id: str, text: str, source: str = "manual", *, kind: str = "note", payload=None):
        row = {"id": f"e{len(self.rows) + 1}", "user_id": user_id, "text": text,
               "source": source, "kind": kind, "payload": payload or {}}
        self.rows.append(row)
        return row


class _FakeReservoirRepo:
    def __init__(self, roles=None, stories=None, pointers=None, pending=0) -> None:
        self.roles = roles or []
        self.stories = stories or []
        self.pointers = pointers or []
        self.pending = pending
        self.patches: list[tuple[str, dict]] = []

    def list_roles(self, user_id):
        return self.roles

    def list_stories(self, user_id, *, include_archived=False):
        return self.stories

    def story_pointers(self, user_id, story_ids):
        return [p for p in self.pointers if str(p.get("story_id")) in set(story_ids)]

    def ingest_status(self, user_id):
        return {"pending": self.pending, "processed": 0}

    def update_story(self, user_id, story_id, updates):
        self.patches.append((story_id, updates))
        for s in self.stories:
            if str(s["id"]) == story_id:
                s.update(updates)
                return s
        return None


def _override(dump: _FakeDumpRepo | None = None, reservoir: _FakeReservoirRepo | None = None):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    if dump is not None:
        app.dependency_overrides[get_cv_dump_repository] = lambda: dump
    if reservoir is not None:
        app.dependency_overrides[get_career_reservoir_repository] = lambda: reservoir


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.clear()


def test_ingest_text_and_txt_file(monkeypatch):
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append((uid, eid)))
    dump = _FakeDumpRepo()
    _override(dump=dump)

    long_text = "Led the sponsorship drive for the national fest and raised the full budget target. " * 3
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("notes.txt", long_text.encode(), "text/plain"))],
            data={"text": long_text},
            headers=_H,
        )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["entries"]) == 2
    assert body["skipped"] == []
    assert {e[1] for e in enqueued} == {"e1", "e2"}
    assert dump.rows[0]["kind"] == "file"
    assert dump.rows[0]["source"] == "reservoir_dump"


def test_ingest_skips_unsupported_and_short(monkeypatch):
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: None)
    _override(dump=_FakeDumpRepo())
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[
                ("files", ("weird.exe", b"x" * 200, "application/octet-stream")),
                ("files", ("tiny.txt", b"too short", "text/plain")),
            ],
            headers=_H,
        )
    assert resp.status_code == 200
    reasons = {s["filename"]: s["reason"] for s in resp.json()["skipped"]}
    assert reasons["weird.exe"] == "Unsupported file type"
    assert reasons["tiny.txt"] == "No readable text"
    assert resp.json()["entries"] == []


def test_ingest_linkedin_zip(monkeypatch):
    enqueued: list[str] = []
    monkeypatch.setattr(career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append(eid))
    dump = _FakeDumpRepo()
    _override(dump=dump)

    buf = io.BytesIO()
    positions = (
        "Company Name,Title,Description,Location,Started On,Finished On\n"
        'Capgemini,Sales Manager,"Generated 50+ inbound T&M requirements within 10 months through '
        'targeted account penetration and value-led capability showcases.",Hyderabad,May 2025,\n'
    )
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Positions.csv", positions)
        zf.writestr("Unrelated.csv", "A,B\n1,2\n")
    with TestClient(app) as client:
        resp = client.post(
            "/cv/reservoir/ingest",
            files=[("files", ("Complete_LinkedInDataExport.zip", buf.getvalue(), "application/zip"))],
            headers=_H,
        )
    assert resp.status_code == 200
    entry = resp.json()["entries"][0]
    assert entry["kind"] == "linkedin"
    assert "ROLE: Sales Manager @ Capgemini" in dump.rows[0]["text"]
    assert enqueued == ["e1"]


def test_profile_endpoint_grouping():
    reservoir = _FakeReservoirRepo(
        roles=[{"id": "r1", "company": "Capgemini", "title": "Sales Manager", "kind": "work",
                "date_label": "", "location": "", "status": "active", "created_at": "2026-01-01"}],
        stories=[{"id": "s1", "role_id": "r1", "kind": "project", "title": "Pipeline",
                  "narrative": {"result": "50+ reqs"}, "metrics": [], "skills": ["GTM"], "status": "active"}],
        pointers=[{"story_id": "s1", "text": "Pointer.", "is_canonical": True}],
        pending=1,
    )
    _override(reservoir=reservoir)
    with TestClient(app) as client:
        resp = client.get("/cv/reservoir/profile", headers=_H)
    assert resp.status_code == 200
    body = resp.json()
    assert body["roles"][0]["stories"][0]["pointer"] == "Pointer."
    assert body["pending_inflows"] == 1
    assert body["competencies"] == ["GTM"]


def test_patch_story_archive():
    reservoir = _FakeReservoirRepo(
        stories=[{"id": "s1", "role_id": None, "kind": "project", "title": "T",
                  "narrative": {}, "metrics": [], "skills": [], "status": "active"}],
    )
    _override(reservoir=reservoir)
    with TestClient(app) as client:
        resp = client.patch("/cv/reservoir/stories/s1", json={"status": "archived"}, headers=_H)
        missing = client.patch("/cv/reservoir/stories/nope", json={"status": "archived"}, headers=_H)
        empty = client.patch("/cv/reservoir/stories/s1", json={}, headers=_H)
    assert resp.status_code == 200
    assert resp.json()["status"] == "archived"
    assert missing.status_code == 404
    assert empty.status_code == 422


class _Chain:
    """Minimal PostgREST query-builder fake ending in .execute().data."""
    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        def _link(*args, **kwargs):
            return self
        return _link

    def execute(self):
        return type("R", (), {"data": self._data})()


class _FakeDb:
    def __init__(self, job):
        self._job = job

    def table(self, name):
        return _Chain(self._job if name == "jobs" else None)


class _FakeCvRepo:
    def __init__(self, baseline):
        self.baseline = baseline
        self.created: list[Any] = []

    def latest_baseline(self, user_id):
        return self.baseline

    def create(self, user_id, spec):
        self.created.append(spec)
        return {"id": 42}


def test_project_endpoint_writes_deterministic_version():
    reservoir = _FakeReservoirRepo(
        roles=[{"id": "r1", "company": "Capgemini", "title": "Sales Manager", "kind": "work",
                "date_label": "2025–", "status": "active"}],
        stories=[{"id": "s1", "role_id": "r1", "kind": "project", "title": "Pipeline",
                  "narrative": {}, "metrics": [{"value": "50+", "what": "reqs"}],
                  "skills": ["GTM"], "status": "active"}],
        pointers=[{"story_id": "s1", "text": "Generated 50+ inbound requirements.", "is_canonical": True}],
    )
    cv_repo = _FakeCvRepo(baseline={"id": 7, "cv_structured": {"summary": "S", "contact": {"name": "N"}}})
    job = {"job_id": "j1", "job_title": "AM", "company_name": "Amazon",
           "main_skills": ["GTM"], "side_skills": []}
    _override(reservoir=reservoir)
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    app.dependency_overrides[get_user_db] = lambda: _FakeDb(job)

    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/project", json={"job_id": "j1"}, headers=_H)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"version_id": 42, "included": 1, "parked": 0}
    spec = cv_repo.created[0]
    assert spec.kind == "deterministic" and spec.job_id == "j1" and spec.parent_version_id == 7
    assert "Generated 50+ inbound requirements." in spec.body_text


def test_project_conflicts_without_stories():
    reservoir = _FakeReservoirRepo()
    cv_repo = _FakeCvRepo(baseline={"id": 7, "cv_structured": {"summary": "S"}})
    _override(reservoir=reservoir)
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    app.dependency_overrides[get_user_db] = lambda: _FakeDb({"job_id": "j1", "main_skills": [], "side_skills": []})
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/project", json={"job_id": "j1"}, headers=_H)
    assert resp.status_code == 409
