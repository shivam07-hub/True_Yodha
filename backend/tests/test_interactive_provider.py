"""Provider routing contracts for user-blocking LLM calls.

User-facing flows should spend paid OpenRouter first, then fall back to direct
Groq/Gemini. Free OpenRouter tiers stay reserved for background/fail-soft work.
"""
from __future__ import annotations

from app.services import llm_provider
from app.services.llm_provider import (
    FREE_OR_TIER_COUNT,
    GROQ_FALLBACK_MODEL,
    OR_TIERS,
    get_interactive_provider,
    get_paid_jobs_provider,
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


def test_interactive_provider_uses_paid_openrouter_before_direct_fallback():
    def check():
        provider = get_interactive_provider()
        entries = provider._providers
        paid_tier_count = len(OR_TIERS) - FREE_OR_TIER_COUNT
        assert [e[1] for e in entries[:paid_tier_count]] == [
            tier[0] for tier in OR_TIERS[FREE_OR_TIER_COUNT:]
        ]
        assert entries[paid_tier_count][1] == GROQ_FALLBACK_MODEL
        assert entries[paid_tier_count + 1][1] == "gemini-2.0-flash-lite"
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


def test_paid_jobs_provider_uses_same_paid_first_lane():
    def check():
        provider = get_paid_jobs_provider()
        entries = provider._providers
        paid_tier_count = len(OR_TIERS) - FREE_OR_TIER_COUNT
        assert [e[1] for e in entries[:paid_tier_count]] == [
            tier[0] for tier in OR_TIERS[FREE_OR_TIER_COUNT:]
        ]
        assert entries[paid_tier_count][1] == GROQ_FALLBACK_MODEL
        return True

    assert _with_all_keys(check)
