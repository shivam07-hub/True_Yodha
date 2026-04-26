"""
Unified LLM provider abstraction for the Myro cloud stack.

Encapsulates the OpenRouter → Groq → Gemini → OpenRouter(free) fallback chain.
All callers receive a single stable interface: LLMProvider.complete(messages, max_tokens).
Provider selection, retries, and API-key checks are invisible to callers.

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


class LLMProviderError(Exception):
    """Raised when all configured providers fail or return empty responses."""


class LLMProvider:
    def __init__(self, providers: list[tuple[AsyncOpenAI, str]]) -> None:
        self._providers = providers

    async def complete(self, messages: list[dict], max_tokens: int = 4096) -> str:
        """
        Try each provider in order. Return the first non-empty response.
        Raise LLMProviderError if all providers fail or return empty content.
        """
        for client, model in self._providers:
            logger.info("LLM provider: trying %s", model)
            try:
                response = await client.chat.completions.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=messages,
                )
                content = (response.choices[0].message.content or "").strip()
                if content:
                    return content
                logger.warning("LLM provider %s returned empty response — trying next", model)
            except Exception as exc:
                logger.warning("LLM provider %s failed: %s — trying next", model, exc)
        raise LLMProviderError("All LLM providers failed")


def get_llm_provider() -> LLMProvider:
    """FastAPI Depends factory. Reads settings, builds ordered provider list."""
    providers: list[tuple[AsyncOpenAI, str]] = []
    if settings.openrouter_api_key:
        providers.append((
            AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url=_OR_BASE,
                default_headers=_OR_HEADERS,
            ),
            "openai/gpt-4o-mini",
        ))
    if settings.groq_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE),
            "llama-3.3-70b-versatile",
        ))
    if settings.google_api_key:
        providers.append((
            AsyncOpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE),
            "gemini-2.0-flash-lite",
        ))
    if settings.openrouter_api_key:
        providers.append((
            AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url=_OR_BASE,
                default_headers=_OR_HEADERS,
            ),
            "meta-llama/llama-3.3-70b-instruct:free",
        ))
    return LLMProvider(providers)
