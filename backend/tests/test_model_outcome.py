"""Model Outcome — Work Lane retries only unavailable (ADR-0008)."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from app.services import cv_parser, cv_workflow, llm_ranker
from app.services.background.dispatch import TransientJobError
from app.services.llm_provider import LLMProviderError
from app.services.matching import on_demand
from app.services.model_outcome import (
    ModelOutcome,
    retry_transient,
    split_cached_evals,
)
from app.services.onboarding_service import eval_context_key

from tests.test_on_demand_brain import _CTX, _FakeRepo

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260917140000_user_job_matches_eval_outcome.sql"
)


def test_eval_outcome_column_is_additive_and_excludes_unavailable() -> None:
    sql = MIGRATION.read_text()
    assert "add column if not exists eval_outcome text" in sql
    assert "or eval_outcome in ('ok', 'malformed', 'invalid_input')" in sql
    assert "in ('ok', 'malformed', 'invalid_input', 'unavailable')" not in sql
    assert "notify pgrst, 'reload schema'" in sql


def test_retry_transient_raises_only_for_unavailable() -> None:
    with pytest.raises(TransientJobError):
        retry_transient(ModelOutcome.unavailable("provider"), allow_retry=True)
    retry_transient(ModelOutcome.malformed(), allow_retry=True)
    retry_transient(ModelOutcome.invalid_input("short"), allow_retry=True)
    retry_transient(ModelOutcome.unavailable(), allow_retry=False)


def test_split_cached_evals_keeps_scores_and_settles_refusals() -> None:
    scored, settled = split_cached_evals({
        "ok": {"overall_score": 4.0},
        "provisional": {"overall_score": None},
        "refused": {"overall_score": None, "eval_outcome": "malformed"},
    })
    assert set(scored) == {"ok"}
    assert settled == frozenset({"refused"})


class _EvalProvider:
    def __init__(self, content: str | None = None, *, fail: bool = False) -> None:
        self.content = content
        self.fail = fail

    async def complete(self, _messages: list[dict[str, Any]], max_tokens: int = 0) -> str:
        if self.fail:
            raise LLMProviderError("down")
        return self.content or ""


def test_evaluate_job_classifies_provider_parse_and_ok() -> None:
    job = {"job_id": "j1", "title": "Eng", "company": "Acme", "description": "Build"}

    down = asyncio.run(llm_ranker.evaluate_job(job, "sys", _EvalProvider(fail=True)))
    assert down.kind == "unavailable"

    empty = asyncio.run(llm_ranker.evaluate_job(job, "sys", _EvalProvider("")))
    assert empty.kind == "malformed"

    garbage = asyncio.run(llm_ranker.evaluate_job(job, "sys", _EvalProvider("no json")))
    assert garbage.kind == "malformed"

    ok = asyncio.run(llm_ranker.evaluate_job(
        job, "sys", _EvalProvider('{"overall_score": 4.0, "recommendation": "Apply"}'),
    ))
    assert ok.kind == "ok"
    assert ok.value["overall_score"] == 4.0


def test_reparse_short_text_is_invalid_input() -> None:
    out = asyncio.run(cv_parser.reparse_structured_only("too short"))
    assert out.kind == "invalid_input"


def test_reparse_classifies_provider_and_garbage(monkeypatch: Any) -> None:
    long_text = "Experience as a software engineer. " * 8

    async def _down(*_a: Any, **_k: Any) -> str:
        raise LLMProviderError("down")

    monkeypatch.setattr(cv_parser, "get_llm_provider", lambda: type("P", (), {"complete": _down})())
    down = asyncio.run(cv_parser.reparse_structured_only(long_text))
    assert down.kind == "unavailable"

    async def _garbage(*_a: Any, **_k: Any) -> str:
        return "not json"

    monkeypatch.setattr(cv_parser, "get_llm_provider", lambda: type("P", (), {"complete": _garbage})())
    garbage = asyncio.run(cv_parser.reparse_structured_only(long_text))
    assert garbage.kind == "malformed"


def test_enrich_handler_does_not_retry_short_text() -> None:
    asyncio.run(cv_workflow._cv_structured_enrich_handler(
        {"raw_text": "tiny", "baseline_version_id": 1},
        allow_retry=True,
    ))


def test_enrich_handler_retries_unavailable(monkeypatch: Any) -> None:
    async def _down(_text: str) -> ModelOutcome:
        return ModelOutcome.unavailable("provider")

    monkeypatch.setattr(cv_workflow.cv_parser, "reparse_structured_only", _down)
    with pytest.raises(TransientJobError):
        asyncio.run(cv_workflow._cv_structured_enrich_handler(
            {"raw_text": "x", "baseline_version_id": 1},
            allow_retry=True,
        ))


def test_malformed_brain_persists_refusal_and_does_not_retry(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None)

    async def _fail(*_a: Any, **_k: Any) -> ModelOutcome:
        return ModelOutcome.malformed("unparseable")

    monkeypatch.setattr(on_demand.ranking, "rank_one", _fail)

    out = asyncio.run(on_demand.ensure_job_eval(
        repo, object(), "u1", "j1", allow_retry=True,
    ))
    assert out is None
    assert repo.persisted is not None
    assert repo.persisted["eval_outcome"] == "malformed"
    assert repo.persisted["overall_score"] is None
    assert repo.persisted["eval_context_hash"] == _CTX


def test_unavailable_brain_retries_and_does_not_persist(monkeypatch: Any) -> None:
    repo = _FakeRepo(cached=None)

    async def _fail(*_a: Any, **_k: Any) -> ModelOutcome:
        return ModelOutcome.unavailable("provider")

    monkeypatch.setattr(on_demand.ranking, "rank_one", _fail)

    with pytest.raises(TransientJobError):
        asyncio.run(on_demand.ensure_job_eval(
            repo, object(), "u1", "j1", allow_retry=True,
        ))
    assert repo.persisted is None


def test_open_does_not_reenqueue_a_settled_refusal(monkeypatch: Any) -> None:
    repo = _FakeRepo(
        cached={"overall_score": None, "eval_outcome": "malformed"},
        cached_ctx=_CTX,
    )
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(on_demand, "enqueue_job_eval", lambda uid, jid: enqueued.append((uid, jid)))

    out = on_demand.open_job_eval(repo, "u1", "j1")
    assert out is None
    assert enqueued == []


def test_open_reenqueues_when_context_moved(monkeypatch: Any) -> None:
    repo = _FakeRepo(
        cached={"overall_score": None, "eval_outcome": "malformed"},
        cached_ctx="stale",
    )
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(on_demand, "enqueue_job_eval", lambda uid, jid: enqueued.append((uid, jid)))

    out = on_demand.open_job_eval(repo, "u1", "j1")
    assert out is None
    assert enqueued == [("u1", "j1")]
    assert eval_context_key({"baseline_version_id": 7}) == _CTX
