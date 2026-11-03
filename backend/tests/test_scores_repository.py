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
    """PostgREST: at most 1000 rows a request. The walk pages on the key."""

    def __init__(self, rows: list[dict], cursors: list[object]) -> None:
        self._rows = rows
        self._cursors = cursors
        self._key: str | None = None
        self._after: object = None
        self._limit = 1000

    def select(self, _columns: str) -> "_PagedQuery":
        return self

    def order(self, key: str) -> "_PagedQuery":
        self._key = self._key or key
        return self

    def gt(self, _key: str, value: object) -> "_PagedQuery":
        self._after = value
        return self

    def limit(self, value: int) -> "_PagedQuery":
        self._limit = value
        return self

    def execute(self) -> _Result:
        self._cursors.append(self._after)
        key = self._key
        rows = self._rows
        if key and all(key in row for row in rows):
            rows = sorted(rows, key=lambda row: row[key])
        if self._after is not None:
            rows = [row for row in rows if row[key] > self._after]
        return _Result(rows[: min(self._limit, 1000)])


class _PagingDB:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self._tables = tables
        self.cursors: dict[str, list[object]] = {name: [] for name in tables}

    def table(self, name: str) -> _PagedQuery:
        return _PagedQuery(self._tables[name], self.cursors[name])


def test_get_all_band_scores_pages_past_the_postgrest_cap() -> None:
    scores = [{"id": i, "user_id": f"u{i}", "total_score": float(i)} for i in range(1001)]
    profiles = [{"id": f"u{i:04d}", "target_seniority": "mid"} for i in range(1001)]
    for score in scores:
        score["user_id"] = f"u{score['id']:04d}"
    db = _PagingDB({"mirror_scores": scores, "user_profiles": profiles})

    out = ScoresRepository(db).get_all_band_scores()

    assert len(out) == 1001
    assert db.cursors["mirror_scores"] == [None, 999]
    assert db.cursors["user_profiles"] == [None, "u0999"]
    assert out[-1] == ("mid", 1000.0)


def test_get_all_band_scores_weights_peers_on_the_fly() -> None:
    """A thin domain must not rank equal to a thick one just because stored totals did."""
    scores = [
        {
            "user_id": "thin",
            "total_score": 45.0,
            "domain_scores": {"IT": 30.0, "Engineering": 60.0},
            "domain_skill_counts": {"IT": 1, "Engineering": 1},
        },
        {
            "user_id": "thick",
            "total_score": 45.0,
            "domain_scores": {"IT": 30.0, "Engineering": 60.0},
            "domain_skill_counts": {"IT": 1, "Engineering": 9},
        },
    ]
    profiles = [
        {"id": "thin", "target_seniority": "mid"},
        {"id": "thick", "target_seniority": "mid"},
    ]
    db = _PagingDB({"mirror_scores": scores, "user_profiles": profiles})

    out = ScoresRepository(db).get_all_band_scores()

    assert out == [("mid", 45.0), ("mid", 57.0)]

