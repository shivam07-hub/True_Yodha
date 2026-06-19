from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers import onboarding
from app.services.onboarding_preview import build_preview_payload
from app.services.onboarding_service import derive_role_clusters, target_context_hash


class _StateRepo:
    def __init__(self, state=None) -> None:
        self.state = state
        self.patches: list[dict] = []
        self.answers: list[tuple[int, dict]] = []
        self.drafts: list[str] = []

    def get_state(self, _user_id):
        return self.state

    def patch_state(self, _user_id, updates):
        self.patches.append(updates)

    def save_generator_answer(self, _user_id, step, answer):
        self.answers.append((step, answer))

    def save_generated_draft(self, _user_id, draft):
        self.drafts.append(draft)


def _client(monkeypatch, repo: _StateRepo) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    monkeypatch.setattr(onboarding, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(onboarding, "OnboardingRepository", lambda _db: repo)
    return TestClient(app)


def test_state_defaults_to_experience(monkeypatch) -> None:
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.get("/onboarding/state")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["current_stage"] == "experience"
    assert response.json()["status"] == "draft"


def test_target_saves_literal_role_seniority_and_location(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(
        onboarding.onboarding_service,
        "save_target",
        lambda _db, user_id, **values: captured.update(user_id=user_id, **values),
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.put(
                "/onboarding/target",
                json={
                    "role_title": "Senior Product Manager",
                    "seniority": "senior",
                    "location": "Bengaluru, India",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert captured == {
        "user_id": "u1",
        "role_title": "Senior Product Manager",
        "seniority": "senior",
        "location": "Bengaluru, India",
    }


def test_profile_preview_starts_durable_preview_job(monkeypatch) -> None:
    monkeypatch.setattr(onboarding, "start_profile_preview", lambda *_a, **_k: "job-1")
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.post(
                "/onboarding/profile-preview",
                json={"description": "I build product strategy and analytics systems with SQL for growing teams. " * 2},
                headers={"Idempotency-Key": "idem-1"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {"status": "processing", "job_id": "job-1"}


def test_generator_answers_are_normalized_before_save(monkeypatch) -> None:
    repo = _StateRepo()
    try:
        with _client(monkeypatch, repo) as client:
            response = client.put(
                "/onboarding/baseline/answers/3",
                json={"answer": {"achievements": [" Shipped search ", ""]}},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert repo.answers == [(3, {"achievements": ["Shipped search"]})]


def test_complete_requires_full_result(monkeypatch) -> None:
    monkeypatch.setattr(
        onboarding.onboarding_service,
        "get_result",
        lambda *_a: {"kind": "full_result_processing"},
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.post("/onboarding/complete")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409


def test_preview_payload_is_evidence_backed_and_inexact() -> None:
    payload = build_preview_payload(
        {
            "skills_detected": [
                {
                    "taxonomy_key": "Product Management",
                    "evidence": "Owned the product roadmap",
                }
            ]
        }
    )

    assert payload["skills"] == [
        {
            "name": "Product Management",
            "taxonomy_key": "Product Management",
            "evidence": "Owned the product roadmap",
        }
    ]
    assert payload["estimate_min"] < payload["estimate_max"]


def test_role_mapping_preserves_product_semantics() -> None:
    assert derive_role_clusters("Senior Product Manager") == ["Product Management"]


def test_target_context_changes_with_seniority() -> None:
    senior = target_context_hash(4, "Product Manager", "senior", "Bengaluru")
    entry = target_context_hash(4, "Product Manager", "entry", "Bengaluru")

    assert senior != entry
