from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.main import app
from app.routers import feedback as feedback_router


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Chain:
    def __init__(self, spec: dict[str, Any]) -> None:
        self.spec = spec
        self.inserted: dict | None = None

    def table(self, _name: str) -> "_Chain":
        self.inserted = None
        return self

    def select(self, *_args: Any, **_kwargs: Any) -> "_Chain":
        return self

    def eq(self, *_args: Any) -> "_Chain":
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "_Chain":
        return self

    def limit(self, _limit: int) -> "_Chain":
        return self

    def insert(self, payload: dict) -> "_Chain":
        self.inserted = payload
        return self

    def execute(self) -> _Result:
        if self.inserted is not None:
            if self.spec.get("insert_error"):
                raise self.spec["insert_error"]
            row = {
                **self.inserted,
                "id": self.spec.get("inserted_id", 1),
                "created_at": "2026-06-14T12:00:00Z",
            }
            return _Result([row])
        sequence = self.spec.get("rows_sequence")
        if sequence:
            return _Result(sequence.pop(0))
        return _Result(self.spec.get("rows", []))


@pytest.fixture
def backend(monkeypatch: pytest.MonkeyPatch):
    def apply(spec: dict[str, Any], user_id: str | None = "u1") -> _Chain:
        chain = _Chain(spec)
        monkeypatch.setattr(feedback_router, "get_supabase_admin", lambda: chain)
        monkeypatch.setattr(feedback_router, "_resolve_user_id", lambda _c: user_id)
        return chain

    return apply


def _valid(**overrides: Any) -> dict[str, Any]:
    body = {
        "role_stream": "Product",
        "device_type": "Mobile",
        "operating_system": "Android",
        "browser": "Chrome",
        "connection_type": "Mobile data",
        "session_outcome": "Completed",
        "time_to_value": "5-10 minutes",
        "areas_explored": ["CV upload", "CV analysis or Myro Score"],
        "product_understanding": "Myro helps job seekers understand and improve their CV.",
        "most_useful_moment": "The skill-gap result gave me a specific next action.",
        "biggest_problem_area": "CV analysis or Myro Score",
        "biggest_problem": "The score appeared before I understood how it was calculated.",
        "attempted_action": "I tried to understand why my score was low.",
        "expected_result": "I expected a short explanation of the largest score drivers.",
        "actual_result": "I saw the score but could not identify the first improvement.",
        "reproduction_steps": "Upload a CV, wait for analysis, and open the score.",
        "priority_improvement": "Show the three largest score drivers beside the result.",
        "priority_reason": "It would make the first result trustworthy and actionable.",
        "preserve": "Keep the clean CV upload flow because it feels focused.",
        "return_trigger": "I have a new job description to compare against my CV.",
        "rating_next_step": 4,
        "rating_trust": 3,
        "rating_relevance": 4,
        "rating_return": 4,
        "rating_recommend": 4,
        "privacy_confirmation": True,
        "independent_work_confirmation": True,
        "final_submission_confirmation": True,
    }
    body.update(overrides)
    return body


def test_status_requires_auth(backend) -> None:
    backend({"rows": []}, user_id=None)
    with TestClient(app) as client:
        assert client.get("/feedback/beta-assignment").status_code == 401


def test_status_returns_empty(backend) -> None:
    backend({"rows": []})
    with TestClient(app) as client:
        response = client.get("/feedback/beta-assignment", headers={"Authorization": "Bearer t"})
    assert response.json() == {"submitted": False, "receipt": None}


def test_status_returns_receipt(backend) -> None:
    backend({"rows": [{"id": 42, "created_at": "2026-06-14T12:00:00Z"}]})
    with TestClient(app) as client:
        response = client.get("/feedback/beta-assignment", headers={"Authorization": "Bearer t"})
    assert response.json()["receipt"] == {
        "id": 42,
        "submitted_at": "2026-06-14T12:00:00Z",
    }


def test_submit_requires_auth(backend) -> None:
    backend({"rows": []}, user_id=None)
    with TestClient(app) as client:
        response = client.post("/feedback/beta-assignment", json=_valid())
    assert response.status_code == 401


def test_submit_inserts_nested_payload(backend) -> None:
    chain = backend({"rows": [], "inserted_id": 91})
    with TestClient(app) as client:
        response = client.post(
            "/feedback/beta-assignment",
            json=_valid(),
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 201
    assert response.json()["id"] == 91
    assert chain.inserted is not None
    payload = chain.inserted["payload"]
    assert chain.inserted["user_id"] == "u1"
    assert payload["program"] == "intern_beta_assignment_v1"
    assert payload["session"]["device_type"] == "Mobile"
    assert payload["ratings"]["trust"] == 3
    assert payload["confirmations"]["final_submission"] is True
    assert "email" not in payload


def test_submit_rejects_existing_submission(backend) -> None:
    backend({"rows": [{"id": 42, "created_at": "2026-06-14T12:00:00Z"}]})
    with TestClient(app) as client:
        response = client.post(
            "/feedback/beta-assignment",
            json=_valid(),
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 409


def test_submit_maps_unique_race_to_conflict(backend) -> None:
    duplicate = APIError({
        "code": "23505",
        "message": "duplicate key value violates unique constraint",
        "details": None,
        "hint": None,
    })
    backend({
        "insert_error": duplicate,
        "rows_sequence": [
            [],
            [{"id": 43, "created_at": "2026-06-14T12:01:00Z"}],
        ],
    })
    with TestClient(app) as client:
        response = client.post(
            "/feedback/beta-assignment",
            json=_valid(),
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 409


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"areas_explored": []}, "areas_explored"),
        ({"rating_trust": 6}, "rating_trust"),
        ({"privacy_confirmation": False}, "privacy_confirmation"),
        ({"independent_work_confirmation": False}, "independent_work_confirmation"),
        ({"final_submission_confirmation": False}, "final_submission_confirmation"),
        ({"product_understanding": "short"}, "product_understanding"),
    ],
)
def test_submit_validates_contract(backend, overrides: dict, field: str) -> None:
    backend({"rows": []})
    with TestClient(app) as client:
        response = client.post(
            "/feedback/beta-assignment",
            json=_valid(**overrides),
            headers={"Authorization": "Bearer t"},
        )
    assert response.status_code == 422
    assert field in response.text
