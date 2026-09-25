"""The "best jobs" rule — services/matching/feed_warm.py.

Guards the feed shortlist warmer: it brain-ranks the fit-top candidates that
aren't cached yet in ONE batched pass, persists each with is_recommended=False
(so a warmed feed pick never floods the dashboard top-3), skips already-cached
candidates (idempotent / cost-free re-warm), respects the shortlist cap, and
fails soft to 0 when the brain returns nothing.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services.matching import feed_warm
from app.services.onboarding_service import eval_context_key

# The key the code derives for _FakeRepo's profile (baseline 7, no memory — the
# fake has no `_db`, so the Targeting Brief carries no facts).
_CTX = eval_context_key({"baseline_version_id": 7})


class _FakeRepo:
    def __init__(self, *, cached: set[str] | None = None, cached_ctx: str | None = _CTX) -> None:
        self._cached = cached or set()
        self._cached_ctx = cached_ctx
        self.persisted: list[dict[str, Any]] = []

    def get_cached_match_evals(self, _uid: str, job_ids: list[str], *, full: bool = False) -> dict[str, Any]:
        # A cached row records WHICH targeting context produced it; without that the
        # skip gate cannot tell a live verdict from a superseded one.
        return {
            j: {"overall_score": 4.0, "eval_context_hash": self._cached_ctx}
            for j in job_ids if j in self._cached
        }

    def get_jobs_by_ids(self, job_ids: list[str]) -> list[dict[str, Any]]:
        return [
            {"job_id": j, "job_title": f"Role {j}", "company_name": "Acme",
             "industry": "AI", "location": "Remote", "job_description": "Build."}
            for j in job_ids
        ]

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for j in job_ids or []:
            rows.append({"job_id": j, "is_primary": True, "skills": {"taxonomy_key": "Python"}})
            rows.append({"job_id": j, "is_primary": False, "skills": {"taxonomy_key": "Rust"}})
        return rows

    def get_user_skill_rows(self, _uid: str) -> list[dict[str, Any]]:
        return [{"matched_level": 3, "skills": {"taxonomy_key": "Python"}}]

    def get_user_profile_targeting(self, _uid: str) -> dict[str, Any]:
        return {"target_roles": ["MLE"], "cv_markdown": "CV"}

    def get_latest_baseline_id(self, _uid: str) -> int | None:
        return 7

    def upsert_single_match_eval(self, _uid: str, row: dict[str, Any]) -> None:
        self.persisted.append(row)


def _fake_evaluate_all(monkeypatch: Any, scores: dict[str, float] | None = None) -> None:
    async def _eval_all(_profile: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for job in jobs:
            jid = job["job_id"]
            out[jid] = {"overall_score": (scores or {}).get(jid, 4.0), "grade": "A",
                        "recommendation": "Apply", "summary": "solid", "strengths": [], "concerns": []}
        return out

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)


def test_warms_uncached_candidates_and_persists_unrecommended(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    _fake_evaluate_all(monkeypatch)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 3
    assert len(repo.persisted) == 3
    assert all(row["is_recommended"] is False for row in repo.persisted)
    assert {row["job_id"] for row in repo.persisted} == {"a", "b", "c"}
    assert all(row["baseline_version_id"] == 7 for row in repo.persisted)


def test_already_cached_candidates_are_skipped(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b"})

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("fully-cached shortlist must not call the brain")

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _boom)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


def test_only_uncached_reach_the_brain(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a"})
    seen: list[str] = []

    async def _eval_all(_p: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        seen.extend(j["job_id"] for j in jobs)
        return {j["job_id"]: {"overall_score": 4.0, "recommendation": "Apply"} for j in jobs}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 2
    assert set(seen) == {"b", "c"}  # 'a' was cached — never re-evaluated


def test_shortlist_cap_bounds_the_warm(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    _fake_evaluate_all(monkeypatch)
    candidates = [str(i) for i in range(50)]

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", candidates, limit=10))  # type: ignore[arg-type]
    assert warmed == 10  # only the top 10 are warmed, not all 50


def test_empty_brain_result_persists_nothing(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())

    async def _eval_all(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _eval_all)

    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


def test_a_live_match_run_does_not_take_the_brain(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    monkeypatch.setattr(
        "app.services.job_refresh._dispatch.user_has_live_refresh",
        lambda _uid: True,
    )

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("ranking owns the lane — warm must not call the brain")

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _boom)
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


def test_no_candidates_is_a_noop() -> None:
    repo = _FakeRepo()
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", []))  # type: ignore[arg-type]
    assert warmed == 0


# ── the Targeting Brief reaches the warmer ───────────────────────────────────
#
# Same contract as on_demand: these evals persist permanently per (user, job),
# so a memory-blind one here is a memory-blind verdict forever.

def test_warm_sees_memory_facts_via_targeting_brief(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=set())
    monkeypatch.setattr(
        feed_warm.targeting,
        "_facts",
        lambda _db, _uid: [feed_warm.targeting.MemoryFact(kind="aspiration", text="move into platform work")],
    )
    seen: dict[str, Any] = {}

    async def _capture(profile: dict[str, Any], jobs: list[dict[str, Any]], _prov: Any, _cb: Any = None) -> dict[str, Any]:
        seen.update(profile)
        return {j["job_id"]: {"overall_score": 4.0, "grade": "A", "recommendation": "Apply",
                             "summary": "s", "strengths": [], "concerns": []} for j in jobs}

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _capture)
    asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a"]))  # type: ignore[arg-type]

    assert seen["known_facts"] == ["aspiration: move into platform work"]
    assert seen["cv_markdown"] == "CV"  # _eval_profile still resolves the CV


# ── the warm re-rates across a context change, and stays free within one ────────

def test_a_shortlist_cached_under_a_superseded_context_is_re_warmed(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b", "c"}, cached_ctx="a-context-we-have-moved-past")
    _fake_evaluate_all(monkeypatch)
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 3
    assert all(row["eval_context_hash"] == _CTX for row in repo.persisted)


def test_a_shortlist_cached_under_the_current_context_still_costs_nothing(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached={"a", "b", "c"})

    async def _boom(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("a current-context shortlist must not call the brain")

    monkeypatch.setattr(feed_warm.llm_ranker, "evaluate_all", _boom)
    warmed = asyncio.run(feed_warm.warm_feed_shortlist(repo, object(), "u1", ["a", "b", "c"]))  # type: ignore[arg-type]
    assert warmed == 0
    assert repo.persisted == []


# ── which ten get a verdict (ADR-0022 direction fit) ─────────────────────────

_SALES = frozenset({"regional sales", "sales process"})


def _feed_row(job_id: str, skills: list[str] | None = None) -> dict[str, object]:
    return {"job_id": job_id, "main_skills": skills}


def test_the_direction_chooses_which_cards_are_rated() -> None:
    rows = [
        _feed_row("overlap1", ["Welding"]),
        _feed_row("overlap2", ["Forklift"]),
        _feed_row("on1", ["Regional Sales", "Sales Process"]),
    ]
    assert feed_warm.direction_first(rows, _SALES, limit=2) == ["on1", "overlap1"]


def test_the_feeds_own_order_is_kept_inside_each_group() -> None:
    on = ["Regional Sales", "Sales Process"]
    rows = [
        _feed_row("off1", ["Welding"]),
        _feed_row("on1", on),
        _feed_row("off2", ["Forklift"]),
        _feed_row("on2", on),
    ]
    assert feed_warm.direction_first(rows, _SALES, limit=4) == ["on1", "on2", "off1", "off2"]


def test_without_a_direction_the_feed_order_stands() -> None:
    rows = [_feed_row("a"), _feed_row("b"), _feed_row("c")]
    assert feed_warm.direction_first(rows, frozenset(), limit=2) == ["a", "b"]


def test_rows_without_an_id_are_skipped_and_ids_are_not_repeated() -> None:
    rows = [_feed_row(""), _feed_row("a"), _feed_row("a"), _feed_row("b")]
    assert feed_warm.direction_first(rows, frozenset(), limit=10) == ["a", "b"]


def test_one_batch_is_not_the_pile() -> None:
    from app.services.matching.published_list import ASPIRATION_READ

    assert feed_warm.DRAIN_BATCH < ASPIRATION_READ


def test_enqueue_feed_warm_queues_the_job_and_does_not_rank(monkeypatch: Any) -> None:
    """The request's only job. Awaiting `warm_feed_shortlist` here is the ~100s
    call the client used to abandon at 7s."""
    enqueued: list[tuple[Any, ...]] = []

    monkeypatch.setattr(feed_warm.background, "claim", lambda _key, _ttl: True)
    monkeypatch.setattr(
        feed_warm.background, "enqueue",
        lambda lane, job_type, **kwargs: enqueued.append((lane, job_type, kwargs)),
    )
    monkeypatch.setattr(
        "app.services.job_refresh._dispatch.user_has_live_refresh", lambda _uid: False,
    )

    async def _boom(*_args: Any, **_kwargs: Any) -> int:
        raise AssertionError("enqueue ranked inside the caller")

    monkeypatch.setattr(feed_warm, "warm_feed_shortlist", _boom)
    assert feed_warm.enqueue_feed_warm("u1") is True
    assert enqueued == [(
        "fast",
        "feed_warm",
        {"payload": {"user_id": "u1"}},
    )]


def test_enqueue_feed_warm_yields_to_a_live_match_run(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        "app.services.job_refresh._dispatch.user_has_live_refresh", lambda _uid: True,
    )
    monkeypatch.setattr(
        feed_warm.background, "enqueue",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("yielded into a queue")),
    )
    assert feed_warm.enqueue_feed_warm("u1") is False


def test_the_drain_finishes_on_the_cv_it_started_with(monkeypatch: Any) -> None:
    """A save during the run does not mix the new CV into this ranking."""
    seen: dict[str, Any] = {}
    enqueued: list[dict[str, Any]] = []

    class _Repo:
        def get_user_profile_targeting(self, _user_id: str) -> dict[str, Any]:
            return {
                "target_roles": ["Data Engineer"],
                "cv_markdown": "the cv they just saved",
            }

        def get_latest_baseline_id(self, _user_id: str) -> int:
            return 2

        def get_baseline_cv_markdown(self, _user_id: str, baseline_id: int) -> str:
            assert baseline_id == 1
            return "the cv this read started with"

        def get_candidate_job_ids_for_roles(self, roles: list[str], **_kw: Any) -> list[str]:
            assert roles == ["Data Engineer"]
            return [f"j{i}" for i in range(20)]

        def get_cached_match_evals(self, _user_id: str, _ids: list[str]) -> dict[str, Any]:
            return {}

    async def _warm(_repo: Any, _provider: Any, _user_id: str, ids: list[str], **kw: Any) -> int:
        seen["ids"] = ids
        seen["profile"] = kw["profile"]
        return len(ids)

    monkeypatch.setattr(feed_warm, "warm_feed_shortlist", _warm)
    monkeypatch.setattr(
        feed_warm.background, "enqueue",
        lambda _lane, _job, **kwargs: enqueued.append(kwargs["payload"]),
    )

    written = asyncio.run(feed_warm.run_feed_warm(
        _Repo(), object(), "u1", baseline_version_id=1,  # type: ignore[arg-type]
    ))

    assert written == feed_warm.DRAIN_BATCH
    assert seen["profile"]["baseline_version_id"] == 1
    assert seen["profile"]["cv_markdown"] == "the cv this read started with"
    assert enqueued == [{"user_id": "u1", "baseline_version_id": 1}]


def test_a_warm_already_in_flight_is_pending_and_not_queued_again(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        "app.services.job_refresh._dispatch.user_has_live_refresh", lambda _uid: False,
    )
    monkeypatch.setattr(feed_warm.background, "claim", lambda _key, _ttl: False)
    monkeypatch.setattr(
        feed_warm.background, "enqueue",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("double enqueue")),
    )
    assert feed_warm.enqueue_feed_warm("u1") is True
