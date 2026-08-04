from unittest.mock import MagicMock

from app.repositories.users import UsersRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "update", "upsert"):
        getattr(q, method).return_value = q

    list_result = MagicMock()
    list_result.data = data if isinstance(data, list) else ([] if data is None else [data])
    q.execute.return_value = list_result

    single_data = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
    single_result = MagicMock()
    single_result.data = single_data

    sq = MagicMock()
    sq.execute.return_value = single_result
    q.single.return_value = sq
    q.maybe_single.return_value = sq
    return q


def test_get_profile_returns_profile_row() -> None:
    row = {"id": "u1", "email": "u@example.com"}
    db = MagicMock()
    db.table.return_value = _q(row)

    result = UsersRepository(db).get_profile("u1")

    assert result == row


def test_update_profile_runs_partial_update_scoped_to_user_id() -> None:
    """PUT issues UPDATE-by-id only — never UPSERT. Row is pre-seeded by
    ensure_user_provisioned in get_current_user, and UPSERT would violate
    user_profiles.ninja_name NOT NULL (column omitted from PUT payloads)."""
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).update_profile("u1", {"full_name": "Ada"})

    query.update.assert_called_once_with({"full_name": "Ada"})
    query.update.return_value.eq.assert_called_once_with("id", "u1")
    query.upsert.assert_not_called()


def test_update_profile_stamps_target_updated_at_on_a_direction_change() -> None:
    """A direction change records when it happened.

    Compared against `last_match_run_at` (stamped only on match completion) this
    is what tells an outstanding match run from a finished one. Without it the
    onboarding shortlist cannot say "a run for this direction hasn't landed" and
    falls back to the previous direction's cards. Stamped at this seam, not at
    each caller, because onboarding, the point-of-use role edit and the Career
    Ops preflight all change direction.
    """
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).update_profile("u1", {"target_role_titles": ["Staff Engineer"]})

    written = query.update.call_args.args[0]
    assert written["target_updated_at"]


def test_update_profile_leaves_non_direction_writes_unstamped() -> None:
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).update_profile("u1", {"full_name": "Ada"})

    assert "target_updated_at" not in query.update.call_args.args[0]


def test_list_user_skill_records_normalizes_skill_rows() -> None:
    db = MagicMock()
    db.table.return_value = _q(
        [
            {
                "matched_level": 3,
                "proficiency_title": None,
                "evidence_text": "",
                "skills": {"taxonomy_key": "Python", "display_name": None},
            },
            {"matched_level": 2, "skills": None},
        ]
    )

    records = UsersRepository(db).list_user_skill_records("u1")

    assert len(records) == 1
    assert records[0].key == "Python"
    assert records[0].display_name == "Python"
    assert records[0].proficiency_title == "Excavator"
    assert records[0].evidence_text is None

