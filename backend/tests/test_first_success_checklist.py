from typing import Any

from app.services import onboarding_service
from app.services.onboarding_service import build_first_success_checklist


def test_first_success_checklist_uses_only_persisted_journey_facts() -> None:
    checklist = build_first_success_checklist(
        {"completed_at": "2026-07-20T01:00:00Z", "checklist_dismissed_at": None},
        skills_confirmed=True,
        direction_set=True,
        tailored_cv_exists=False,
        tracked_application_exists=True,
    )

    assert checklist["dismissed"] is False
    assert checklist["complete"] is False
    assert [(item["id"], item["done"]) for item in checklist["items"]] == [
        ("confirm_skills", True),
        ("set_direction", True),
        ("tailor_cv", False),
        ("track_application", True),
    ]


def test_first_success_checklist_completes_only_when_all_records_exist() -> None:
    checklist = build_first_success_checklist(
        {"completed_at": "2026-07-20T01:00:00Z"},
        skills_confirmed=True,
        direction_set=True,
        tailored_cv_exists=True,
        tracked_application_exists=True,
    )

    assert checklist["complete"] is True


def _set_direction(checklist: dict[str, Any]) -> dict[str, Any]:
    return next(item for item in checklist["items"] if item["id"] == "set_direction")


def test_finishing_onboarding_does_not_tick_a_direction_nobody_chose() -> None:
    """27 people have `completed_at` and no whole direction. The row was struck
    through for them, so the checklist never offered them the step."""
    row = _set_direction(build_first_success_checklist(
        {"completed_at": "2026-07-20T01:00:00Z"},
        skills_confirmed=True,
        direction_set=False,
        tailored_cv_exists=False,
        tracked_application_exists=False,
    ))

    assert row["done"] is False


def test_the_direction_row_opens_the_door_that_reaches_the_picker() -> None:
    """/onboarding/result is the tailor receipt for someone who finished on a job."""
    row = _set_direction(build_first_success_checklist(
        {},
        skills_confirmed=True,
        direction_set=False,
        tailored_cv_exists=False,
        tracked_application_exists=False,
    ))

    assert row["href"] == "/onboarding"


class _Applications:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.data = rows

    def __getattr__(self, _name: str):
        return lambda *_a, **_k: self

    def execute(self) -> "_Applications":
        return self


def _facts(monkeypatch, *, state: dict[str, Any], profile: dict[str, Any], tailored: bool) -> None:
    monkeypatch.setattr(
        onboarding_service, "OnboardingRepository",
        lambda _db: type("R", (), {"get_state": lambda _s, _u: state})(),
    )
    monkeypatch.setattr(
        onboarding_service, "UsersRepository",
        lambda _db: type("R", (), {"get_profile": lambda _s, _u: profile})(),
    )
    monkeypatch.setattr(
        onboarding_service, "CVVersionsRepository",
        lambda _db: type("R", (), {
            "latest_baseline": lambda _s, _u: {"skills_confirmed_at": "2026-07-20T01:00:00Z"},
            "has_tailored": lambda _s, _u: tailored,
        })(),
    )


def test_the_checklist_reads_the_direction_off_the_profile(monkeypatch) -> None:
    db = type("Db", (), {"table": lambda _s, _n: _Applications([])})()

    _facts(monkeypatch, state={"completed_at": "x"}, profile={}, tailored=False)
    assert _set_direction(onboarding_service.get_first_success_checklist(db, "u1"))["done"] is False

    _facts(monkeypatch, state={}, profile={"target_role_titles": ["Data Analyst"]}, tailored=True)
    checklist = onboarding_service.get_first_success_checklist(db, "u1")
    assert _set_direction(checklist)["done"] is True
    assert next(item for item in checklist["items"] if item["id"] == "tailor_cv")["done"] is True
