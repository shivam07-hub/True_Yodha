"""
llm_provider.py — Unified LLM call interface for the skill taxonomy pipeline.

Supported providers  (set via LLM_PROVIDER env var):
  anthropic  →  Claude   (default)
  openai     →  GPT
  gemini     →  Google Gemini

Environment variables:
  LLM_PROVIDER       = anthropic | openai | gemini
  ANTHROPIC_API_KEY  = your-anthropic-api-key
  OPENAI_API_KEY     = your-openai-api-key
  GEMINI_API_KEY     = AIza...
  LLM_MODEL          = optional model override (else provider default is used)
"""

import os

# ── Provider defaults ─────────────────────────────────────────────────────────
_DEFAULTS = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openai":    "gpt-4o-mini",
    "gemini":    "gemini-1.5-flash",
}

_KEY_ENV = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai":    "OPENAI_API_KEY",
    "gemini":    "GEMINI_API_KEY",
}


def get_provider() -> str:
    return os.getenv("LLM_PROVIDER", "anthropic").lower().strip()


def get_model(provider: str | None = None) -> str:
    p = provider or get_provider()
    override = os.getenv("LLM_MODEL", "").strip()
    return override if override else _DEFAULTS.get(p, _DEFAULTS["anthropic"])


def is_configured(provider: str | None = None) -> bool:
    """Return True if the active provider's API key is set."""
    p = provider or get_provider()
    return bool(os.getenv(_KEY_ENV.get(p, ""), "").strip())


def is_rate_limit_error(exc: Exception) -> bool:
    """Provider-agnostic rate-limit check."""
    name = type(exc).__name__.lower()
    msg  = str(exc).lower()
    return (
        "ratelimit" in name
        or "rate_limit" in name
        or "rate limit" in msg
        or "resourceexhausted" in name
        or "429" in msg
    )


def call_llm(
    system: str,
    user: str,
    max_tokens: int = 1024,
    temperature: float = 0.1,
) -> str:
    """
    Call the configured LLM and return the response text.
    Raises on auth/network errors — callers handle exceptions.
    """
    provider = get_provider()
    if provider == "anthropic":
        return _anthropic(system, user, max_tokens, temperature)
    if provider == "openai":
        return _openai(system, user, max_tokens, temperature)
    if provider == "gemini":
        return _gemini(system, user, max_tokens, temperature)
    raise ValueError(
        f"Unknown LLM_PROVIDER={provider!r}. Choose: anthropic | openai | gemini"
    )


# ── Provider implementations ──────────────────────────────────────────────────

def _anthropic(system, user, max_tokens, temperature):
    import anthropic
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set.")
    client = anthropic.Anthropic(api_key=key)
    resp = client.messages.create(
        model=get_model("anthropic"),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text.strip()


def _openai(system, user, max_tokens, temperature):
    from openai import OpenAI
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    client = OpenAI(api_key=key)
    resp = client.chat.completions.create(
        model=get_model("openai"),
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()


def _gemini(system, user, max_tokens, temperature):
    import google.generativeai as genai
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set.")
    genai.configure(api_key=key)
    model = genai.GenerativeModel(
        model_name=get_model("gemini"),
        system_instruction=system,
        generation_config=genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    return model.generate_content(user).text.strip()
