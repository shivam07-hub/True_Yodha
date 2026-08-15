from app.services.onboarding_service import build_first_success_checklist


def test_first_success_checklist_uses_only_persisted_journey_facts() -> None:
    checklist = build_first_success_checklist(
        {"completed_at": "2026-07-20T01:00:00Z", "checklist_dismissed_at": None},
        skills_confirmed=True,
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
        tailored_cv_exists=True,
        tracked_application_exists=True,
    )

    assert checklist["complete"] is True
