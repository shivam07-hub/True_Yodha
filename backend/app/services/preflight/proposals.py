"""An utterance (or a topic chip) → proposed changes to the order.

A proposal is a DIFF against the saved order, never a free-floating suggestion:
each one is a list of typed effects the user can see before they accept it, so
"apply" has a visible before and after. It applies nothing itself — the router
does that only after the user says yes.

Two entry points, deliberately different:

- `from_utterance` runs the conversation through the mentor (one voice, one
  seam — see mentor.py) and translates its filter diff into effects. The LLM
  reads free text; it never decides what happens to the order.
- `from_topic` is the market sheet's four canned chips. Deterministic, because
  the copy and the cost of each one are specified, and because a chip that
  proposes something different every time is not a chip.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.preflight.lines import LineKind, Order

# Field → the label above a proposal row, and the note under it. The mentor
# returns a filter diff with no per-field rationale, so the "why" is authored
# here rather than hallucinated per turn.
_EYEBROW: dict[str, str] = {
    "location": "LOCATION",
    "wont_take": "WON'T TAKE",
    "lean": "DRAWN TO",
    "role": "THE WORK",
    "pay_floor": "PAY FLOOR",
    "goal": "WHERE YOU'RE HEADED",
    "strength": "BEST AT",
}
_WHY: dict[str, str] = {
    "location": "From where you said you'd work.",
    "wont_take": "Filed as a hard no — say no if that's too strong.",
    "lean": "This only tilts the ranking, it never excludes a role. A guess.",
    "role": "The work you just named.",
    "pay_floor": "A floor, not a target — roles under it drop out.",
    "goal": "In your words, tidied.",
    "strength": "In your words, tidied.",
}


@dataclass(frozen=True)
class Effect:
    op: Literal["add", "drop"]
    kind: LineKind | None = None
    text: str = ""
    line_id: str | None = None
    #: Row label under the text — "new line · won't take", or why a line is
    #: being struck.
    label: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"op": self.op, "kind": self.kind, "text": self.text, "line_id": self.line_id, "label": self.label}


@dataclass(frozen=True)
class Proposal:
    id: str
    eyebrow: str
    value: str
    why: str
    effects: list[Effect] = field(default_factory=list)
    #: Widening needs a fresh scan of roles nothing has rated yet, so it costs a
    #: run. Narrowing is served by re-running over what is already scored.
    costly: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "eyebrow": self.eyebrow,
            "value": self.value,
            "why": self.why,
            "effects": [e.to_dict() for e in self.effects],
            "costly": self.costly,
        }


def _clean(text: str) -> str:
    return " ".join(str(text).split()).rstrip(".")


def _strip_no(text: str) -> str:
    return re.sub(r"^no\s+", "", _clean(text), flags=re.I)


def _add(kind: LineKind, text: str, label: str) -> Effect:
    return Effect(op="add", kind=kind, text=text, label=f"new line · {label}")


def from_utterance(diff: dict[str, Any] | None, order: Order) -> list[Proposal]:
    """The mentor's filter diff → one proposal per field it touched.

    One proposal per field, never one lumped change: the whole point of this
    screen is that the user can say yes to the location and no to the won't-take
    without rewriting either.
    """
    if not diff:
        return []
    out: list[Proposal] = []
    seq = 0

    def push(kind: LineKind, value: str, label: str, *, costly: bool) -> None:
        nonlocal seq
        value = _clean(value)
        if not value:
            return
        if any(line.text.lower() == value.lower() and line.kind == kind for line in order.lines):
            return  # already on the order — proposing it back is noise
        seq += 1
        out.append(
            Proposal(
                id=f"u{seq}",
                eyebrow=_EYEBROW[kind],
                value=value,
                why=_WHY[kind],
                effects=[_add(kind, value, label)],
                costly=costly,
            )
        )

    for role in diff.get("add_roles") or []:
        push("role", role, "the work", costly=True)
    for location in diff.get("locations") or []:
        push("location", location, "location", costly=True)
    for breaker in diff.get("deal_breakers") or []:
        push("wont_take", _strip_no(breaker), "won't take", costly=False)
    for soft in (diff.get("seniority"), diff.get("work_mode")):
        if soft:
            push("lean", soft, "drawn to", costly=False)
    if diff.get("salary"):
        push("pay_floor", diff["salary"], "pay floor", costly=False)
    if diff.get("career_goal"):
        push("goal", diff["career_goal"], "where you're headed", costly=False)
    if diff.get("superpower"):
        push("strength", diff["superpower"], "best at", costly=False)

    # Dropping a role the user has moved on from narrows the search — free, and
    # it is a diff against lines that already exist, so it carries the line id.
    for role in diff.get("remove_roles") or []:
        match = next(
            (x for x in order.lines if x.kind == "role" and x.text.lower() == _clean(role).lower()), None
        )
        if match:
            seq += 1
            out.append(
                Proposal(
                    id=f"u{seq}", eyebrow=_EYEBROW["role"], value=match.text,
                    why="You said this isn't what you're after any more.",
                    effects=[Effect(op="drop", line_id=match.id, text=match.text, label="off your order")],
                    costly=False,
                )
            )
    return out


# ── the market sheet's four chips ────────────────────────────────────────────

TOPICS: dict[str, dict[str, Any]] = {
    "the work": {
        "said": "too many big-corp roles",
        "add": ("wont_take", "Companies over ~5,000 people", "won't take"),
        "why": "Narrows what you already told me — no re-scan needed.",
        "costly": False,
    },
    "the place": {
        "said": "I'd rather not commute across the city",
        "add": ("location", "South Bengaluru, or fully remote", "location"),
        "why": "Your saved order just names the city — this tightens it.",
        "costly": False,
    },
    "the level": {
        "said": "these are all too junior",
        "add": ("lean", "Senior titles, 8+ years", "drawn to"),
        "drop_matching": ("wont_take", r"senior management"),
        "why": (
            "You told me no senior management in pre-flight — that's what's capping the level. "
            "Dropping it opens senior roles back up, so this needs a fresh scan."
        ),
        "costly": True,
    },
    "the pay": {
        "said": "the pay is too low",
        "add": ("pay_floor", "Pay floor ₹45L total comp", "pay floor"),
        "why": "Narrows what you already told me — no re-scan needed.",
        "costly": False,
    },
}

# Free text → the nearest topic. Anything that matches nothing is saved as the
# user's own won't-take, verbatim — Myro guessing at an unmatched sentence is
# how a complaint about pay becomes a location filter.
_ROUTES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"junior|senior|level|lead|title", re.I), "the level"),
    (re.compile(r"pay|salary|comp|lpa|money|ctc", re.I), "the pay"),
    (re.compile(r"remote|commute|office|location|city|hybrid|relocat", re.I), "the place"),
    (re.compile(r"corp|big|enterprise|company|startup|agency|consult", re.I), "the work"),
]


def route(text: str) -> str | None:
    for pattern, topic in _ROUTES:
        if pattern.search(text):
            return topic
    return None


def from_topic(topic: str, order: Order) -> Proposal | None:
    spec = TOPICS.get(topic)
    if spec is None:
        return None
    kind, text, label = spec["add"]
    effects: list[Effect] = []
    costly = bool(spec["costly"])

    drop_rule = spec.get("drop_matching")
    if drop_rule:
        drop_kind, pattern = drop_rule
        target = next(
            (
                x for x in order.lines
                if x.kind == drop_kind and x.status == "kept" and re.search(pattern, x.text, re.I)
            ),
            None,
        )
        if target:
            effects.append(
                Effect(
                    op="drop", line_id=target.id, text=target.text,
                    label="you confirmed this in pre-flight — it's what's holding the level down",
                )
            )
        else:
            # Nothing to strike, so nothing widens — this is an add, and adds of
            # a lean are free. Quoting a re-run cost for work that isn't
            # happening is how a "free" promise and a debit meet on one screen.
            costly = False
    effects.append(_add(kind, text, label))
    return Proposal(
        id=f"t:{topic}", eyebrow=_EYEBROW[kind], value=text, why=spec["why"], effects=effects, costly=costly
    )


def from_free_text(text: str, order: Order) -> Proposal | None:
    """The market composer. Routed to a topic when the words say which one;
    otherwise saved exactly as typed, and the rationale says so."""
    text = _clean(text)
    if not text:
        return None
    topic = route(text)
    if topic:
        return from_topic(topic, order)
    # Verbatim, deliberately. `_strip_no` is right for a structured deal-breaker
    # the model authored ("No people-management roles" → "people-management
    # roles"); on a whole sentence it eats the first word — "no more ghost
    # listings please" became "more ghost listings please", which says the
    # opposite. Store what the user said; the prose module normalises the
    # leading "No" on READ, where it can see the grammar it is building.
    return Proposal(
        id="free",
        eyebrow=_EYEBROW["wont_take"],
        value=text,
        why="Saved exactly as you typed it — reword it in the pre-flight any time.",
        effects=[_add("wont_take", text, "won't take")],
        costly=False,
    )
