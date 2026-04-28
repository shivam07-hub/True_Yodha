"""
Unified LLM provider abstraction for the Myro cloud stack.

Fallback order (Python-level, except where noted):
  1. OpenRouter — kimi-k2.6 → kimi-k2.5  (OR handles this natively via `models` array)
  2. Groq       — llama-3.3-70b-versatile  (tertiary)
  3. OpenRouter — openai/gpt-4o-mini        (quaternary)

Suggested quinary: "google/gemini-flash-1.5" via OpenRouter, or direct Gemini API
(add a `google_api_key` entry in get_llm_provider() using _GEMINI_BASE).

Scope: Myro cloud stack only. The scraper (skill_tagger.py / LM Studio) is intentionally
separate — do not merge those stacks.

Phase 3 callers: llm_ranker, llm_polish (cv_generator).
Post-Phase-3 callers: cv_parser, diary processor.
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
# OR's native `models` array handles kimi-k2.6 → kimi-k2.5 in a single API call.
OR_KIMI_MODELS: list[str] = ["moonshotai/kimi-k2.6", "moonshotai/kimi-k2.5"]
GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile"   # tertiary
OR_OPENAI_FALLBACK_MODEL = "openai/gpt-4o-mini"    # quaternary


class LLMProviderError(Exception):
    """Raised when all configured providers fail or return empty responses."""


# (client, model_id, extra_body | None)
_ProviderEntry = tuple[AsyncOpenAI, str, dict | None]


class LLMProvider:
    def __init__(self, providers: list[_ProviderEntry]) -> None:
        self._providers = providers

    async def complete(self, messages: list[dict], max_tokens: int = 4096) -> str:
        """
        Try each provider in order. Return the first non-empty response.
        Raise LLMProviderError if all providers fail or return empty content.
        """
        for client, model, extra_body in self._providers:
            logger.info("LLM provider: trying %s", model)
            try:
                kwargs: dict = dict(model=model, max_tokens=max_tokens, messages=messages)
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
        # Primary + secondary: OR handles kimi-k2.6 → kimi-k2.5 natively
        providers.append((or_client, OR_KIMI_MODELS[0], {"models": OR_KIMI_MODELS}))
    if settings.groq_api_key:
        # Tertiary: Groq direct
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            GROQ_FALLBACK_MODEL,
            None,
        ))
    if settings.openrouter_api_key:
        # Quaternary: OR with OpenAI model
        providers.append((
            AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url=_OR_BASE,
                default_headers=_OR_HEADERS,
            ),
            OR_OPENAI_FALLBACK_MODEL,
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
