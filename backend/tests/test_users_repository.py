from unittest.mock import MagicMock

from app.repositories.users import UsersRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "update"):
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


def test_update_profile_updates_current_user_row() -> None:
    query = _q({})
    db = MagicMock()
    db.table.return_value = query

    UsersRepository(db).update_profile("u1", {"full_name": "Ada"})

    query.update.assert_called_once_with({"full_name": "Ada"})
    query.eq.assert_called_once_with("id", "u1")


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

