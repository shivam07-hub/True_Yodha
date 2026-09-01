from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers import onboarding
from app.repositories.jobs import get_token_jobs_repository
from app.services import onboarding_service
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
    # The journey position is derived in the service, so the state read goes
    # through its repositories, not the router's. It reads the profile too:
    # `completed_at` alone does not mean finished, because the journey's last
    # step is Direction (see test_journey_position).
    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: repo)
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("R", (), {"get_profile": lambda _s, _u: {}})(),
    )
    return TestClient(app)


def test_state_defaults_to_experience(monkeypatch) -> None:
    """A user with no row at all falls out of the same derivation as everyone
    else — there is no separate default shape to keep in sync."""
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("R", (), {"latest_baseline": lambda _s, _u: None})(),
    )
    try:
        with _client(monkeypatch, _StateRepo()) as client:
            response = client.get("/onboarding/state")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["position"] == "experience"


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
        # Same rule for the direction axis: a caller that never mentions it must
        # not wipe what the user already told Myro.
        "avoid": None,
        "lean": None,
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


def test_target_context_changes_with_seniority() -> None:
    senior = target_context_hash(4, "Product Manager", "senior", "Bengaluru")
    entry = target_context_hash(4, "Product Manager", "entry", "Bengaluru")

    assert senior != entry
