"""Tests for the Provider Budget + rate-limit-aware LLMProvider.complete (ADR-0008)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from openai import APITimeoutError, BadRequestError, RateLimitError

from app.services import llm_budget
from app.services.llm_provider import LLMProvider, LLMProviderError


# ── fakes ───────────────────────────────────────────────────────────────────────

def _msg(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _Completions:
    def __init__(self, behaviour):
        self._behaviour = behaviour
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        result = self._behaviour(self.calls)
        if isinstance(result, BaseException):
            raise result
        return result


class _Client:
    def __init__(self, behaviour):
        self.chat = SimpleNamespace(completions=_Completions(behaviour))


def _rate_limit(retry_after: str | None = None) -> RateLimitError:
    headers = {"retry-after": retry_after} if retry_after else {}
    req = httpx.Request("POST", "https://x/api")
    resp = httpx.Response(429, headers=headers, request=req)
    return RateLimitError("rate limited", response=resp, body=None)


def _bad_request() -> BadRequestError:
    req = httpx.Request("POST", "https://x/api")
    resp = httpx.Response(400, request=req)
    return BadRequestError("bad", response=resp, body=None)


# ── classification ────────────────────────────────────────────────────────────

def test_is_transient_classifies_rate_limit_and_timeout():
    assert llm_budget.is_transient(_rate_limit()) is True
    assert llm_budget.is_transient(APITimeoutError(request=httpx.Request("POST", "https://x"))) is True
    assert llm_budget.is_transient(_bad_request()) is False
    assert llm_budget.is_transient(ValueError("nope")) is False


def test_retry_after_seconds_parsed_from_header():
    assert llm_budget.retry_after_seconds(_rate_limit("12")) == 12.0
    assert llm_budget.retry_after_seconds(_rate_limit()) is None


def test_backoff_grows_and_respects_advice(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "llm_retry_base_seconds", 1.0)
    monkeypatch.setattr(llm_budget.settings, "llm_retry_max_seconds", 20.0)
    assert llm_budget.backoff_delay(0) == 1.0
    assert llm_budget.backoff_delay(1) == 2.0
    assert llm_budget.backoff_delay(2) == 4.0
    # server advice wins when larger
    assert llm_budget.backoff_delay(0, advised=9.0) == 9.0
    # clamp to max
    assert llm_budget.backoff_delay(10) == 20.0


# ── budget concurrency cap ──────────────────────────────────────────────────────

def test_provider_slot_caps_concurrency(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "llm_max_concurrency", 2)
    # force a fresh semaphore sized to 2
    llm_budget._semaphore = None

    state = {"in_flight": 0, "peak": 0}

    async def worker():
        async with llm_budget.provider_slot():
            state["in_flight"] += 1
            state["peak"] = max(state["peak"], state["in_flight"])
            await asyncio.sleep(0.02)
            state["in_flight"] -= 1

    async def run():
        await asyncio.gather(*[worker() for _ in range(10)])

    asyncio.run(run())
    assert state["peak"] <= 2


# ── global Redis budget seam ────────────────────────────────────────────────────

class _FakeBudgetRedis:
    """Emulates the leased-semaphore ZSET: member -> lease-expiry score."""

    def __init__(self) -> None:
        self.z: dict[str, float] = {}

    async def eval(self, _script, _numkeys, _key, now, expiry, limit, member):
        now_f = float(now)
        # ZREMRANGEBYSCORE -inf..now  → drop expired (score <= now)
        self.z = {m: s for m, s in self.z.items() if s > now_f}
        if len(self.z) < int(limit):
            self.z[member] = float(expiry)
            return 1
        return 0

    async def zrem(self, _key, member):
        self.z.pop(member, None)


def test_redis_provider_slot_caps_concurrency_globally(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "redis_url", "redis://fake:6379")
    monkeypatch.setattr(llm_budget.settings, "llm_max_concurrency", 3)
    fake = _FakeBudgetRedis()
    monkeypatch.setattr(llm_budget, "_get_async_redis", lambda: fake)
    monkeypatch.setattr(llm_budget, "_POLL_INTERVAL_SECONDS", 0.005)

    state = {"in_flight": 0, "peak": 0}

    async def worker():
        async with llm_budget.provider_slot():
            state["in_flight"] += 1
            state["peak"] = max(state["peak"], state["in_flight"])
            await asyncio.sleep(0.02)
            state["in_flight"] -= 1

    async def run():
        await asyncio.gather(*[worker() for _ in range(12)])

    asyncio.run(run())
    assert state["peak"] <= 3
    assert fake.z == {}  # all leases released


def test_redis_slot_released_frees_budget(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "redis_url", "redis://fake:6379")
    monkeypatch.setattr(llm_budget.settings, "llm_max_concurrency", 1)
    fake = _FakeBudgetRedis()
    monkeypatch.setattr(llm_budget, "_get_async_redis", lambda: fake)
    monkeypatch.setattr(llm_budget, "_POLL_INTERVAL_SECONDS", 0.005)

    async def run():
        async with llm_budget.provider_slot():
            assert len(fake.z) == 1
        assert len(fake.z) == 0  # released
        # second acquire succeeds because the first freed its slot
        async with llm_budget.provider_slot():
            assert len(fake.z) == 1

    asyncio.run(run())


# ── complete() retry behaviour ──────────────────────────────────────────────────

def test_complete_retries_transient_then_succeeds(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "llm_transient_retries", 2)
    monkeypatch.setattr(llm_budget.settings, "llm_retry_base_seconds", 0.0)
    monkeypatch.setattr(llm_budget.settings, "llm_retry_max_seconds", 0.0)

    def behaviour(call_n):
        return _rate_limit() if call_n == 1 else _msg("ok")

    client = _Client(behaviour)
    provider = LLMProvider([(client, "model-a", None)])
    out = asyncio.run(provider.complete([{"role": "user", "content": "hi"}]))
    assert out == "ok"
    assert client.chat.completions.calls == 2  # one retry, same provider


def test_complete_non_transient_falls_through_immediately(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "llm_transient_retries", 2)

    a = _Client(lambda n: _bad_request())          # permanent → no retry, next
    b = _Client(lambda n: _msg("from-b"))
    provider = LLMProvider([(a, "model-a", None), (b, "model-b", None)])
    out = asyncio.run(provider.complete([{"role": "user", "content": "hi"}]))
    assert out == "from-b"
    assert a.chat.completions.calls == 1  # NOT retried — moved on at once


def test_complete_raises_when_all_exhausted(monkeypatch):
    monkeypatch.setattr(llm_budget.settings, "llm_transient_retries", 1)
    monkeypatch.setattr(llm_budget.settings, "llm_retry_base_seconds", 0.0)
    monkeypatch.setattr(llm_budget.settings, "llm_retry_max_seconds", 0.0)

    a = _Client(lambda n: _rate_limit())
    provider = LLMProvider([(a, "model-a", None)])
    with pytest.raises(LLMProviderError):
        asyncio.run(provider.complete([{"role": "user", "content": "hi"}]))
    assert a.chat.completions.calls == 2  # initial + 1 retry, then give up
