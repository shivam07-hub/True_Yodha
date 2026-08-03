from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers import onboarding
from app.repositories.jobs import get_token_jobs_repository
from app.services import onboarding_preview
from app.services.onboarding_preview import build_preview_payload
from app.services.onboarding_service import target_context_hash


class _StateRepo:
    def __init__(self, state=None) -> None:
        self.state = state
        self.patches: list[dict] = []
        self.answers: list[tuple[int, dict]] = []
        self.drafts: list[str] = []
        self.milestones: list[str] = []
        self.checklist_dismissed = False

    def get_state(self, _user_id):
        return self.state

    def patch_state(self, _user_id, updates):
        self.patches.append(updates)

    def save_generator_answer(self, _user_id, step, answer):
        self.answers.append((step, answer))

    def save_generated_draft(self, _user_id, draft):
        self.drafts.append(draft)

    def mark_milestone(self, _user_id, milestone):
        self.milestones.append(milestone)

    def dismiss_checklist(self, _user_id):
        self.checklist_dismissed = True


def _client(monkeypatch, repo: _StateRepo) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: object()
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
        "role_titles": None,
        "role_family": None,
        "role_families": None,
        "seniority": "senior",
        "location": "Bengaluru, India",
        # Omitted plural stays None — "leave my saved locations alone", which is
        # what a singular-only legacy caller means.
        "locations": None,
    }


def test_target_accepts_role_only_edit(monkeypatch) -> None:
    """Point-of-use 'edit role' (issue #145): only role_title supplied; the
    canonical save_target preserves existing seniority/location."""
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
                json={"role_title": "Data Scientist"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert captured["role_title"] == "Data Scientist"
    assert captured["seniority"] is None
    assert captured["location"] is None


def test_target_can_return_to_direction_selection(monkeypatch) -> None:
    captured: list[str] = []
    monkeypatch.setattr(
        onboarding.onboarding_service,
        "reset_target",
        lambda _db, user_id: captured.append(user_id),
        raising=False,
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.delete("/onboarding/target")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert captured == ["u1"]


def test_skill_confirmation_without_target_advances_to_direction(monkeypatch) -> None:
    """Routing is decided by the service's `next`, not by whether a score exists.

    The score now lands at this step, before any direction is chosen. When the
    router inferred the step from score-truthiness, that alone would have skipped
    every first-run user past the direction step.
    """
    monkeypatch.setattr(
        onboarding,
        "confirm_baseline_skills",
        lambda *_args, **_kwargs: {"next": "target", "total_score": 46.0},
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.post(
                "/onboarding/baseline/17/confirm-skills",
                json={"overrides": []},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "confirmed", "next": "target", "total_score": 46.0}


def test_first_role_returns_durable_tailoring_receipt(monkeypatch) -> None:
    monkeypatch.setattr(
        onboarding.onboarding_first_role,
        "commit_first_role",
        lambda _db, _jobs_repo, user_id, job_id: {
            "status": "saved",
            "job_id": job_id,
            "tailor_href": f"/cv?jobId={job_id}",
        },
        raising=False,
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.post("/onboarding/first-role", json={"job_id": "job-7"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "status": "saved",
        "job_id": "job-7",
        "tailor_href": "/cv?jobId=job-7",
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


def test_checklist_progress_is_durable(monkeypatch) -> None:
    repo = _StateRepo()
    try:
        with _client(monkeypatch, repo) as client:
            milestone = client.post("/onboarding/milestones/score_gap_reviewed")
            dismissed = client.post("/onboarding/checklist/dismiss")
    finally:
        app.dependency_overrides.clear()

    assert milestone.status_code == 204
    assert dismissed.status_code == 204
    assert repo.milestones == ["score_gap_reviewed"]
    assert repo.checklist_dismissed is True


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


def test_preview_completion_does_not_bypass_target(monkeypatch) -> None:
    repo = _StateRepo()

    async def parse(*_args, **_kwargs):
        return {"skills_detected": [{"taxonomy_key": "SQL", "evidence": "Used SQL"}]}

    monkeypatch.setattr(onboarding_preview, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(onboarding_preview, "OnboardingRepository", lambda _db: repo)
    monkeypatch.setattr(onboarding_preview.cv_parser, "parse_cv_text", parse)
    monkeypatch.setattr(onboarding_preview, "get_cv_upload_provider", lambda: object())
    monkeypatch.setattr(onboarding_preview.cv_upload_jobs, "set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(onboarding_preview.cv_upload_jobs, "mark_done", lambda *_a, **_k: None)

    asyncio.run(onboarding_preview.run_profile_preview({
        "job_id": "job-1", "user_id": "u1", "raw_text": "Used SQL",
    }, allow_retry=False))

    assert repo.patches[-1]["status"] == "result_ready"
    assert "current_stage" not in repo.patches[-1]


def test_target_context_changes_with_seniority() -> None:
    senior = target_context_hash(4, "Product Manager", "senior", "Bengaluru")
    entry = target_context_hash(4, "Product Manager", "entry", "Bengaluru")

    assert senior != entry
