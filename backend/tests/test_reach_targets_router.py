"""Reach Target router — ADR-0018 Path 3 send ledger."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.repositories.reach_targets import get_token_reach_targets_repository


class _FakeJobsRepo:
    def __init__(self, pack: dict | None = None) -> None:
        self.pack = pack

    def get_deepening(self, _user_id: str, _job_id: str, _key: str):
        return json.dumps(self.pack) if self.pack else None


class _FakeTargetsRepo:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def count(self, _user_id: str) -> int:
        return len(self.rows)

    def list_for_user(self, _user_id: str, *, job_id=None, due_only=False, now=None):
        rows = self.rows
        if job_id:
            rows = [r for r in rows if r.get("job_id") == job_id]
        return list(rows)

    def get(self, _user_id: str, target_id: str):
        return next((r for r in self.rows if r["id"] == target_id), None)

    def insert(self, row: dict) -> dict:
        if any(
            r["profile_url"] == row["profile_url"]
            and (r.get("job_id") or "") == (row.get("job_id") or "")
            for r in self.rows
        ):
            raise APIError({"message": "duplicate key value violates unique constraint", "code": "23505"})
        stored = {**row, "id": f"t{len(self.rows) + 1}"}
        self.rows.append(stored)
        return stored

    def update(self, _user_id: str, target_id: str, patch: dict):
        row = self.get(_user_id, target_id)
        if row is None:
            return None
        row.update(patch)
        return row


def _client(targets: _FakeTargetsRepo, jobs: _FakeJobsRepo | None = None) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="n@example.com")
    app.dependency_overrides[get_token_reach_targets_repository] = lambda: targets
    app.dependency_overrides[get_token_jobs_repository] = lambda: jobs or _FakeJobsRepo()
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_create_accepts_profile_url_and_fills_pack_name():
    targets = _FakeTargetsRepo()
    pack = {
        "outreach_message": "Hi {first name}, I lead marketing at Tata Play.",
        "referral_ask": "Would you refer me for Presales?",
        "timing": "Send now.",
        "warm_intro": "",
    }
    client = _client(targets, _FakeJobsRepo(pack))
    resp = client.post(
        "/jobs/reach/targets",
        json={
            "profile_url": "linkedin.com/in/asha-rao",
            "display_name": "Asha Rao",
            "job_id": "j1",
            "company": "Netscribes",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["profile_url"] == "https://www.linkedin.com/in/asha-rao"
    assert body["status"] == "queued"
    assert body["connect_note"].startswith("Hi Asha,")
    assert "Presales" in body["referral_ask"]
    assert body["followup_note"] == "Send now."
    assert body["due"] is False


def test_list_returns_created_row():
    targets = _FakeTargetsRepo()
    client = _client(targets)
    client.post(
        "/jobs/reach/targets",
        json={"profile_url": "https://www.linkedin.com/in/asha-rao", "display_name": "Asha"},
    )
    resp = client.get("/jobs/reach/targets")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["targets"]) == 1
    assert body["due_count"] == 0


def test_create_rejects_search_url():
    client = _client(_FakeTargetsRepo())
    resp = client.post(
        "/jobs/reach/targets",
        json={
            "profile_url": "https://www.linkedin.com/search/results/people/?keywords=vp",
            "display_name": "Someone",
        },
    )
    assert resp.status_code == 422


def test_duplicate_profile_on_same_job_is_409():
    targets = _FakeTargetsRepo()
    client = _client(targets)
    payload = {
        "profile_url": "https://www.linkedin.com/in/asha-rao",
        "display_name": "Asha Rao",
        "job_id": "j1",
    }
    assert client.post("/jobs/reach/targets", json=payload).status_code == 201
    resp = client.post("/jobs/reach/targets", json=payload)
    assert resp.status_code == 409


def test_advance_sent_then_replied():
    targets = _FakeTargetsRepo()
    client = _client(targets)
    created = client.post(
        "/jobs/reach/targets",
        json={"profile_url": "https://www.linkedin.com/in/asha-rao", "display_name": "Asha"},
    ).json()
    sent = client.post(f"/jobs/reach/targets/{created['id']}/advance", json={"action": "sent"})
    assert sent.status_code == 200
    body = sent.json()
    assert body["status"] == "sent"
    assert body["sent_at"]
    assert body["followup_due_at"]
    replied = client.post(f"/jobs/reach/targets/{created['id']}/advance", json={"action": "replied"})
    assert replied.status_code == 200
    assert replied.json()["status"] == "replied"


def test_cannot_advance_backwards():
    targets = _FakeTargetsRepo()
    client = _client(targets)
    created = client.post(
        "/jobs/reach/targets",
        json={"profile_url": "https://www.linkedin.com/in/asha-rao", "display_name": "Asha"},
    ).json()
    client.post(f"/jobs/reach/targets/{created['id']}/advance", json={"action": "stopped"})
    resp = client.post(f"/jobs/reach/targets/{created['id']}/advance", json={"action": "sent"})
    assert resp.status_code == 409


def test_list_requires_auth():
    app.dependency_overrides.clear()
    resp = TestClient(app).get("/jobs/reach/targets")
    assert resp.status_code in (401, 403)
