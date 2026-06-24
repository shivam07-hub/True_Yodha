"""get_interactive_provider — the fast lane for user-blocking LLM calls.

Pins the latency contract behind the "Mentor is reading your gaps…" spinner (and
every other interactive call): Groq direct first, then Gemini, then ONLY the paid
OpenRouter tiers — never the free OR ladder whose rate-limit retries pushed
gap-plan past the frontend's 15s abort. Regression guard for that flake.
"""
from __future__ import annotations

from app.services import llm_provider
from app.services.llm_provider import (
    FREE_OR_TIER_COUNT,
    GROQ_FALLBACK_MODEL,
    OR_TIERS,
    get_interactive_provider,
)


def _with_all_keys(fn):
    orig = (
        llm_provider.settings.groq_api_key,
        llm_provider.settings.google_api_key,
        llm_provider.settings.openrouter_api_key,
    )
    llm_provider.settings.groq_api_key = "sk-groq-test"
    llm_provider.settings.google_api_key = "sk-google-test"
    llm_provider.settings.openrouter_api_key = "sk-or-test"
    try:
        return fn()
    finally:
        (
            llm_provider.settings.groq_api_key,
            llm_provider.settings.google_api_key,
            llm_provider.settings.openrouter_api_key,
        ) = orig


def test_interactive_provider_groq_then_gemini_first():
    def check():
        models = [e[1] for e in get_interactive_provider()._providers]
        assert models[0] == GROQ_FALLBACK_MODEL  # 1 hop, ~1.5s
        assert models[1] == "gemini-2.0-flash-lite"
        return True

    assert _with_all_keys(check)


def test_interactive_provider_excludes_free_or_tiers():
    def check():
        p = get_interactive_provider()
        free_models = {m for tier in OR_TIERS[:FREE_OR_TIER_COUNT] for m in tier}
        for _, _model, extra_body in p._providers:
            for m in (extra_body or {}).get("models", []):
                assert m not in free_models, f"Free model {m!r} leaked into the fast lane"
        # The paid OR backstop is still present (total provider outage safety net).
        or_entries = [e for e in p._providers if e[2] and "models" in e[2]]
        assert len(or_entries) == len(OR_TIERS) - FREE_OR_TIER_COUNT
        return True

    assert _with_all_keys(check)
