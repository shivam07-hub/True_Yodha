from unittest.mock import MagicMock

import pytest

from app.repositories.onboarding import OnboardingRepository


def _query(data: list[dict] | dict | None = None) -> MagicMock:
    query = MagicMock()
    for method in (
        "select",
        "eq",
        "is_",
        "limit",
        "order",
        "update",
        "upsert",
        "delete",
    ):
        getattr(query, method).return_value = query

    result = MagicMock()
    if isinstance(data, list):
        result.data = data
    elif isinstance(data, dict):
        result.data = [data]
    else:
        result.data = []
    query.execute.return_value = result
    return query


def test_get_state_scopes_read_to_user() -> None:
    query = _query({"user_id": "u1", "status": "draft"})
    db = MagicMock()
    db.table.return_value = query

    state = OnboardingRepository(db).get_state("u1")

    assert state == {"user_id": "u1", "status": "draft"}
    db.table.assert_called_once_with("user_onboarding_state")
    query.eq.assert_called_once_with("user_id", "u1")


def test_patch_state_upserts_only_approved_fields() -> None:
    query = _query()
    db = MagicMock()
    db.table.return_value = query

    OnboardingRepository(db).patch_state(
        "u1",
        {"current_stage": "target", "entry_mode": "uploaded_cv"},
    )

    payload = query.upsert.call_args.args[0]
    assert payload["user_id"] == "u1"
    assert payload["current_stage"] == "target"
    assert payload["entry_mode"] == "uploaded_cv"
    assert "updated_at" in payload
    assert query.upsert.call_args.kwargs == {"on_conflict": "user_id"}


def test_patch_state_rejects_unknown_fields() -> None:
    db = MagicMock()

    with pytest.raises(ValueError, match="Unsupported onboarding state fields"):
        OnboardingRepository(db).patch_state("u1", {"user_id": "other"})


def test_save_generator_answer_merges_existing_answers() -> None:
    query = _query(
        {
            "user_id": "u1",
            "generator_answers": {"1": {"preferred_name": "Ada"}},
        }
    )
    db = MagicMock()
    db.table.return_value = query

    OnboardingRepository(db).save_generator_answer(
        "u1",
        2,
        {"roles": [{"title": "Engineer"}]},
    )

    payload = query.upsert.call_args.args[0]
    assert payload["generator_step"] == 2
    assert payload["generator_answers"] == {
        "1": {"preferred_name": "Ada"},
        "2": {"roles": [{"title": "Engineer"}]},
    }


def test_mark_completed_clears_redundant_working_content() -> None:
    query = _query()
    db = MagicMock()
    db.table.return_value = query

    OnboardingRepository(db).mark_completed("u1")

    payload = query.upsert.call_args.args[0]
    assert payload["status"] == "completed"
    assert payload["description_text"] is None
    assert payload["generated_draft"] is None
    assert payload["generator_answers"] == {}
    assert payload["completed_at"] == payload["result_seen_at"]


def test_mark_activated_records_only_first_action() -> None:
    query = _query()
    db = MagicMock()
    db.table.return_value = query

    OnboardingRepository(db).mark_activated("u1", "save_credible_job")

    query.update.assert_called_once()
    query.eq.assert_called_once_with("user_id", "u1")
    query.is_.assert_called_once_with("activated_at", "null")
    assert query.update.call_args.args[0]["activation_kind"] == "save_credible_job"


def test_replace_skill_overrides_is_baseline_scoped() -> None:
    query = _query()
    db = MagicMock()
    db.table.return_value = query
    repo = OnboardingRepository(db)

    repo.replace_skill_overrides(
        "u1",
        42,
        [
            {
                "skill_id": 7,
                "action": "exclude",
                "evidence_text": "Built Python services",
                "source_location": {"section": "experience"},
            }
        ],
    )

    query.delete.assert_called_once_with()
    assert query.eq.call_args_list[0].args == ("user_id", "u1")
    assert query.eq.call_args_list[1].args == ("baseline_version_id", 42)
    rows = query.upsert.call_args.args[0]
    assert rows == [
        {
            "user_id": "u1",
            "baseline_version_id": 42,
            "skill_id": 7,
            "action": "exclude",
            "evidence_text": "Built Python services",
            "source_location": {"section": "experience"},
        }
    ]
    assert query.upsert.call_args.kwargs == {
        "on_conflict": "user_id,baseline_version_id,skill_id"
    }
