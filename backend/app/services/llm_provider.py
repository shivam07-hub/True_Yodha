"""
Unified LLM provider abstraction for the Myro cloud stack.

Fallback order (OR handles tiers 1–2 natively via `models` array; Python-level for 3+):
  1. OpenRouter — free tier  (gpt-oss-120b, llama-3.3-70b, qwen3-coder, nemotron-120b)
  2. OpenRouter — cheap paid ($0.04–$0.15/M: gemma-3-4b → gpt-4o-mini)
  3. OpenRouter — last resort (kimi-k2.6 → kimi-k2.5, $0.75/M)
  4. Groq       — llama-3.3-70b-versatile (Python-level fallback)
  5. Gemini     — gemini-2.0-flash-lite (Python-level fallback)

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

# ── Centralized model config ───────────────────────────────────────────────────
# OR's native `models` array tries each in order within a single API call.
OR_PRIMARY_MODELS: list[str] = [
    # Tier 1: free — try first, cost $0
    "openai/gpt-oss-120b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-coder:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    # Tier 2: cheap paid — $0.04–$0.15/M input
    "google/gemma-3-4b-it",           # $0.04/M
    "google/gemma-3-12b-it",          # $0.04/M
    "ibm-granite/granite-4.1-8b",     # $0.05/M
    "openai/gpt-5-nano",              # $0.05/M
    "z-ai/glm-4.7-flash",            # $0.06/M
    "google/gemma-4-26b-a4b-it",     # $0.07/M
    "meta-llama/llama-3.3-70b-instruct",  # $0.10/M
    "openai/gpt-4o-mini",            # $0.15/M
    # Tier 3: last resort — $0.75/M
    "moonshotai/kimi-k2.6",
    "moonshotai/kimi-k2.5",
]
GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile"


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


def get_llm_provider() -> LLMProvider:
    """FastAPI Depends factory. Reads settings, builds ordered provider list."""
    providers: list[_ProviderEntry] = []
    if settings.openrouter_api_key:
        or_client = AsyncOpenAI(
            api_key=settings.openrouter_api_key,
            base_url=_OR_BASE,
            default_headers=_OR_HEADERS,
        )
        # OR handles full tier 1–3 fallback natively via `models` array
        providers.append((or_client, OR_PRIMARY_MODELS[0], {"models": OR_PRIMARY_MODELS}))
    if settings.groq_api_key:
        # Tertiary: Groq direct
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.google_api_key:
        # Quinary: Gemini direct
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
            None,
        ))
    return LLMProvider(providers)
