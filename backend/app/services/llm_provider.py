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

import logging

from openai import AsyncOpenAI

from app.config import settings

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
        """
        for client, model, extra_body in self._providers:
            logger.info("LLM provider: trying %s", model)
            try:
                kwargs: dict = dict(model=model, max_tokens=max_tokens, messages=messages)
                if temperature is not None:
                    kwargs["temperature"] = temperature
                if extra_body:
                    kwargs["extra_body"] = extra_body
                response = await client.chat.completions.create(**kwargs)
                content = (response.choices[0].message.content or "").strip()
                if content:
                    return content
                logger.warning("LLM provider %s returned empty response — trying next", model)
            except Exception as exc:
                logger.warning("LLM provider %s failed: %s — trying next", model, exc)
        raise LLMProviderError("All LLM providers failed")


def _build_provider(or_tiers: list[list[str]]) -> LLMProvider:
    providers: list[_ProviderEntry] = []
    if settings.openrouter_api_key:
        or_client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=_OR_BASE,
            default_headers=_OR_HEADERS,
        )
        for tier in or_tiers:
            providers.append((or_client, tier[0], {"models": tier}))
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
    """Paid-tier-first provider for the user-blocking CV upload path.

    Skips free OR tiers (indices 0..FREE_OR_TIER_COUNT-1) so free-tier exhaustion
    never causes a 503 on the most critical onboarding action.
    """
    return _build_provider(OR_TIERS[FREE_OR_TIER_COUNT:])
