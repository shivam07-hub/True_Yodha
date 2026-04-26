from datetime import date
from unittest.mock import MagicMock

from app.repositories.diary import DiaryRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "order", "limit", "upsert"):
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


def test_get_total_score_returns_score_or_none() -> None:
    db = MagicMock()
    db.table.return_value = _q({"total_score": 64.5})

    assert DiaryRepository(db).get_total_score("u1") == 64.5

    db.table.return_value = _q(None)
    assert DiaryRepository(db).get_total_score("u1") is None


def test_get_daily_log_for_append_returns_existing_text_and_delta() -> None:
    row = {"entry_text": "Yesterday", "skills_delta": [{"taxonomy_key": "Python"}]}
    db = MagicMock()
    db.table.return_value = _q(row)

    result = DiaryRepository(db).get_daily_log_for_append("u1", date(2026, 4, 26))

    assert result == row


def test_skill_maps_hide_supabase_row_shape() -> None:
    skills_q = _q([{"id": 1, "taxonomy_key": "Python"}])
    user_skills_q = _q([{"skill_id": 1, "matched_level": 3}])
    db = MagicMock()
    db.table.side_effect = lambda name: skills_q if name == "skills" else user_skills_q
    repo = DiaryRepository(db)

    assert repo.skill_ids_by_taxonomy_key() == {"Python": 1}
    assert repo.user_skill_levels_by_skill_id("u1") == {1: 3}

