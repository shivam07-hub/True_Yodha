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


def test_update_profile_upserts_current_user_row() -> None:
    """update_profile must UPSERT so PUT can also seed an orphan row."""
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).update_profile("u1", {"full_name": "Ada"})

    query.upsert.assert_called_once_with(
        {"id": "u1", "full_name": "Ada"},
        on_conflict="id",
    )


def test_ensure_profile_exists_no_op_without_email() -> None:
    """No email in JWT (edge case) → don't try to insert a half-empty row."""
    db = MagicMock()
    UsersRepository(db).ensure_profile_exists("u1", email=None, full_name="Ada")
    db.table.assert_not_called()


def test_ensure_profile_exists_upserts_with_ignore_duplicates() -> None:
    """Idempotent provisioning: insert if missing, no-op if present."""
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).ensure_profile_exists(
        "u1",
        email="u@example.com",
        full_name="Ada",
    )

    query.upsert.assert_called_once_with(
        {"id": "u1", "email": "u@example.com", "full_name": "Ada"},
        on_conflict="id",
        ignore_duplicates=True,
    )


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

