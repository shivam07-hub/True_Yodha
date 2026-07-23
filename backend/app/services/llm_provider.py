"""
Unified LLM provider abstraction for the Myro cloud stack.

OpenRouter caps the native `models` fallback array at 3 entries per call, so the
cost-tier ladder is split into multiple ProviderEntry chunks of ≤3 models each.
The outer Python loop in LLMProvider.complete walks the chunks in order.

Fallback order:
  * User-blocking lanes: OpenRouter paid tiers -> Groq -> Gemini.
  * Background/fail-soft lanes: OpenRouter free tiers -> paid tiers -> Groq -> Gemini.

Scope: Myro cloud stack only. The scraper (skill_tagger.py / LM Studio) is intentionally
separate — do not merge those stacks.

Callers: llm_ranker, llm_polish (per-job CV polish via /cv/versions),
cv_parser, diary processor.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from time import perf_counter

from openai import AsyncOpenAI

from app.config import settings
from app.services import llm_budget

logger = logging.getLogger(__name__)

_OR_HEADERS = {"HTTP-Referer": "https://truemirror.vercel.app", "X-Title": "Truth Mirror"}
_OR_BASE = "https://openrouter.ai/api/v1"
_GROQ_BASE = "https://api.groq.com/openai/v1"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _make_client(api_key: str, base_url: str, headers: dict | None = None) -> AsyncOpenAI:
    """Every provider client carries an explicit per-request timeout and NO
    SDK-level retries. Without the timeout the SDK default (600s) governs, so one
    stalled provider blocks a user-facing call for minutes before the fallback
    ladder can reach the fast lane. `max_retries=0` hands retry control to the
    app loop (`llm_transient_retries`) so a single click can't silently fan out."""
    kwargs: dict = dict(
        api_key=api_key,
        base_url=base_url,
        timeout=settings.llm_request_timeout_seconds,
        max_retries=0,
    )
    if headers:
        kwargs["default_headers"] = headers
    return AsyncOpenAI(**kwargs)

# OpenRouter caps the `models` fallback array at this length per call.
OR_MAX_MODELS_PER_CALL = 3

# Ordered chunks of OpenRouter models. Each chunk is one API call with native
# fallback inside. Order = cost-tier ladder; cheaper chunks tried first.
OR_TIERS: list[list[str]] = [
    # Tier 1a (former): "openai/gpt-oss-120b:free", "meta-llama/llama-3.3-70b-
    # instruct:free", "qwen/qwen3-coder:free" — ALL THREE removed 2026-07-24,
    # confirmed dead live (OpenRouter 404s each: "unavailable for free, use
    # <paid slug>"). OpenRouter appears to have sunset this whole free-variant
    # batch. Each dead lead model was silently wasting a round trip on EVERY
    # call through this tier before falling through — the paid equivalents
    # backstop in Tier 2c below. Re-check openrouter.ai/models for revived or
    # new free-tier candidates before re-adding a Tier 1a.
    # Tier 1b: free, remaining (verified live 2026-07-24)
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
# 2026-07-24: was 2 (Tier 1a + Tier 1b) — Tier 1a's three :free slugs all went
# dead and were removed above, leaving only Tier 1b free. Must track the real
# tier count or this silently skips the first PAID tier too.
FREE_OR_TIER_COUNT = 1

# Models too small to trust with a JUDGMENT call — ranking, triage, 5/6-axis eval,
# verdicts, agent picks. Trust rule (feedback_no_cheap_models_judgment / ADR-0017):
# a confidently-wrong shortlist is invisible to fallback logic and breaks trust
# irreversibly (gemma-3-4b ranked banker jobs for a senior SWE with zero errors).
_JUDGMENT_UNSAFE_MODELS = frozenset({
    "google/gemma-3-4b-it",
    "google/gemma-3-12b-it",
    "ibm-granite/granite-4.1-8b",
    "openai/gpt-5-nano",
    "z-ai/glm-4.7-flash",
    "google/gemma-4-26b-a4b-it",
})
# The judgment lane = every OR tier with NO small model. Derived by EXCLUSION so a
# reorder of OR_TIERS (or a small model slipped into a strong tier) can never silently
# leak a 4B model onto a ranking path — the whole tier drops instead (fail-safe).
JUDGMENT_OR_TIERS: list[list[str]] = [
    tier for tier in OR_TIERS
    if not any(model in _JUDGMENT_UNSAFE_MODELS for model in tier)
]


def _is_free_tier(tier: list[str]) -> bool:
    """A tier whose every model is a free OpenRouter variant (':free' suffix)."""
    return all(":free" in model for model in tier)


# The WRITER lane = every strong tier (small models excluded, same rule as
# JUDGMENT), but reordered PAID-STRONG-FIRST. A CV rewrite is a judgment-grade
# generation the user is watching on a spinner: free strong tiers can queue, so a
# paid-strong tier (gpt-4o-mini / llama-70b, ~$0.15/M) leads to keep the blocking
# path fast, with the free strong tiers as the no-cost backstop. Small models can
# never appear — derived from JUDGMENT_OR_TIERS, which already dropped them.
WRITER_OR_TIERS: list[list[str]] = (
    [t for t in JUDGMENT_OR_TIERS if not _is_free_tier(t)]
    + [t for t in JUDGMENT_OR_TIERS if _is_free_tier(t)]
)


class LLMProviderError(Exception):
    """Raised when all configured providers fail or return empty responses."""


# (client, model_id, extra_body | None)
_ProviderEntry = tuple[AsyncOpenAI, str, dict | None]


@dataclass(frozen=True)
class LLMCompletion:
    """Successful completion plus the provider-reported model provenance."""

    content: str
    model: str
    elapsed_ms: int


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
        result = await self.complete_with_metadata(
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return result.content

    async def complete_with_metadata(
        self,
        messages: list[dict],
        max_tokens: int = 4096,
        temperature: float | None = None,
    ) -> LLMCompletion:
        """Complete once and retain the actual model and elapsed time."""
        started_at = perf_counter()
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
                        actual_model = getattr(response, "model", None) or model
                        return LLMCompletion(
                            content=content,
                            model=str(actual_model),
                            elapsed_ms=max(0, round((perf_counter() - started_at) * 1000)),
                        )
                    logger.warning("LLM provider %s returned empty response — trying next", model)
                    break  # empty is not retryable on the same model
                except Exception as exc:
                    # Only a 429 is worth retrying the SAME provider (with backoff /
                    # Retry-After). A timeout / dropped connection / 5xx means it is
                    # stalled or down — retrying it just burns the user's wait, so
                    # fall through to the next (faster) provider immediately.
                    if llm_budget.is_rate_limited(exc) and attempt < max_retries:
                        delay = llm_budget.backoff_delay(
                            attempt, llm_budget.retry_after_seconds(exc)
                        )
                        logger.warning(
                            "LLM provider %s rate-limited — retry %d/%d in %.1fs",
                            model, attempt + 1, max_retries, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    logger.warning("LLM provider %s failed: %s — trying next", model, exc)
                    break  # rate-limit exhausted or stalled/down → next provider
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
                    if llm_budget.is_rate_limited(exc) and attempt < max_retries:
                        delay = llm_budget.backoff_delay(
                            attempt, llm_budget.retry_after_seconds(exc)
                        )
                        logger.warning(
                            "LLM stream %s rate-limited — retry %d/%d in %.1fs",
                            model, attempt + 1, max_retries, delay,
                        )
                        await asyncio.sleep(delay)
                        continue
                    logger.warning("LLM stream %s failed pre-token: %s — trying next", model, exc)
                    break  # rate-limit exhausted or stalled/down → next provider
        raise LLMProviderError("All LLM providers failed to stream")


def _append_openrouter_tiers(
    providers: list[_ProviderEntry],
    or_tiers: list[list[str]],
) -> None:
    if settings.openrouter_api_key:
        or_client = _make_client(settings.openrouter_api_key, _OR_BASE, _OR_HEADERS)
        for tier in or_tiers:
            providers.append((or_client, tier[0], {"models": tier}))


def _append_fast_direct(providers: list[_ProviderEntry]) -> None:
    """Prepend the low-latency direct lane: Groq llama-3.3-70b (~1.5s) → Gemini
    flash-lite. Both are single-hop calls — no OpenRouter routing, no free-tier
    rate-limit retries. The shared spine of every user-blocking provider."""
    if settings.groq_api_key:
        providers.append((
            _make_client(settings.groq_api_key, _GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        providers.append((
            _make_client(settings.google_api_key, _GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))


def _build_provider(or_tiers: list[list[str]]) -> LLMProvider:
    providers: list[_ProviderEntry] = []
    _append_openrouter_tiers(providers, or_tiers)
    if settings.groq_api_key:
        providers.append((
            _make_client(settings.groq_api_key, _GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        providers.append((
            _make_client(settings.google_api_key, _GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    return LLMProvider(providers)


def get_llm_provider() -> LLMProvider:
    """FastAPI Depends factory. Free tiers first — for background / non-blocking calls."""
    return _build_provider(OR_TIERS)


def get_interactive_provider() -> LLMProvider:
    """Paid-first lane for any call a user is actively waiting on.

    Paid OpenRouter tiers lead so direct-provider free quotas cannot take down a
    user flow. Groq/Gemini remain fallbacks. The free OR tiers are skipped
    entirely; background/fire-and-forget calls keep the full free-first chain via
    `get_llm_provider()`.
    """
    providers: list[_ProviderEntry] = []
    _append_openrouter_tiers(providers, OR_TIERS[FREE_OR_TIER_COUNT:])
    _append_fast_direct(providers)
    return LLMProvider(providers)


def get_cv_upload_provider() -> LLMProvider:
    """User-blocking CV upload path. Same fast lane as every interactive call —
    free OR tiers stay excluded so free-tier exhaustion never blocks onboarding."""
    return get_interactive_provider()


def get_paid_jobs_provider() -> LLMProvider:
    """Paid-first provider for the paid Job Refresh path.

    The free auto-compute path keeps the full fallback chain via
    `get_llm_provider()`; user-paid refreshes share the paid-first interactive
    lane so free quota exhaustion cannot consume the click.
    """
    provider = get_interactive_provider()
    if not provider._providers:
        return _build_provider(OR_TIERS)
    return provider


def get_judgment_provider() -> LLMProvider:
    """Strong-only lane for every JUDGMENT call — triage, 5/6-axis eval, verdicts,
    agent picks. This is THE model floor for [[feedback_no_cheap_models_judgment]].

    Leads with the strong FREE tiers (llama-3.3-70b, qwen3-coder — no cost, no
    quality loss), backstops with strong PAID (gpt-4o-mini, llama-70b) and the last
    resort (kimi-k2), plus Groq llama-3.3-70b direct. It NEVER falls to a small
    model: the cheap paid tiers (gemma / granite / nano / glm-flash) are excluded by
    ``JUDGMENT_OR_TIERS`` and Gemini flash-lite is deliberately omitted — so a total
    strong-model outage fails the run (→ refund + honest retry) rather than emitting a
    confidently-wrong shortlist. Every surface that ranks/judges routes through this;
    callers no longer pass a provider into a judgment path.
    """
    providers: list[_ProviderEntry] = []
    _append_openrouter_tiers(providers, JUDGMENT_OR_TIERS)
    # Groq llama-3.3-70b only (strong). NOT Gemini flash-lite — too small to judge.
    if settings.groq_api_key:
        providers.append((
            _make_client(settings.groq_api_key, _GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    return LLMProvider(providers)


def get_writer_provider() -> LLMProvider:
    """Strong-only, paid-first lane for every MENTOR WRITING call — the prose the
    user will put on their CV (per-bullet rewrite, variants, intake draft, restructure,
    gap-plan draft). THE model floor for CV writing, the sibling of `get_judgment_provider`.

    Writing a CV bullet is a judgment-grade generation: a small model truncates
    instead of synthesizing (gemma-3-4b turned a rich bullet into a 4-word fragment —
    the exact failure that breaks trust on the core loop). So the writer lane leads
    with strong PAID tiers (gpt-4o-mini / llama-70b) to keep the user-blocking spinner
    fast, backstops with strong FREE tiers, adds Groq llama-3.3-70b direct, and — like
    judgment — NEVER falls to a small model or Gemini flash-lite. A total strong-model
    outage fails the call (→ honest "unavailable") rather than emitting a rewrite worse
    than the user's original. See `feedback_no_cheap_models_judgment`. Callers no longer
    pass a provider into a writing path; the floor is owned here, not by discipline.
    """
    return _strong_paid_first_provider()


def get_cv_skill_provider() -> LLMProvider:
    """Strong-only, paid-first extraction for the CV skill trust boundary.

    A syntactically valid but incomplete skill list is a silent judgment error,
    so the CV path must never use the small-model interactive tiers.
    """
    return _strong_paid_first_provider()


def get_blocking_judgment_provider() -> LLMProvider:
    """Strong-only, paid-first lane for USER-BLOCKING judgment calls — a panel the
    user is watching load (jd-coverage requirement parse). Same model floor as
    `get_judgment_provider` (no small models, ever), but paid-strong LEADS: the
    free strong tiers 429-storm under load and their retry backoff (5s + 20s per
    tier) turns a blocking panel into a blank one. Background judgment (matching
    fleet) stays on the free-first `get_judgment_provider` — cost matters there;
    here the result is cached once per (user, job), so reliability wins outright.
    """
    return _strong_paid_first_provider()


def _strong_paid_first_provider() -> LLMProvider:
    """The shared strong paid-first chain: WRITER_OR_TIERS (paid strong → free
    strong, small models structurally excluded) + Groq llama-3.3-70b direct."""
    providers: list[_ProviderEntry] = []
    _append_openrouter_tiers(providers, WRITER_OR_TIERS)
    if settings.groq_api_key:
        providers.append((
            _make_client(settings.groq_api_key, _GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
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
