from __future__ import annotations

from typing import Any

from app.services import onboarding_first_role, onboarding_service


class _JobsRepo:
    def __init__(self) -> None:
        self.writes: list[tuple[str, str, dict[str, Any]]] = []

    def upsert_application(self, user_id: str, job_id: str, payload: dict[str, Any]) -> None:
        self.writes.append((user_id, job_id, payload))

    def get_application_with_job(self, _user_id: str, job_id: str) -> dict[str, Any] | None:
        return {"job_id": job_id} if self.writes else None

    def get_user_applications(self, _user_id: str) -> list[dict[str, Any]]:
        return []


class _OnboardingRepo:
    def __init__(self) -> None:
        self.jobs_saved: list[str] = []
        self.completed: list[str] = []

    def mark_job_saved(self, user_id: str) -> None:
        self.jobs_saved.append(user_id)

    def mark_completed(self, user_id: str) -> None:
        self.completed.append(user_id)


def test_door_kind_appears_after_skills_when_there_is_no_direction(monkeypatch) -> None:
    state = {}
    profile: dict[str, Any] = {}
    baseline = {"id": 17, "skills_confirmed_at": "now"}
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: profile})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("CV", (), {"latest_baseline": lambda _self, _uid: baseline})(),
    )

    result = onboarding_service.get_result(object(), "u1")

    assert result["kind"] == "awaiting_job_choice"
    assert result["baseline_version_id"] == 17
    assert result["journey_step"] == 2
    assert result["furthest_step"] == 2


def test_saved_first_role_accepts_an_imported_or_extension_job() -> None:
    for source in ("onboarding_import", "extension"):
        jobs = _JobsRepo()
        jobs.get_user_applications = lambda _user_id, source=source: [{
            "job_id": "ext_1",
            "source": source,
            "jobs": {"job_title": "Product Manager", "company_name": "Acme"},
        }]
        assert onboarding_first_role.saved_first_role(jobs, "u1")["job_id"] == "ext_1"


def test_accept_first_job_completes_with_a_tailor_receipt_and_retries(monkeypatch) -> None:
    class _Jobs(_JobsRepo):
        def __init__(self) -> None:
            super().__init__()
            self.owned = {
                "job_id": "ext_1",
                "source": "user_discovery",
                "jobs": {"job_title": "Product Manager", "company_name": "Acme"},
            }

        def get_application_with_job(self, _user_id: str, job_id: str) -> dict[str, Any] | None:
            return self.owned if self.owned and self.owned["job_id"] == job_id else None

        def upsert_application(self, user_id: str, job_id: str, payload: dict[str, Any]) -> None:
            super().upsert_application(user_id, job_id, payload)
            self.owned = {**self.owned, **payload, "job_id": job_id}

        def get_user_applications(self, _user_id: str) -> list[dict[str, Any]]:
            return [self.owned] if self.owned.get("source") in onboarding_first_role.FIRST_ROLE_SOURCES else []

    jobs = _Jobs()
    state = _OnboardingRepo()
    monkeypatch.setattr(onboarding_first_role, "OnboardingRepository", lambda _db: state)

    first = onboarding_first_role.accept_first_job(object(), jobs, "u1", "ext_1")
    second = onboarding_first_role.accept_first_job(object(), jobs, "u1", "ext_1")

    assert first == {
        "kind": "first_role_saved",
        "job_id": "ext_1",
        "title": "Product Manager",
        "company": "Acme",
        "tailor_href": "/cv?jobId=ext_1",
    }
    assert second == first
    assert jobs.writes == [("u1", "ext_1", {"status": "saved", "source": "onboarding_import"})]
    assert state.jobs_saved == ["u1", "u1"]
    assert state.completed == ["u1", "u1"]


def test_saved_first_role_rebuilds_the_receipt_after_reload() -> None:
    jobs = _JobsRepo()
    jobs.get_user_applications = lambda _user_id: [{
        "job_id": "job/7",
        "source": "onboarding_shortlist",
        "jobs": {"job_title": "Data Analyst", "company_name": "Acme"},
    }]

    assert onboarding_first_role.saved_first_role(jobs, "u1") == {
        "job_id": "job/7",
        "title": "Data Analyst",
        "company": "Acme",
        "tailor_href": "/cv?jobId=job%2F7",
    }


def test_onboarding_result_recovers_saved_receipt_after_reload(monkeypatch) -> None:
    state = {"completed_at": "now", "credible_job_saved_at": "now"}
    monkeypatch.setattr(
        onboarding_service,
        "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service,
        "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: {}})(),
    )
    monkeypatch.setattr(
        onboarding_service,
        "CVVersionsRepository",
        lambda _db: type("CV", (), {"latest_baseline": lambda _self, _uid: {"id": 17}})(),
    )
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: object())
    monkeypatch.setattr(
        onboarding_first_role,
        "saved_first_role",
        lambda _repo, _uid: {
            "job_id": "job-7",
            "title": "Data Analyst",
            "company": "Acme",
            "tailor_href": "/cv?jobId=job-7",
        },
    )

    assert onboarding_service.get_result(object(), "u1") == {
        "kind": "first_role_saved",
        "job_id": "job-7",
        "title": "Data Analyst",
        "company": "Acme",
        "tailor_href": "/cv?jobId=job-7",
        # The journey is complete, so every step is behind the user and
        # reviewable — the client needs the ceiling to know that.
        "furthest_step": 2,
    }


def _returning_with_a_saved_job(monkeypatch, profile: dict[str, Any], saved: dict[str, str] | None) -> None:
    state = {"completed_at": "now", "credible_job_saved_at": "now"}
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: profile})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("CV", (), {
            "latest_baseline": lambda _self, _uid: {"id": 17, "skills_confirmed_at": "now"},
        })(),
    )
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: object())
    monkeypatch.setattr(onboarding_first_role, "saved_first_role", lambda _repo, _uid: saved)


def test_a_whole_direction_beats_the_saved_job(monkeypatch) -> None:
    """The picker saves and goes to Market. If the receipt won here, a reload would
    throw them back at /cv for a job they already chose past."""
    _returning_with_a_saved_job(
        monkeypatch,
        {
            "target_role_titles": ["Data Analyst"],
            "target_roles": ["Data and Analytics"],
            "target_seniority": "mid",
        },
        {"job_id": "job-7", "title": "Data Analyst", "company": "Acme", "tailor_href": "/cv?jobId=job-7"},
    )

    result = onboarding_service.get_result(object(), "u1")

    assert result["kind"] == "onboarding_complete"
    assert result["redirect_to"] == "/market"


def test_a_saved_job_they_removed_still_asks_for_the_direction(monkeypatch) -> None:
    _returning_with_a_saved_job(monkeypatch, {}, None)
    monkeypatch.setattr(
        onboarding_service, "_awaiting_target_payload",
        lambda *_a, **_k: {"kind": "awaiting_target", "journey_step": 2},
    )

    assert onboarding_service.get_result(object(), "u1")["kind"] == "awaiting_target"


def test_completed_without_a_direction_falls_through_to_direction(monkeypatch) -> None:
    """The closed door. 111 users carried `completed_at` (or the profile flag)
    with no canonical direction, from a window when the gate was leaky. The early
    return sent them to /market before anything checked, so the one step that
    matters — users with a target apply at 26%, this cohort at 9% — was
    unreachable. A flag is not the fact.
    """
    state = {"completed_at": "now"}          # complete, no first-role receipt
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: {}})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("CV", (), {"latest_baseline": lambda _self, _uid: None})(),
    )
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: object())

    result = onboarding_service._current_result(object(), "u1")

    assert result.get("redirect_to") != "/market"


def test_a_completed_user_with_a_real_direction_still_lands_on_market(monkeypatch) -> None:
    """The fix must not re-route everyone who legitimately finished."""
    state = {"completed_at": "now"}
    profile = {
        "target_role_titles": ["Data Analyst"],
        "target_roles": ["Data and Analytics"],
        "target_seniority": "mid",
    }
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("State", (), {"get_state": lambda _self, _uid: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("Users", (), {"get_profile": lambda _self, _uid: profile})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("CV", (), {"latest_baseline": lambda _self, _uid: {"id": 1}})(),
    )
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: object())

    result = onboarding_service._current_result(object(), "u1")

    assert result["redirect_to"] == "/market"
    assert result["kind"] == "onboarding_complete"
