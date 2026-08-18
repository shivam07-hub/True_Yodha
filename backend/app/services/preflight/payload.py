"""Kept lines → the profile patch the run is dispatched against.

The invariant, in one function: `project()` reads `order.kept()` and nothing
else. An unanswered line never reaches the matcher — not defaulted to kept, not
inferred from "well, Myro proposed it". `lines.drop_unanswered` runs immediately
before this, server-side, so a client that forgets cannot widen the run.

`resolve()` is where the Order becomes the six-slot spec: duplicates collapse
silently, each slot states its arity, and contradictions are reported rather
than guessed. `project()` is the PATCH adapter over that spec.

Why a profile patch and not a bespoke run request: `targeting.for_ranking` —
every path that computes a brain verdict — reads `user_profiles` plus the memory
facts. If the order dispatched its own payload there would be two answers to
"what is this user searching for", and the cached-forever verdicts would be
written against whichever one the caller happened to hold. So the order projects
onto the existing columns through the existing writer, and the matcher keeps
reading exactly what it reads today.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from app.services.preflight.lines import Order, OrderLine, _norm_key

ConflictKind = Literal["arity", "contradiction"]

_RELOCATE = re.compile(
    r"\b(relocate|relocating|relocation|willing to move|open to mov|"
    r"open to other (cities|countries|locations))\b",
    re.I,
)

SLOT_ARITY: dict[str, int] = {
    "target_role_titles": 6,
    "target_location": 1,
    "deal_breakers": 6,
    "lean": 6,
    "career_goal": 1,
    "superpower": 1,
}

_SLOT_KINDS: dict[str, tuple[str, ...]] = {
    "target_role_titles": ("role",),
    "target_location": ("location",),
    "deal_breakers": ("wont_take", "pay_floor"),
    "lean": ("lean",),
    "career_goal": ("goal",),
    "superpower": ("strength",),
}


@dataclass(frozen=True)
class Conflict:
    slot: str
    kind: ConflictKind
    line_ids: tuple[str, ...]
    texts: tuple[str, ...]


@dataclass(frozen=True)
class ResolveResult:
    spec: dict[str, Any]
    used_line_ids: tuple[str, ...]
    duplicates_collapsed: int
    conflicts: tuple[Conflict, ...]


def _slot_for(line: OrderLine) -> str | None:
    for slot, kinds in _SLOT_KINDS.items():
        if line.kind in kinds:
            return slot
    return None


def _slot_text(line: OrderLine) -> str:
    text = line.text.strip()
    if line.kind == "pay_floor":
        return f"Below {text}"
    return text


def _dedupe(lines: list[OrderLine]) -> tuple[list[OrderLine], int]:
    """Same statement in the same slot collapses to the first. Cross-slot repeats
    are contradictions, not duplicates."""
    kept: list[OrderLine] = []
    seen: set[tuple[str, str]] = set()
    collapsed = 0
    for line in lines:
        slot = _slot_for(line)
        key = _norm_key(_slot_text(line))
        if slot is None or not key:
            continue
        stamp = (slot, key)
        if stamp in seen:
            collapsed += 1
            continue
        seen.add(stamp)
        kept.append(line)
    return kept, collapsed


def _contradictions(lines: list[OrderLine]) -> list[Conflict]:
    """Pairs that cannot both hold. Reported, never resolved."""
    out: list[Conflict] = []
    seen: set[tuple[str, str]] = set()
    wont = [line for line in lines if line.kind == "wont_take"]
    leans = [line for line in lines if line.kind == "lean"]
    locations = [line for line in lines if line.kind == "location"]

    def add(left: OrderLine, right: OrderLine, slot: str) -> None:
        stamp = tuple(sorted((left.id, right.id)))
        if stamp in seen:
            return
        seen.add(stamp)
        out.append(
            Conflict(
                slot=slot,
                kind="contradiction",
                line_ids=(left.id, right.id),
                texts=(_slot_text(left), _slot_text(right)),
            )
        )

    for wont_line in wont:
        key = _norm_key(wont_line.text)
        for lean in leans:
            if _norm_key(lean.text) == key:
                add(wont_line, lean, "deal_breakers")

    for location in locations:
        for other in (*leans, *wont):
            if _RELOCATE.search(other.text):
                add(location, other, "target_location")
    return out


def resolve(order: Order) -> ResolveResult:
    """Order → six-slot spec plus the decisions the user still has to make."""
    unique, collapsed = _dedupe(list(order.kept()))
    conflicts = _contradictions(unique)
    blocked = {line_id for conflict in conflicts for line_id in conflict.line_ids}
    usable = [line for line in unique if line.id not in blocked]

    by_slot: dict[str, list[OrderLine]] = {slot: [] for slot in SLOT_ARITY}
    for line in usable:
        slot = _slot_for(line)
        if slot is not None:
            by_slot[slot].append(line)

    spec: dict[str, Any] = {
        "deal_breakers": [],
        "lean": [],
        "career_goal": None,
        "superpower": None,
    }
    used: list[str] = []

    for slot, arity in SLOT_ARITY.items():
        group = by_slot[slot]
        if len(group) > arity:
            conflicts.append(
                Conflict(
                    slot=slot,
                    kind="arity",
                    line_ids=tuple(line.id for line in group),
                    texts=tuple(_slot_text(line) for line in group),
                )
            )
            if slot in ("career_goal", "superpower", "target_location"):
                spec.pop(slot, None)
            continue
        if not group:
            continue
        used.extend(line.id for line in group)
        texts = [_slot_text(line) for line in group]
        if slot == "target_role_titles":
            spec["target_role_titles"] = texts
        elif slot == "target_location":
            spec["target_location"] = texts[0]
        elif slot == "deal_breakers":
            spec["deal_breakers"] = texts
        elif slot == "lean":
            spec["lean"] = texts
        elif slot == "career_goal":
            spec["career_goal"] = texts[0]
        else:
            spec["superpower"] = texts[0]

    return ResolveResult(
        spec=spec,
        used_line_ids=tuple(used),
        duplicates_collapsed=collapsed,
        conflicts=tuple(conflicts),
    )


def project(order: Order) -> dict[str, Any]:
    """The `PATCH /users/me` body for this order.

    `target_role_titles` are human titles — the backend derives the matcher's
    cluster union from them (one writer, see `role_title_updates`). `lean` has no
    column and is routed to the authored-`preference` writer by the same route.
    """
    return resolve(order).spec


def run_summary(order: Order) -> dict[str, int]:
    """What the contract line on the review screen counts."""
    result = resolve(order)
    return {
        "kept": len(order.kept()),
        "used": len(result.used_line_ids),
        "dropped": len([x for x in order.lines if x.status == "dropped"]),
        "unanswered": len([x for x in order.lines if x.status == "unanswered"]),
        "from_market": len([x for x in order.kept() if x.origin == "market"]),
        "duplicates_collapsed": result.duplicates_collapsed,
        "conflicts": len(result.conflicts),
    }
