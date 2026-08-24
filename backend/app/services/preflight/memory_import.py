"""Memory notes + the stored profile → typed OrderLines with provenance.

This is the module the original bug lived in the absence of. `user_memory` holds
free-text strings written by a distiller; the old pre-flight dropped them
straight into a sentence, so "Prefers roles in corporate functions" arrived
mid-clause with no attribution and no way to judge it. Here every string becomes
a line that carries **where it came from** and **what Myro thinks of it**, and
nothing leaves this module without a `source`.

Nothing here writes. It proposes lines; `order/lines` and the repository decide
what happens to them.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from app.services.matching.targeting import MemoryFact, TargetingBrief
from app.services.preflight.lines import OrderLine

_WONT_KINDS = ("constraint", "work_mode")
_LEAN_KINDS = ("preference",)
_GOAL_KINDS = ("aspiration",)

# A fact that reads like a preference rather than a hard line. Myro says so on
# the row instead of silently filing it as an exclusion, because a soft note
# promoted to a hard filter is how a search returns nothing.
_SOFT_HINTS = re.compile(
    r"\b(prefer|prefers|preferred|lean|leans|rather|ideally|mostly|usually|tend to|open to)\b", re.I
)

# Text Myro cannot run. Not a length heuristic with a magic number: these are
# the literal non-answers a one-line form collects — "No", "n/a", "-", "none".
# The prod case that motivated the whole redesign is a career_goal of "No".
_NON_ANSWERS = {
    "no", "yes", "n/a", "na", "none", "nil", "nothing", "-", "--", "idk",
    "i don't know", "i dont know", "not sure", "tbd", "?", ".",
}


def _is_unusable(text: str) -> bool:
    return re.sub(r"[^a-z0-9/' ]", "", text.strip().lower()) in _NON_ANSWERS


def _ref(prefix: str, value: str) -> str:
    """A stable dedupe key, which is ALSO the imported line's id.

    Deterministic on purpose. A uuid minted per read would change between the
    GET that rendered a guess and the PATCH that answers it, so every yes would
    404 unless the read happened to persist first. Hashed from the text because
    profile columns have no id of their own; re-importing the same stored answer
    must not ask the user about it twice.
    """
    return f"{prefix}:{hashlib.sha1(value.strip().lower().encode()).hexdigest()[:12]}"


def _note_for(fact: MemoryFact, total: int, repeated: bool) -> str:
    if fact.kind == "preference" and _SOFT_HINTS.search(fact.text):
        return "your notes read like a preference, not a hard line"
    if repeated:
        return f"from your {total} notes — said more than once"
    return f"from your {total} notes"


def _strip_lead(text: str) -> str:
    """Lines are stored as bare statements — the prose module re-adds "No " and
    the full stop where the grammar wants them. Storing "No large corporations."
    is what made the old brief read "Skip No large corporations."."""
    return re.sub(r"^no\s+", "", text.strip(), flags=re.I).rstrip(".")


def _norm_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.strip().lower())


def _kind_priority(kind: str) -> int:
    """When the distiller files the same note twice, keep the earlier round's kind."""
    return {"wont_take": 0, "lean": 1, "goal": 2, "strength": 3}.get(kind, 9)


def guesses_from(brief: TargetingBrief) -> list[OrderLine]:
    """Everything Myro would like the user to confirm, as lines.

    Only INFERRED material and stored answers Myro cannot vouch for. Deal-breakers
    the user typed themselves are not here — they are settled, and they arrive as
    kept lines through `confirmed_from` below.
    """
    facts = brief.facts
    total = len(facts)
    seen_texts: dict[str, int] = {}
    for fact in facts:
        key = fact.text.strip().lower()
        seen_texts[key] = seen_texts.get(key, 0) + 1

    out: list[OrderLine] = []

    def push(fact: MemoryFact, kind: str) -> None:
        text = _strip_lead(fact.text) if kind == "wont_take" else fact.text.strip().rstrip(".")
        if not text:
            return
        repeated = seen_texts.get(fact.text.strip().lower(), 0) > 1
        ref = _ref(f"mem:{kind}", fact.text)
        out.append(
            OrderLine(
                id=ref,
                kind=kind,  # type: ignore[arg-type]
                text=text,
                source="myro_inferred",
                source_note=_note_for(fact, total, repeated),
                origin="memory_import",
                status="unanswered",
                soft=bool(_SOFT_HINTS.search(fact.text)),
                ref=ref,
            )
        )

    for fact in facts:
        if fact.kind in _WONT_KINDS:
            push(fact, "wont_take")
        elif fact.kind in _LEAN_KINDS:
            push(fact, "lean")

    profile: dict[str, Any] = brief.profile

    # The two stored one-liners. They are the user's OWN words — the source chip
    # says so — but they are re-asked because nothing ever checked them: one of
    # the four prod users who reached this screen has a career_goal of "No".
    goal = (profile.get("career_goal") or "").strip()
    if not goal:
        goal = next((f.text for f in facts if f.kind in _GOAL_KINDS), "").strip()
    if goal:
        bad = _is_unusable(goal)
        goal_ref = _ref("profile:goal", goal)
        out.append(
            OrderLine(
                id=goal_ref,
                kind="goal",
                text=goal.rstrip("."),
                source="user_said",
                source_note=(
                    "that isn't a goal — reword it or drop it" if bad
                    else "tidied from your own words — yes keeps the tidy version"
                ),
                origin="cv_import",
                status="unanswered",
                unusable=bad,
                ref=goal_ref,
            )
        )

    power = (profile.get("superpower") or "").strip()
    if power:
        bad = _is_unusable(power)
        power_ref = _ref("profile:power", power)
        out.append(
            OrderLine(
                id=power_ref,
                kind="strength",
                text=power.rstrip("."),
                source="user_said",
                source_note=(
                    "that isn't a strength — reword it or drop it" if bad
                    else "tidied from your own words — yes keeps the tidy version"
                ),
                origin="cv_import",
                status="unanswered",
                unusable=bad,
                ref=power_ref,
            )
        )

    # One surface per statement. The distiller sometimes files the same note as
    # work_mode and preference — that asked twice across Won't take and Drawn to.
    merged: dict[str, OrderLine] = {}
    for line in out:
        key = _norm_key(line.text)
        prev = merged.get(key)
        if prev is None or _kind_priority(line.kind) < _kind_priority(prev.kind):
            merged[key] = line

    # A direction the user can neither see nor edit.
    #
    # `target_roles` is the matcher's READ MODEL, derived from
    # `target_role_titles` — never a source. 34 users carry it with no titles
    # behind it, all written April–June 2026 by a path that no longer exists,
    # and the values are Lightcast SKILL names: "Java", "Communication",
    # "Initiative and Leadership". Those are the ILIKE keys their whole job
    # search has been scoped on, and because `confirmed_from` imports titles
    # only, the modal opened with THE WORK empty above a full exclusion list.
    #
    # Surfaced as `unusable` role lines, not as titles: `yes` is refused
    # because a yes would assert "this is a role I chose", which is exactly what
    # nobody can say about a derived value. Reword makes it the user's own words
    # (`user_reworded`); no drops it. Either way the next run is theirs. The
    # cluster never becomes a title without someone writing it — the rule
    # `confirmed_from` exists to hold.
    scope: list[OrderLine] = []
    if not (profile.get("target_role_titles") or []):
        for raw in profile.get("target_roles") or []:
            text = str(raw).strip().rstrip(".")
            if not text:
                continue
            scope_ref = _ref("profile:role_scope", text)
            scope.append(
                OrderLine(
                    id=scope_ref,
                    kind="role",
                    text=text,
                    source="myro_inferred",
                    source_note="Myro has been searching this — you never set it as a role",
                    origin="cv_import",
                    status="unanswered",
                    unusable=True,
                    ref=scope_ref,
                )
            )

    return [*merged.values(), *scope]


def confirmed_from(brief: TargetingBrief) -> list[OrderLine]:
    """Lines the user already set. Kept on arrival — re-asking someone to
    confirm what they typed themselves is how a confirm screen stops meaning
    anything."""
    profile: dict[str, Any] = brief.profile
    out: list[OrderLine] = []

    # The work, first — it is the slot that DEFINES the search.
    #
    # Until 2026-08-21 this imported the two exclusion columns and not the one
    # that says what to look for, so every returning user opened the modal with
    # "The work" empty above a full "Won't take". The run then dispatched
    # anyway: `payload.resolve` omits an empty slot from the spec, and
    # `targeting_write.apply` is a PATCH, so the search silently ran on the
    # stored titles the modal had just declined to show. "Myro runs on the lines
    # above and nothing else" was false for the one line that matters most.
    #
    # `target_role_titles` only — never the derived `target_roles` clusters.
    # Titles are the write vocabulary (`role_title_updates`); feeding the
    # matcher's read model back in as source would let a cluster name become a
    # title the user never wrote.
    for raw in profile.get("target_role_titles") or []:
        text = str(raw).strip().rstrip(".")
        if text:
            ref = _ref("profile:role", text)
            out.append(
                OrderLine(
                    id=ref, kind="role", text=text, source="user_said",
                    source_note="you set this", origin="preflight", status="kept",
                    ref=ref,
                )
            )

    for raw in profile.get("deal_breakers") or []:
        text = _strip_lead(str(raw))
        if text:
            ref = _ref("profile:wont", text)
            out.append(
                OrderLine(
                    id=ref, kind="wont_take", text=text, source="user_said",
                    source_note="you set this", origin="preflight", status="kept",
                    ref=ref,
                )
            )

    location = (profile.get("target_location") or "").strip()
    if location:
        ref = _ref("profile:location", location)
        out.append(
            OrderLine(
                id=ref, kind="location", text=location.rstrip("."), source="user_said",
                source_note="you set this", origin="preflight", status="kept",
                ref=ref,
            )
        )
    return out
