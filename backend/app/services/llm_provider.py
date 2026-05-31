"""
Unified LLM provider abstraction for the Myro cloud stack.

OpenRouter caps the native `models` fallback array at 3 entries per call, so the
cost-tier ladder is split into multiple ProviderEntry chunks of ≤3 models each.
The outer Python loop in LLMProvider.complete walks the chunks in order.

Fallback order:
  1. OpenRouter — free tier  (gpt-oss-120b, llama-3.3-70b, qwen3-coder, nemotron)
  2. OpenRouter — cheap paid ($0.04–$0.15/M)
  3. OpenRouter — last resort (kimi-k2.6 → kimi-k2.5, $0.75/M)
  4. Groq       — llama-3.3-70b-versatile
  5. Gemini     — gemini-2.0-flash-lite

Scope: Myro cloud stack only. The scraper (skill_tagger.py / LM Studio) is intentionally
separate — do not merge those stacks.

Callers: llm_ranker, llm_polish (per-job CV polish via /cv/versions),
cv_parser, diary processor.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.config import settings
from app.services import llm_budget

logger = logging.getLogger(__name__)

_OR_HEADERS = {"HTTP-Referer": "https://truemirror.vercel.app", "X-Title": "Truth Mirror"}
_OR_BASE = "https://openrouter.ai/api/v1"
_GROQ_BASE = "https://api.groq.com/openai/v1"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"

# OpenRouter caps the `models` fallback array at this length per call.
OR_MAX_MODELS_PER_CALL = 3

# Ordered chunks of OpenRouter models. Each chunk is one API call with native
# fallback inside. Order = cost-tier ladder; cheaper chunks tried first.
OR_TIERS: list[list[str]] = [
    # Tier 1a: free, top picks
    [
        "openai/gpt-oss-120b:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen3-coder:free",
    ],
    # Tier 1b: free, remaining
    ["nvidia/nemotron-3-super-120b-a12b:free"],
    # Tier 2a: cheap paid — $0.04–$0.05/M
    [
        "google/gemma-3-4b-it",
        "google/gemma-3-12b-it",
        "ibm-granite/granite-4.1-8b",
    ],
    # Tier 2b: cheap paid — $0.05–$0.07/M
    [
        "openai/gpt-5-nano",
        "z-ai/glm-4.7-flash",
        "google/gemma-4-26b-a4b-it",
    ],
    # Tier 2c: cheap paid — $0.10–$0.15/M
    [
        "meta-llama/llama-3.3-70b-instruct",
        "openai/gpt-4o-mini",
    ],
    # Tier 3: last resort — $0.75/M
    [
        "moonshotai/kimi-k2.6",
        "moonshotai/kimi-k2.5",
    ],
]

# Enforce vendor cap at import time — fail fast on deploy, never at user click.
for _tier in OR_TIERS:
    if not _tier or len(_tier) > OR_MAX_MODELS_PER_CALL:
        raise RuntimeError(
            f"OR_TIERS chunk violates OR_MAX_MODELS_PER_CALL={OR_MAX_MODELS_PER_CALL}: {_tier}"
        )

GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile"

# OR_TIERS[0:FREE_OR_TIER_COUNT] are free tiers.
# get_cv_upload_provider() skips these to avoid free-tier exhaustion on the
# user-blocking CV upload path.
FREE_OR_TIER_COUNT = 2


class LLMProviderError(Exception):
    """Raised when all configured providers fail or return empty responses."""


# (client, model_id, extra_body | None)
_ProviderEntry = tuple[AsyncOpenAI, str, dict | None]


class LLMProvider:
    def __init__(self, providers: list[_ProviderEntry]) -> None:
        self._providers = providers

    async def complete(
        self,
        messages: list[dict],
        max_tokens: int = 4096,
        temperature: float | None = None,
    ) -> str:
        """
        Try each provider in order. Return the first non-empty response.
        Raise LLMProviderError if all providers fail or return empty content.

        ADR-0008: every provider call holds a global Provider Budget slot so a
        load spike can never fan out past the configured ceiling. Transient
        failures (429 / timeout / 5xx / dropped connection) are retried against
        the SAME provider with backoff (honouring Retry-After) before falling
        through to the next — rate limits no longer burn the whole fallback
        ladder on the first 429.
        """
        max_retries = int(settings.llm_transient_retries)
        for client, model, extra_body in self._providers:
            logger.info("LLM provider: trying %s", model)
            kwargs: dict = dict(model=model, max_tokens=max_tokens, messages=messages)
            if temperature is not None:
                kwargs["temperature"] = temperature
            if extra_body:
                kwargs["extra_body"] = extra_body

            for attempt in range(max_retries + 1):
                try:
                    async with llm_budget.provider_slot():
                        response = await client.chat.completions.create(**kwargs)
                    content = (response.choices[0].message.content or "").strip()
                    if content:
                        return content
                    logger.warning("LLM provider %s returned empty response — trying next", model)
                    break  # empty is not retryable on the same model
                except Exception as exc:
                    transient = llm_budget.is_transient(exc)
                    if transient and attempt < max_retries:
                        delay = llm_budget.backoff_delay(
                            attempt, llm_budget.retry_after_seconds(exc)
                        )
                        logger.warning(
                            "LLM provider %s transient failure (%s) — retry %d/%d in %.1fs",
                            model, type(exc).__name__, attempt + 1, max_retries, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    logger.warning("LLM provider %s failed: %s — trying next", model, exc)
                    break  # exhausted retries or non-transient → next provider
        raise LLMProviderError("All LLM providers failed")

    async def stream_complete(
        self,
        messages: list[dict],
        max_tokens: int = 4096,
        temperature: float | None = None,
    ) -> AsyncIterator[str]:
        """Yield content deltas as they stream from the first provider to emit one.

        ADR-0009: the fallback ladder (A→B→C) runs PRE-FIRST-TOKEN only. A
        provider that fails before emitting any delta falls through to the next
        (transient failures retried in place with backoff, mirroring
        `complete`). Once the first delta is yielded the provider is COMMITTED:
        a mid-stream failure raises `LLMProviderError` rather than silently
        swapping providers mid-sentence — the caller surfaces a retry, never a
        spliced answer.

        One ADR-0008 Provider Budget slot is held for the full stream.
        """
        max_retries = int(settings.llm_transient_retries)
        for client, model, extra_body in self._providers:
            logger.info("LLM stream: trying %s", model)
            kwargs: dict = dict(
                model=model, max_tokens=max_tokens, messages=messages, stream=True
            )
            if temperature is not None:
                kwargs["temperature"] = temperature
            if extra_body:
                kwargs["extra_body"] = extra_body

            for attempt in range(max_retries + 1):
                emitted = False
                try:
                    async with llm_budget.provider_slot():
                        stream = await client.chat.completions.create(**kwargs)
                        async for chunk in stream:
                            choices = getattr(chunk, "choices", None) or []
                            delta = (choices[0].delta.content if choices else None) or ""
                            if delta:
                                emitted = True
                                yield delta
                    if emitted:
                        return
                    logger.warning("LLM stream %s produced no tokens — trying next", model)
                    break  # empty stream is not retryable on the same model
                except Exception as exc:
                    if emitted:
                        # Committed to this provider — never swap mid-stream.
                        logger.warning("LLM stream %s died mid-stream: %s", model, exc)
                        raise LLMProviderError(
                            f"Stream interrupted on {model}: {exc}"
                        ) from exc
                    transient = llm_budget.is_transient(exc)
                    if transient and attempt < max_retries:
                        delay = llm_budget.backoff_delay(
                            attempt, llm_budget.retry_after_seconds(exc)
                        )
                        logger.warning(
                            "LLM stream %s transient failure (%s) — retry %d/%d in %.1fs",
                            model, type(exc).__name__, attempt + 1, max_retries, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    logger.warning("LLM stream %s failed pre-token: %s — trying next", model, exc)
                    break  # exhausted retries or non-transient → next provider
        raise LLMProviderError("All LLM providers failed to stream")


def _append_openrouter_tiers(
    providers: list[_ProviderEntry],
    or_tiers: list[list[str]],
) -> None:
    if settings.openrouter_api_key:
        or_client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=_OR_BASE,
            default_headers=_OR_HEADERS,
        )
        for tier in or_tiers:
            providers.append((or_client, tier[0], {"models": tier}))


def _build_provider(or_tiers: list[list[str]]) -> LLMProvider:
    providers: list[_ProviderEntry] = []
    _append_openrouter_tiers(providers, or_tiers)
    if settings.groq_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    return LLMProvider(providers)


def get_llm_provider() -> LLMProvider:
    """FastAPI Depends factory. Free tiers first — for background / non-blocking calls."""
    return _build_provider(OR_TIERS)


def get_cv_upload_provider() -> LLMProvider:
    """Fast direct providers first for the user-blocking CV upload path.

    Groq/Gemini are direct, low-latency calls. OpenRouter paid tiers remain as a
    backstop, while free OR tiers stay excluded so free-tier exhaustion never
    blocks the most critical onboarding action.
    """
    providers: list[_ProviderEntry] = []
    if settings.groq_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    _append_openrouter_tiers(providers, OR_TIERS[FREE_OR_TIER_COUNT:])
    return LLMProvider(providers)


def get_paid_jobs_provider() -> LLMProvider:
    """Fast-lane provider for the paid Job Refresh path.

    Drops the OpenRouter fallback ladder entirely. Groq llama-3.3-70b-versatile
    is ~1.5s end-to-end; Gemini flash-lite stays as the only fallback if Groq
    is unreachable. Used when the user has burned XP and is staring at a button
    waiting for matches — target latency ≤ 5s.

    The free auto-compute path (CV upload fire-and-forget) keeps the full
    fallback chain via `get_llm_provider()` — no user is blocked on it.
    """
    providers: list[_ProviderEntry] = []
    if settings.groq_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    if not providers:
        # No fast-lane creds — fall back to standard chain so the feature still works.
        return _build_provider(OR_TIERS)
    return LLMProvider(providers)


# Multimodal-capable models, cheapest first. Used for parsing a screenshot/photo
# of a job posting (Add-a-job file upload). `complete()` is unchanged — vision is
# just a message whose `content` is a [text, image_url] array.
_VISION_OR_MODELS = ["openai/gpt-4o-mini", "google/gemma-3-12b-it"]


def get_vision_provider() -> LLMProvider:
    """Provider chain restricted to vision-capable models.

    Gemini 2.0 flash-lite (cheap, multimodal) leads; OpenRouter gpt-4o-mini /
    gemma-3 backstop it. Falls back to the standard chain only if no vision creds
    exist (the caller will then fail cleanly on a non-vision model rather than
    silently mis-parsing — image upload simply won't be offered without creds).
    """
    providers: list[_ProviderEntry] = []
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    if settings.openrouter_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.openrouter_api_key, base_url=_OR_BASE, default_headers=_OR_HEADERS),
            _VISION_OR_MODELS[0],
            {"models": _VISION_OR_MODELS},
        ))
    return LLMProvider(providers)
