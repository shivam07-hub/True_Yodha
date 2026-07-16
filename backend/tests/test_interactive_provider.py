"""Provider routing contracts for user-blocking LLM calls.

User-facing flows should spend paid OpenRouter first, then fall back to direct
Groq/Gemini. Free OpenRouter tiers stay reserved for background/fail-soft work.
"""
from __future__ import annotations

from app.services import llm_provider
from app.services.llm_provider import (
    FREE_OR_TIER_COUNT,
    GROQ_FALLBACK_MODEL,
    JUDGMENT_OR_TIERS,
    OR_TIERS,
    WRITER_OR_TIERS,
    _JUDGMENT_UNSAFE_MODELS,
    get_blocking_judgment_provider,
    get_interactive_provider,
    get_judgment_provider,
    get_paid_jobs_provider,
    get_writer_provider,
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


# ── Judgment lane — the model floor for feedback_no_cheap_models_judgment ────────

def _judgment_model_ids(provider) -> set[str]:
    """Every model id reachable on a provider's chain (OR fallback arrays + direct)."""
    ids: set[str] = set()
    for _client, model, extra_body in provider._providers:
        ids.add(model)
        for m in (extra_body or {}).get("models", []):
            ids.add(m)
    return ids


def test_judgment_provider_never_includes_a_small_model():
    """THE trust invariant: no ranking/eval/verdict call may ever hit a 4B model."""
    def check():
        ids = _judgment_model_ids(get_judgment_provider())
        leaked = ids & _JUDGMENT_UNSAFE_MODELS
        assert not leaked, f"Small model leaked onto the judgment lane: {leaked}"
        # Gemini flash-lite is too small to judge — must be absent (outage → fail, not guess).
        assert "gemini-2.0-flash-lite" not in ids
        return True

    assert _with_all_keys(check)


def test_judgment_provider_leads_free_strong_then_paid_strong():
    """Strong FREE tiers lead (cost managed, no quality loss); strong PAID backstops."""
    def check():
        provider = get_judgment_provider()
        or_entries = [e for e in provider._providers if e[2] and "models" in e[2]]
        # First OR call is a free-strong tier (leads with no cost).
        assert or_entries[0][1] == OR_TIERS[0][0]
        ids = _judgment_model_ids(provider)
        # Strong paid backstop present.
        assert "openai/gpt-4o-mini" in ids
        assert "meta-llama/llama-3.3-70b-instruct" in ids
        # Groq llama-3.3-70b direct is the strong last-hop.
        assert GROQ_FALLBACK_MODEL in ids
        return True

    assert _with_all_keys(check)


def test_judgment_or_tiers_derived_by_exclusion_is_reorder_safe():
    """A small model slipped into any tier drops that WHOLE tier from judgment."""
    flat = {m for tier in JUDGMENT_OR_TIERS for m in tier}
    assert not (flat & _JUDGMENT_UNSAFE_MODELS)


# ── writer lane (CV core loop) ───────────────────────────────────────────────

def test_writer_provider_never_includes_a_small_model():
    """THE trust invariant for CV WRITING: no rewrite/draft/restructure call may ever
    hit a 4B model (a small model truncates a rich bullet — the core-loop regression)."""
    def check():
        ids = _judgment_model_ids(get_writer_provider())
        leaked = ids & _JUDGMENT_UNSAFE_MODELS
        assert not leaked, f"Small model leaked onto the writer lane: {leaked}"
        assert "gemini-2.0-flash-lite" not in ids     # too small to write, like judgment
        return True

    assert _with_all_keys(check)


def test_writer_provider_leads_paid_strong_for_the_blocking_spinner():
    """Unlike judgment (free-strong-first), the writer lane leads PAID-strong so a
    free-tier queue never stalls a user watching the rewrite spinner."""
    def check():
        provider = get_writer_provider()
        or_entries = [e for e in provider._providers if e[2] and "models" in e[2]]
        first_tier = or_entries[0][2]["models"]
        assert ":free" not in "".join(first_tier)      # first OR call is a PAID tier
        ids = _judgment_model_ids(provider)
        assert "openai/gpt-4o-mini" in ids or "meta-llama/llama-3.3-70b-instruct" in ids
        assert GROQ_FALLBACK_MODEL in ids              # strong direct last-hop
        return True

    assert _with_all_keys(check)


def test_writer_or_tiers_are_the_judgment_tiers_reordered():
    """Writer = judgment tiers (small-excluded) reordered paid-first — no new model
    set to keep in sync, and the small-model exclusion is inherited structurally."""
    assert sorted(map(tuple, WRITER_OR_TIERS)) == sorted(map(tuple, JUDGMENT_OR_TIERS))
    flat = {m for tier in WRITER_OR_TIERS for m in tier}
    assert not (flat & _JUDGMENT_UNSAFE_MODELS)
    assert JUDGMENT_OR_TIERS, "judgment lane must not be empty"
    # Every retained tier must be wholly free of unsafe models (fail-safe exclusion).
    for tier in JUDGMENT_OR_TIERS:
        assert not any(m in _JUDGMENT_UNSAFE_MODELS for m in tier)


def test_blocking_judgment_provider_is_strong_paid_first():
    """USER-BLOCKING judgment (jd-coverage parse) leads PAID-strong — a free-tier
    429 storm must never blank the coverage panel — and, like every judgment
    lane, can never include a small model."""
    def check():
        provider = get_blocking_judgment_provider()
        ids = _judgment_model_ids(provider)
        assert not (ids & _JUDGMENT_UNSAFE_MODELS)
        or_entries = [e for e in provider._providers if e[2] and "models" in e[2]]
        first_tier = or_entries[0][2]["models"]
        assert ":free" not in "".join(first_tier)      # paid-strong leads
        assert GROQ_FALLBACK_MODEL in ids              # strong direct last-hop
        return True

    assert _with_all_keys(check)
