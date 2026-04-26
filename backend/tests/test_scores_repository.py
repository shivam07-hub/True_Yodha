from unittest.mock import MagicMock

from app.repositories.scores import ScoresRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "ilike", "limit", "range", "upsert", "insert", "update"):
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


def test_get_mirror_score_returns_latest_row() -> None:
    row = {"user_id": "u1", "total_score": 72.5}
    db = MagicMock()
    db.table.return_value = _q(row)

    result = ScoresRepository(db).get_mirror_score("u1")

    assert result == row


def test_get_mirror_score_returns_none_when_missing() -> None:
    db = MagicMock()
    db.table.return_value = _q(None)

    result = ScoresRepository(db).get_mirror_score("u1")

    assert result is None


def test_get_recompute_inputs_maps_skill_levels_and_target_roles() -> None:
    skills_q = _q(
        [
            {"matched_level": 3, "skills": {"taxonomy_key": "Python"}},
            {"matched_level": 2, "skills": {"taxonomy_key": "SQL"}},
            {"matched_level": 5, "skills": None},
        ]
    )
    profile_q = _q({"target_roles": [" Data Analyst ", "", "ML Engineer"]})
    db = MagicMock()
    db.table.side_effect = lambda name: skills_q if name == "user_skills" else profile_q

    result = ScoresRepository(db).get_recompute_inputs("u1")

    assert result.skill_level_map == {"Python": 3, "SQL": 2}
    assert result.target_roles == ["Data Analyst", "ML Engineer"]

