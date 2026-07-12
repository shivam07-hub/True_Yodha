"""intent_chat_service — the Delta-4 "Myro can't satisfy you → talk → fix it" loop.

When the feed disappoints, the user shouldn't dead-end. Myro opens a chat, asks
ONE focused question at a time (never a form), and when it understands enough,
proposes a CONCRETE filter diff the user one-tap confirms. On confirm the diff
writes through the existing setters (save_target / profile / memory) and the feed
re-runs. The delta = "it understood me and fixed it in 20s" vs "I gave up".

Two calls:
  • converse(profile, messages, provider) -> {reply, proposed_diff|None}
  • apply_diff(db, user_id, diff) -> applied summary   (only on user confirm)

The LLM never mutates anything — it only proposes. Every write goes through the
already-tested, recompute-wired setters, so there is one source per fact.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from supabase import Client

from app.repositories.user_memory import UserMemoryRepository
from app.repositories.users import UsersRepository
from app.services import onboarding_service
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.intent_chat")

_MAX_TOKENS = 500
_MAX_TURNS = 12  # bound the conversation the model sees
MAX_ROLES = onboarding_service.MAX_TARGET_ROLES

_SYSTEM = (
    "You are Myro's job-search concierge. The candidate isn't finding jobs they "
    "like; your job is to understand what they actually want and adjust their "
    "search filters.\n"
    "RULES:\n"
    "- Ask at most ONE focused question per reply. Never dump a list of questions "
    "or read like a form. Warm, short, human.\n"
    "- Use what you already know (their current target roles / locations / "
    "seniority below) — don't re-ask what you already have.\n"
    "- When you understand enough to improve the search, STOP asking and propose a "
    "concrete change. Do not over-interview.\n"
    "- Only propose REAL changes grounded in what they said. Never invent a "
    "location or role they didn't imply.\n"
    "Return ONLY a compact JSON object, no prose outside it:\n"
    '  "reply": your next message to the candidate (a question, or a one-line '
    "summary of the change you\\'re proposing),\n"
    '  "proposed_diff": null while still clarifying, OR an object once you propose '
    "a change:\n"
    '     {"add_roles": [titles to add], "remove_roles": [titles to drop], '
    '"locations": [replacement target locations] or [], "seniority": one of '
    '"intern|entry|mid|senior|lead|executive" or null, "work_mode": '
    '"remote|hybrid|onsite" or null, "salary": short text or null}\n'
    "Leave arrays empty and scalars null when a field isn't changing."
)


def _profile_context(profile: dict[str, Any]) -> str:
    titles = profile.get("target_role_titles") or (
        [profile["target_role_title"]] if profile.get("target_role_title") else []
    )
    locations = profile.get("target_locations") or []
    seniority = profile.get("target_seniority") or "any"
    lines = [
        f"Current target roles: {', '.join(titles) or 'none set'}.",
        f"Current target locations: {', '.join(locations) or 'none set'}.",
        f"Current seniority: {seniority}.",
    ]
    # Phase-4 semantic recall: what Myro already remembers about this person,
    # relevant to what they just said. Use it — don't re-ask what you already know.
    known = [f for f in (profile.get("known_facts") or []) if f]
    if known:
        lines.append("What Myro remembers about them: " + "; ".join(known) + ".")
    stories = [s for s in (profile.get("known_stories") or []) if s]
    if stories:
        lines.append("Career stories Myro holds for them: " + "; ".join(stories) + ".")
    return "\n".join(lines)


def _strip_fence(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.strip("`")
        text = text[4:].strip() if text.lower().startswith("json") else text.strip()
    return text


async def converse(
    profile: dict[str, Any],
    messages: list[dict[str, str]],
    provider: LLMProvider | None,
) -> dict[str, Any]:
    """One turn: given the conversation so far, return the next reply + optional diff."""
    fallback = {
        "reply": "Tell me what kind of role you're really after — the title, the place, or what's been missing in what you've seen.",
        "proposed_diff": None,
    }
    if provider is None or not messages:
        return fallback

    convo = [{"role": "system", "content": _SYSTEM + "\n\n" + _profile_context(profile)}]
    for m in messages[-_MAX_TURNS:]:
        role = "assistant" if m.get("role") == "assistant" else "user"
        convo.append({"role": role, "content": str(m.get("content", ""))[:1500]})

    try:
        raw = await provider.complete(convo, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("intent_chat: provider failed; graceful fallback")
        return fallback

    try:
        parsed = json.loads(_strip_fence(raw))
    except (json.JSONDecodeError, ValueError):
        logger.info("intent_chat: non-JSON model output; graceful fallback")
        return fallback
    if not isinstance(parsed, dict) or not isinstance(parsed.get("reply"), str):
        return fallback

    return {"reply": parsed["reply"].strip(), "proposed_diff": _coerce_diff(parsed.get("proposed_diff"))}


def _coerce_diff(diff: Any) -> dict[str, Any] | None:
    if not isinstance(diff, dict):
        return None

    def _titles(key: str) -> list[str]:
        raw = diff.get(key)
        return [s.strip() for s in raw if isinstance(s, str) and s.strip()][:MAX_ROLES] if isinstance(raw, list) else []

    def _scalar(key: str, allowed: set[str] | None = None) -> str | None:
        v = diff.get(key)
        if not isinstance(v, str) or not v.strip():
            return None
        s = v.strip()
        return s if (allowed is None or s.lower() in allowed) else None

    coerced = {
        "add_roles": _titles("add_roles"),
        "remove_roles": _titles("remove_roles"),
        "locations": _titles("locations"),
        "seniority": (_scalar("seniority", {"intern", "entry", "mid", "senior", "lead", "executive"}) or "").lower() or None,
        "work_mode": (_scalar("work_mode", {"remote", "hybrid", "onsite"}) or "").lower() or None,
        "salary": _scalar("salary"),
    }
    # A diff with nothing actionable is not a diff.
    if not any(coerced[k] for k in ("add_roles", "remove_roles", "locations", "seniority", "work_mode", "salary")):
        return None
    return coerced


def apply_diff(db: Client, user_id: str, diff: dict[str, Any]) -> dict[str, Any]:
    """Write a confirmed diff through the existing setters. Returns what changed."""
    users_repo = UsersRepository(db)
    profile = users_repo.get_profile(user_id) or {}
    changed: dict[str, Any] = {}

    current = profile.get("target_role_titles") or (
        [profile["target_role_title"]] if profile.get("target_role_title") else []
    )
    add = diff.get("add_roles") or []
    remove = {r.casefold() for r in (diff.get("remove_roles") or [])}
    new_titles = [t for t in current if t.casefold() not in remove]
    for t in add:
        if t.casefold() not in {x.casefold() for x in new_titles}:
            new_titles.append(t)
    new_titles = new_titles[:MAX_ROLES]

    roles_changed = new_titles and [t.casefold() for t in new_titles] != [t.casefold() for t in current]
    seniority = diff.get("seniority")
    if roles_changed or seniority:
        # save_target requires ≥1 title; fall back to existing if a removal emptied it.
        onboarding_service.save_target(
            db, user_id,
            role_titles=new_titles or current or None,
            seniority=seniority,
        )
        if roles_changed:
            changed["roles"] = new_titles
        if seniority:
            changed["seniority"] = seniority

    locations = diff.get("locations") or []
    if locations:
        users_repo.update_profile(user_id, {"target_locations": locations, "target_location": locations[0]})
        changed["locations"] = locations

    # Non-columnized prefs land in memory (the "knows me" layer).
    mem = UserMemoryRepository(db)
    if diff.get("work_mode"):
        mem.add(user_id, kind="work_mode", text=f"Prefers {diff['work_mode']} work", source="distilled")
        changed["work_mode"] = diff["work_mode"]
    if diff.get("salary"):
        mem.add(user_id, kind="salary", text=diff["salary"], source="distilled")
        changed["salary"] = diff["salary"]

    return changed
