from unittest.mock import MagicMock

from app.repositories.scores import ScoresRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "ilike", "limit", "order", "range", "upsert", "insert", "update"):
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


class _Result:
    def __init__(self, data: list[dict]) -> None:
        self.data = data


class _PagedQuery:
    """PostgREST: a select without .range() silently returns the first 1000."""

    def __init__(self, rows: list[dict], ranges: list[tuple[int, int]]) -> None:
        self._rows = rows
        self._ranges = ranges
        self._range: tuple[int, int] | None = None

    def select(self, _columns: str) -> "_PagedQuery":
        return self

    def order(self, _key: str) -> "_PagedQuery":
        return self

    def range(self, start: int, end: int) -> "_PagedQuery":
        self._range = (start, end)
        self._ranges.append((start, end))
        return self

    def execute(self) -> _Result:
        if self._range is None:
            return _Result(self._rows[:1000])
        start, end = self._range
        return _Result(self._rows[start : end + 1])


class _PagingDB:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self._tables = tables
        self.ranges: dict[str, list[tuple[int, int]]] = {name: [] for name in tables}

    def table(self, name: str) -> _PagedQuery:
        return _PagedQuery(self._tables[name], self.ranges[name])


def test_get_all_band_scores_pages_past_the_postgrest_cap() -> None:
    scores = [{"user_id": f"u{i}", "total_score": float(i)} for i in range(1001)]
    profiles = [{"id": f"u{i}", "target_seniority": "mid"} for i in range(1001)]
    db = _PagingDB({"mirror_scores": scores, "user_profiles": profiles})

    out = ScoresRepository(db).get_all_band_scores()

    assert len(out) == 1001
    assert db.ranges["mirror_scores"] == [(0, 999), (1000, 1999)]
    assert db.ranges["user_profiles"] == [(0, 999), (1000, 1999)]
    assert out[-1] == ("mid", 1000.0)

