"""Supabase I/O tests for the scoring package — mocked DB, no network.

Covers:
  - fetch_skill_demand        (market.py)
  - fetch_aspiration_skills   (aspirations.py)
  - record_cv_score           (orchestrator.py — CV ingest facade)
  - recompute_score           (orchestrator.py — recompute facade)
  - project_score             (orchestrator.py — no-write facade)
"""

from unittest.mock import MagicMock, patch

import pytest

from app.repositories.scores import ScoreRecomputeInputs, ScoresRepository
from app.services.scoring import (
    fetch_aspiration_skills,
    fetch_skill_demand,
    project_score,
    recompute_score,
    record_cv_score,
)
from app.services.scoring import market as _scoring_market


# ── Helper ────────────────────────────────────────────────────────────────────


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    """Fluent Supabase query chain mock."""
    q = MagicMock()
    for method in ("select", "eq", "ilike", "order", "limit", "range", "upsert", "insert", "update"):
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


# ── fetch_skill_demand ────────────────────────────────────────────────────────


class TestFetchSkillDemand:
    def setup_method(self) -> None:
        _scoring_market._DEMAND_CACHE.clear()
        _scoring_market._SCOPED_DEMAND_CACHE.clear()
        _scoring_market._DEMAND_CACHE_TS = 0.0

    def test_returns_demand_map(self) -> None:
        rows = [
            {"job_id": "j1", "is_primary": True,  "skills": {"taxonomy_key": "Python"}},
            {"job_id": "j1", "is_primary": False, "skills": {"taxonomy_key": "SQL"}},
        ]
        db = MagicMock()
        db.table.return_value = _q(rows)
        result = fetch_skill_demand(ScoresRepository(db))
        assert result["Python"] == 2
        assert result["SQL"] == 1

    def test_none_skills_skipped(self) -> None:
        rows = [{"job_id": "j1", "is_primary": True, "skills": None}]
        db = MagicMock()
        db.table.return_value = _q(rows)
        assert fetch_skill_demand(ScoresRepository(db)) == {}

    def test_empty_result_returns_empty(self) -> None:
        db = MagicMock()
        db.table.return_value = _q([])
        assert fetch_skill_demand(ScoresRepository(db)) == {}

    def test_scoped_lookup_uses_repo_demand_without_full_scan(self) -> None:
        repo = MagicMock()
        repo.get_skill_demand_for_keys.return_value = {"Django": 7}
        repo.list_market_skill_rows.side_effect = AssertionError("must not scan every job skill")

        assert fetch_skill_demand(repo, {"Django"}) == {"Django": 7}
        repo.get_skill_demand_for_keys.assert_called_once_with({"Django"})
        repo.list_market_skill_rows.assert_not_called()

    def test_scoped_lookup_fetches_only_uncached_skill_keys(self) -> None:
        repo = MagicMock()
        repo.get_skill_demand_for_keys.side_effect = [{"Django": 7}, {"Flask": 3}]

        assert fetch_skill_demand(repo, {"Django"}) == {"Django": 7}
        assert fetch_skill_demand(repo, {"Django", "Flask"}) == {"Django": 7, "Flask": 3}

        assert repo.get_skill_demand_for_keys.call_args_list == [
            (({"Django"},),),
            (({"Flask"},),),
        ]

    def test_query_failure_returns_empty(self) -> None:
        q = _q([])
        q.execute.side_effect = RuntimeError("upstream returned html")
        db = MagicMock()
        db.table.return_value = q
        assert fetch_skill_demand(ScoresRepository(db)) == {}


# ── get_skill_demand_for_keys — request size must not track input size ────────


class TestDemandKeyLookupIsChunked:
    """The 2026-08-03 outage in miniature.

    Demand was fetched by sending every taxonomy key back as a `taxonomy_key=in.(…)`
    URL filter. A user targeting two role families expands to 1,642 keys / 33.5 KB
    of raw key text; the resulting GET exceeded the edge's URI limit and returned a
    non-JSON body, which postgrest surfaced as

        {'code': 400, 'message': 'JSON could not be generated', 'details': b'Bad Request'}

    `fetch_skill_demand` catches that and returns {}, so every gap silently weighed
    0 and the "fix this first" ordering was arbitrary with nothing on fire.

    Falsified: delete the chunk loop in `get_skill_demand_for_keys` and
    `test_no_single_request_carries_the_whole_key_set` fails with one 1,642-key
    request — i.e. it reproduces the URL that broke.
    """

    def _repo_recording_in_filters(self, calls: list[list[str]]) -> ScoresRepository:
        db = MagicMock()
        q = _q([])

        def _record(_column: str, values: list[str]) -> MagicMock:
            calls.append(list(values))
            return q

        q.in_.side_effect = _record
        db.table.return_value = q
        db.rpc.return_value = _q([])
        return ScoresRepository(db)

    def test_no_single_request_carries_the_whole_key_set(self) -> None:
        calls: list[list[str]] = []
        repo = self._repo_recording_in_filters(calls)
        keys = {f"Taxonomy Key Number {index} (Long Enough To Matter)" for index in range(1_642)}

        repo.get_skill_demand_for_keys(keys)

        assert calls, "the key lookup must actually query"
        assert len(calls) > 1, "1,642 keys must not ride in one filter"
        # And every key is still asked about — chunking must not silently truncate.
        assert {key for chunk in calls for key in chunk} == keys

    def test_url_stays_small_regardless_of_input(self) -> None:
        calls: list[list[str]] = []
        repo = self._repo_recording_in_filters(calls)
        keys = {f"Taxonomy Key Number {index} (Long Enough To Matter)" for index in range(1_642)}

        repo.get_skill_demand_for_keys(keys)

        # The real failure was byte size, not item count. ~8 KB is the smallest
        # URI limit in the path (edge proxy); stay an order of magnitude under it.
        worst = max(sum(len(key) + 3 for key in chunk) for chunk in calls)
        assert worst < 8_000, f"largest chunk would build a ~{worst}B filter"

    def test_small_set_is_a_single_request(self) -> None:
        calls: list[list[str]] = []
        repo = self._repo_recording_in_filters(calls)

        repo.get_skill_demand_for_keys({"Python (Programming Language)", "Data Science"})

        assert len(calls) == 1


# ── fetch_aspiration_skills ───────────────────────────────────────────────────


class TestFetchAspirationSkills:
    def test_query_failure_returns_empty(self) -> None:
        q = _q([])
        q.execute.side_effect = RuntimeError("upstream returned html")
        db = MagicMock()
        db.rpc.side_effect = RuntimeError("upstream returned html")
        db.table.return_value = q
        assert fetch_aspiration_skills(ScoresRepository(db), ["Data Analyst"]) == {}


# ── Shared facade fixtures ────────────────────────────────────────────────────


CLUSTER_MAPS = (
    {"Web Frameworks": ["Django", "Flask"]},
    {"Django": "Web Frameworks", "Flask": "Web Frameworks"},
    {"Web Frameworks": "IT"},
)


def _make_facade_db() -> MagicMock:
    """DB mock wired for orchestrator facade tests."""
    demand_q = _q([{"job_id": "j1", "is_primary": True, "skills": {"taxonomy_key": "Django"}}])
    scores_q = _q({"user_id": "u1", "total_score": 20.0})
    history_q = _q([])
    db = MagicMock()

    def _table(name: str) -> MagicMock:
        return {
            "job_skills":           demand_q,
            "mirror_scores":        scores_q,
            "mirror_score_history": history_q,
        }.get(name, _q([]))

    db.table.side_effect = _table
    return db


def _patch_orchestrator_internals() -> tuple:
    cluster_patch = patch(
        "app.services.scoring.orchestrator._build_cluster_maps",
        return_value=CLUSTER_MAPS,
    )
    skill_patch = patch(
        "app.services.taxonomy_loader.ensure_skill_in_db",
        return_value=1,
    )
    return cluster_patch, skill_patch


# ── record_cv_score (CV ingest facade) ────────────────────────────────────────


class TestRecordCvScore:
    def setup_method(self) -> None:
        _scoring_market._DEMAND_CACHE.clear()
        _scoring_market._SCOPED_DEMAND_CACHE.clear()
        _scoring_market._DEMAND_CACHE_TS = 0.0

    def test_returns_score_row_for_valid_signal(self) -> None:
        cp, sp = _patch_orchestrator_internals()
        with cp, sp:
            signals = [
                {"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}
            ]
            result = record_cv_score(ScoresRepository(_make_facade_db()), "u1", signals)
            assert "total_score" in result

    def test_raises_when_no_signals_persisted(self) -> None:
        cluster_patch = patch(
            "app.services.scoring.orchestrator._build_cluster_maps",
            return_value=CLUSTER_MAPS,
        )
        skill_patch = patch("app.services.taxonomy_loader.ensure_skill_in_db", return_value=None)
        with cluster_patch, skill_patch:
            with pytest.raises(ValueError, match="No valid skills could be persisted"):
                record_cv_score(
                    ScoresRepository(_make_facade_db()),
                    "u1",
                    [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}],
                )

    def test_skips_market_lookup(self) -> None:
        cp, sp = _patch_orchestrator_internals()
        scores_q = _q({"user_id": "u1", "total_score": 20.0})
        history_q = _q([])
        db = MagicMock()

        def _table(name: str) -> MagicMock:
            if name == "jobs":
                raise AssertionError("jobs table should not be queried during CV upload scoring")
            return {
                "mirror_scores":        scores_q,
                "mirror_score_history": history_q,
            }.get(name, _q([]))

        db.table.side_effect = _table
        with cp, sp:
            result = record_cv_score(
                ScoresRepository(db),
                "u1",
                [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": ""}],
            )
            assert result is not None


# ── recompute_score (recompute facade) ────────────────────────────────────────


class TestRecomputeScore:
    def setup_method(self) -> None:
        _scoring_market._DEMAND_CACHE.clear()
        _scoring_market._SCOPED_DEMAND_CACHE.clear()
        _scoring_market._DEMAND_CACHE_TS = 0.0

    def test_recompute_uses_stored_skill_levels(self) -> None:
        cp, sp = _patch_orchestrator_internals()
        with cp, sp, patch.object(
            ScoresRepository,
            "get_recompute_inputs",
            return_value=ScoreRecomputeInputs(skill_level_map={"Django": 3}, target_roles=[]),
        ):
            result = recompute_score(ScoresRepository(_make_facade_db()), "u1")
            assert result is not None
            assert "total_score" in result


# ── project_score (no-write facade) ───────────────────────────────────────────


class TestProjectScore:
    def setup_method(self) -> None:
        _scoring_market._DEMAND_CACHE.clear()
        _scoring_market._DEMAND_CACHE_TS = 0.0

    def test_returns_projection_without_writes(self) -> None:
        cp, _ = _patch_orchestrator_internals()
        db = _make_facade_db()
        scores_repo = ScoresRepository(db)
        with cp:
            projection = project_score(scores_repo, {"Django": 3}, include_market_signals=False)
        assert projection.total_score >= 0
        assert projection.skills_assessed == 1

    def test_dry_run_does_not_persist(self) -> None:
        cp, sp = _patch_orchestrator_internals()
        db = MagicMock()

        def _table(name: str) -> MagicMock:
            if name in ("mirror_scores", "mirror_score_history"):
                raise AssertionError(f"project_score must not write to {name}")
            return _q([])

        db.table.side_effect = _table
        with cp, sp:
            projection = project_score(
                ScoresRepository(db), {"Django": 3}, include_market_signals=False
            )
        assert projection.total_score >= 0
