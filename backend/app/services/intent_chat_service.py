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
from typing import Any, Literal

from supabase import Client

from app.repositories.user_memory import UserMemoryRepository
from app.repositories.users import UsersRepository
from app.services import myro_voice, onboarding_service
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.intent_chat")

_MAX_TOKENS = 500
_MAX_TURNS = 12  # bound the conversation the model sees
MAX_ROLES = onboarding_service.MAX_TARGET_ROLES

_TASK = (
    "THIS SURFACE: the feed disappointed them. You are shaping the search after "
    "they have already told you what they want — ask what was wrong, then propose "
    "a concrete change. The pre-flight BEFORE a search is a different call "
    "(extract mode): it already asked the one question.\n"
    "RULES:\n"
    "- Ask at most ONE focused question per reply. Never dump a list of questions "
    "or read like a form. Short.\n"
    "- Use what you already know (their current target roles / locations / "
    "seniority below) — don't re-ask what you already have.\n"
    "- When you understand enough to improve the search, STOP asking and propose a "
    "concrete change. Do not over-interview.\n"
    "- Only propose REAL changes grounded in what they said. Never invent a "
    "location or role they didn't imply.\n"
    "Return ONLY a compact JSON object, no prose outside it:\n"
    '  "reply": your next message to them (a question, or a one-line '
    "summary of the change you\\'re proposing),\n"
    '  "proposed_diff": null while still clarifying, OR an object once you propose '
    "a change:\n"
    '     {"add_roles": [titles to add], "remove_roles": [titles to drop], '
    '"locations": [replacement target locations] or [], "seniority": one of '
    '"intern|entry|mid|senior|lead|executive" or null, "work_mode": '
    '"remote|hybrid|onsite" or null, "salary": short text or null, '
    '"deal_breakers": [things they will not accept] or [], "career_goal": '
    'where they want to be, in their words, or null, "superpower": what they '
    'are unusually good at, in their words, or null}\n'
    "Leave arrays empty and scalars null when a field isn't changing.\n"
    "- deal_breakers / career_goal / superpower are the three inputs the run uses "
    "that a form asks for and most people cannot answer cold. Fill them from what "
    "they SAY, in their own words — never from what you assume a person like them "
    "would want."
)

# Pre-flight screen 1 already asked. A question in `reply` has no yes/no on that
# screen, so it cannot be closed. Extract every named claim into proposed_diff;
# a memory extra (another city they once mentioned) is also a field they can
# settle — never a sentence they cannot answer.
EXTRACT_TASK = (
    "THIS SURFACE: they have just told you, in one utterance, what work they "
    "want you to look for. Screen 1 already asked the one question. Your job "
    "now is to EXTRACT what they named into proposed_diff so they can yes/no "
    "each claim. You are not interviewing.\n"
    "RULES:\n"
    "- proposed_diff MUST include every role, location, and pay floor they named "
    "in this utterance, in their words, tidied. Do not drop a named claim "
    "because you also have something else to float.\n"
    "- If memory holds an extra they did not say just now (another city, a "
    "seniority), put it in proposed_diff as its own field so they can settle "
    "it. Do not ask about it.\n"
    "- reply is ONE short sentence acknowledging what you heard. Never a "
    "question. No question mark.\n"
    "- Only propose things grounded in this utterance or in the memory below. "
    "Never invent a role or place that is in neither.\n"
    "Return ONLY a compact JSON object, no prose outside it:\n"
    '  "reply": one-line acknowledgement, never a question,\n'
    '  "proposed_diff": an object with the fields they named (empty arrays / '
    "nulls for the rest):\n"
    '     {"add_roles": [titles to add], "remove_roles": [titles to drop], '
    '"locations": [target locations] or [], "seniority": one of '
    '"intern|entry|mid|senior|lead|executive" or null, "work_mode": '
    '"remote|hybrid|onsite" or null, "salary": short text or null, '
    '"deal_breakers": [things they will not accept] or [], "career_goal": '
    "where they want to be, in their words, or null, \"superpower\": what they "
    "are unusually good at, in their words, or null}\n"
    "Leave arrays empty and scalars null when a field isn't changing.\n"
    "- deal_breakers / career_goal / superpower are filled from what they SAY, "
    "in their own words — never from what you assume a person like them would want."
)

# Both surfaces are Myro speaking TO the reader, so both are composed once here
# and used verbatim by converse() below — the string the voice contract checks is
# the string sent to the model. Recomposing at call time is what let this module
# alone drift out from under the one-Myro contract (06d0b512).
_SYSTEM = myro_voice.speaking_to_reader(_TASK)
_EXTRACT_SYSTEM = myro_voice.speaking_to_reader(EXTRACT_TASK)

_EXTRACT_ACK = "Got it. Say yes to the ones that are right."
_INTERVIEW_FALLBACK = (
    "Tell me what kind of role you're really after — the title, the place, or "
    "what's been missing in what you've seen."
)


def reply_for_extract(reply: str) -> str:
    """A question in the pre-flight bubble cannot be closed. Strip it."""
    text = (reply or "").strip()
    if not text or "?" in text:
        return _EXTRACT_ACK
    return text


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
    *,
    mode: Literal["interview", "extract"] = "interview",
) -> dict[str, Any]:
    """One turn: given the conversation so far, return the next reply + optional diff.

    `extract` is the pre-flight after they have already said what they want —
    every named claim becomes a proposal, the reply is never a question.
    `interview` is the disappointed-feed chat, which still asks one thing at a time.
    """
    extract = mode == "extract"
    fallback = {
        "reply": _EXTRACT_ACK if extract else _INTERVIEW_FALLBACK,
        "proposed_diff": None,
    }
    if provider is None or not messages:
        return fallback

    system = _EXTRACT_SYSTEM if extract else _SYSTEM
    convo = [{"role": "system", "content": system + "\n\n" + _profile_context(profile)}]
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

    reply = parsed["reply"].strip()
    if extract:
        reply = reply_for_extract(reply)
    return {"reply": reply, "proposed_diff": _coerce_diff(parsed.get("proposed_diff"))}


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
        # The three the pre-flight form asks for and most people cannot answer
        # cold. Without them a conversation could fill only two of the modal's five
        # editable rows, which is not "tell Myro what you want" — it is a filter
        # tweak wearing that label.
        "deal_breakers": _titles("deal_breakers"),
        "career_goal": _scalar("career_goal"),
        "superpower": _scalar("superpower"),
    }
    # A diff with nothing actionable is not a diff.
    if not any(coerced.values()):
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

    # The three pre-flight inputs. Applied HERE too, not just in the modal's draft:
    # the concierge can now propose them on either surface, and a field that a
    # reply proposes but an apply silently drops is the half-behaviour this
    # codebase keeps paying for. `constraint` / `aspiration` are the kinds
    # `matching/targeting.py` already maps back onto deal_breakers / career_goal,
    # so this writes into the shape the Targeting Brief reads — it does not invent
    # a fourth store.
    for text in diff.get("deal_breakers") or []:
        mem.add(user_id, kind="constraint", text=text, source="distilled")
    if diff.get("deal_breakers"):
        changed["deal_breakers"] = diff["deal_breakers"]
    if diff.get("career_goal"):
        mem.add(user_id, kind="aspiration", text=diff["career_goal"], source="distilled")
        changed["career_goal"] = diff["career_goal"]
    if diff.get("superpower"):
        # No clean memory kind (targeting.py: "superpower — column-only, stays
        # manual"), so it rides as a note rather than being dropped on the floor.
        mem.add(user_id, kind="note", text=f"Superpower: {diff['superpower']}", source="distilled")
        changed["superpower"] = diff["superpower"]

    return changed
