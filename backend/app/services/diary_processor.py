"""
diary_processor.py
Processes a free-text diary entry to extract skill signals.

Provider fallback order (same as skill_tagger.py):
  0. LM Studio (local)  — if LM_STUDIO_MODEL is set (no rate limits)
  1. Groq               — llama-3.1-8b-instant
  2. Gemini             — gemini-1.5-flash
  3. OpenRouter         — llama-3.1-8b-instruct:free

Returns a list of skill signals: [{taxonomy_key, signal_type, xp_awarded, evidence}]
Called by POST /diary/entry — not run directly.
"""

import json

from app.config import settings
from app.services.skill_tagger import _call_provider, PROVIDERS

_XP_MAP = {"mention": 50, "project": 150, "impact": 350, "leadership": 500}
_VALID_SIGNAL_TYPES = set(_XP_MAP.keys())


def _build_prompt(entry_text: str, taxonomy_keys: list[str]) -> str:
    keys_str = "\n".join(f"- {k}" for k in taxonomy_keys)
    return f"""You are analysing a job seeker's daily diary entry to extract skills they worked on today.

SKILL TAXONOMY (use ONLY these exact keys — lowercase):
{keys_str}

DIARY ENTRY:
{entry_text}

---

Extract skills the user actively worked on. For each return:
- taxonomy_key: exact key from the list above
- signal_type: "mention" | "project" | "impact" | "leadership"
- evidence: short quote showing this skill

Signal types:
  "mention"    → read about it, watched tutorial, completed course module (+50 XP)
  "project"    → built something, practised hands-on, completed a task (+150 XP)
  "impact"     → achieved measurable result, shipped something (+350 XP)
  "leadership" → taught someone, led a session, reviewed work (+500 XP)

Return JSON array (empty [] if no skills found):
[{{"taxonomy_key": "sql", "signal_type": "project", "evidence": "built a query to analyse sales data"}}]

Only include skills clearly worked on today. Return valid JSON only."""


def _validate(raw: list[dict], valid_keys: set[str]) -> list[dict]:
    results = []
    for item in raw:
        key = str(item.get("taxonomy_key", "")).strip().lower()
        signal_type = str(item.get("signal_type", "")).strip().lower()
        if key not in valid_keys or signal_type not in _VALID_SIGNAL_TYPES:
            continue
        results.append({
            "taxonomy_key": key,
            "signal_type": signal_type,
            "xp_awarded": _XP_MAP[signal_type],
            "evidence": str(item.get("evidence", ""))[:300],
        })
    return results


def _parse_response(text: str) -> list[dict]:
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start, end = text.find("["), text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    return json.loads(text[start:end])


def extract_skill_signals(entry_text: str, taxonomy_keys: list[str]) -> list[dict]:
    """
    Call LLM (LM Studio → Groq → Gemini → OpenRouter) to extract skill signals from a diary entry.
    Returns [] if all providers fail or no skills found.
    """
    # Keys must match provider["api_key_env"] values (what _call_provider expects)
    api_keys = {
        "LM_STUDIO_TAGGER_MODEL": settings.lm_studio_tagger_model,
        "GROQ_API_KEY":       settings.groq_api_key,
        "GEMINI_API_KEY":     settings.google_api_key,
        "OPENROUTER_API_KEY": settings.openrouter_api_key,
    }
    active = [p for p in PROVIDERS if api_keys.get(p["api_key_env"])]
    if not active:
        return []

    prompt = _build_prompt(entry_text, taxonomy_keys)
    valid_keys = set(taxonomy_keys)

    for provider in active:
        try:
            raw_text = _call_provider(prompt, provider, api_keys)
            raw = _parse_response(raw_text)
            return _validate(raw, valid_keys)
        except Exception:
            continue

    return []
