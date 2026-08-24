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
from app.services.preflight import normalise
from app.services.preflight.spec import EMPTY, SLOT_ARITY, SLOT_KINDS, presence_of, slot_for

__all__ = ["SLOT_ARITY", "SLOT_KINDS", "resolve", "project", "client_report", "run_summary"]

ConflictKind = Literal["arity", "contradiction", "value_clash"]

_RELOCATE = re.compile(
    r"\b(relocate|relocating|relocation|willing to move|open to mov|"
    r"open to other (cities|countries|locations))\b",
    re.I,
)



@dataclass(frozen=True)
class Conflict:
    slot: str
    kind: ConflictKind
    line_ids: tuple[str, ...]
    texts: tuple[str, ...]


@dataclass(frozen=True)
class Slot:
    """One slot, as the resolver leaves it — and therefore as the screen shows it.

    `line_ids` is not "the lines whose kind files here". It is the lines the
    resolver PLACED: deduped, uncontested, within arity — the exact set that
    reaches `spec`. That equality is the point. While the client filed lines
    into slots itself it was a second resolver working off the raw `lines`
    array, and the two disagreed in the only direction that matters: the client
    showed duplicates the server had already collapsed, counted them
    (`Won't take · 15 of 6`), and asked the user to fix a number that was never
    going to be run.

    `contested_ids` is this slot's share of the live conflicts. Together the two
    tuples partition the slot, so `filled` is stated by the resolver rather than
    added up by whoever is rendering.
    """

    key: str
    arity: int
    line_ids: tuple[str, ...]
    contested_ids: tuple[str, ...]


@dataclass(frozen=True)
class ResolveResult:
    spec: dict[str, Any]
    used_line_ids: tuple[str, ...]
    conflicts: tuple[Conflict, ...]
    slots: tuple[Slot, ...]
    #: Kept lines that file to no slot. Reported so the screen can still show
    #: them — a line that vanishes because Myro reclassified it is the data loss
    #: this whole pass exists to stop.
    facts: tuple[str, ...] = ()


def _slot_text(line: OrderLine) -> str:
    text = line.text.strip()
    if line.kind == "pay_floor":
        return f"Below {text}"
    return text


def _dedupe(lines: list[OrderLine]) -> list[OrderLine]:
    """Same statement in the same slot collapses to the first. Cross-slot repeats
    are contradictions, not duplicates.

    It used to also return a COUNT of what it collapsed, reported on the wire as
    `duplicates_collapsed`. Nothing ever read it — and once the client started
    rendering `slots` rather than filing `lines` itself, a collapsed duplicate
    simply never reaches the screen, so there is nothing for a count to explain.
    """
    kept: list[OrderLine] = []
    seen: set[tuple[str, str]] = set()
    for line in lines:
        slot = slot_for(line)
        key = _norm_key(_slot_text(line))
        if slot is None or not key:
            continue
        stamp = (slot, key)
        if stamp in seen:
            continue
        seen.add(stamp)
        kept.append(line)
    return kept


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
        for lean in leans:
            # Exact text was the only test until 2026-08-25, so prod held
            # "Avoids large corporations" and "Prefers large or established
            # companies" as kept lines in one spec and said nothing.
            if normalise.overlap(wont_line.text, lean.text) >= _SAME_SUBJECT:
                add(wont_line, lean, "deal_breakers")

    for location in locations:
        for other in (*leans, *wont):
            if _RELOCATE.search(other.text):
                add(location, other, "target_location")
    return out


#: Jaccard at or above this means two statements are about the same subject.
_SAME_SUBJECT = 0.5

#: Dimensions that can only hold one value, whatever the arity of the slot they
#: file into. A second pay floor is not a second exclusion — it is the same
#: question answered twice, and prod holds "more than 30 lakhs" beside "Pay
#: floor \u20b945L total comp".
_SINGLE_VALUED: tuple[str, ...] = ("pay_floor",)


def _value_clashes(lines: list[OrderLine]) -> list[Conflict]:
    """One question per single-valued dimension answered more than one way."""
    out: list[Conflict] = []
    for kind in _SINGLE_VALUED:
        group = [line for line in lines if line.kind == kind]
        if len(group) < 2:
            continue
        slot = slot_for(group[0])
        out.append(
            Conflict(
                slot=slot or "deal_breakers",
                kind="value_clash",
                line_ids=tuple(line.id for line in group),
                texts=tuple(line.text for line in group),
            )
        )
    return out


def resolve(order: Order) -> ResolveResult:
    """Order → six-slot spec plus the decisions the user still has to make.

    A slot reaches `spec` only when it is `stated` or `cleared`. `absent` and
    `contested` omit the key entirely — see `spec.py` for why writing them was
    erasing profile columns nobody had answered.
    """
    unique = _dedupe(normalise.apply(list(order.kept())))
    conflicts = _contradictions(unique) + _value_clashes(unique)
    blocked = {line_id for conflict in conflicts for line_id in conflict.line_ids}
    usable = [line for line in unique if line.id not in blocked]

    by_slot: dict[str, list[OrderLine]] = {slot: [] for slot in SLOT_ARITY}
    for line in usable:
        slot = slot_for(line)
        if slot is not None:
            by_slot[slot].append(line)

    placed: dict[str, list[OrderLine]] = {}
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
            placed[slot] = []
            continue
        placed[slot] = group

    # A slot is contested if ANY line filing there is held by a conflict — not
    # merely if a conflict names the slot. A won't-take contradicting a lean is
    # filed under `deal_breakers`, and the lean side must not write either.
    contested_ids = {line_id for conflict in conflicts for line_id in conflict.line_ids}
    contested_slots = {
        slot_for(line) for line in unique if line.id in contested_ids
    } | {conflict.slot for conflict in conflicts}

    spec: dict[str, Any] = {}
    used: list[str] = []
    for slot, arity in SLOT_ARITY.items():
        group = placed[slot]
        state = presence_of(
            order, slot, placed=len(group), contested=slot in contested_slots
        )
        if state == "stated":
            texts = [_slot_text(line) for line in group]
            spec[slot] = texts if arity > 1 else texts[0]
            used.extend(line.id for line in group)
        elif state == "cleared":
            spec[slot] = EMPTY[slot]

    # The slot view, partitioned by the decisions just made. `line_ids` is the
    # placed set — identical to what went into `spec` — so the screen and the
    # run cannot describe the order differently.
    placed_ids = set(used)
    slots = tuple(
        Slot(
            key=slot,
            arity=arity,
            line_ids=tuple(line.id for line in by_slot[slot] if line.id in placed_ids),
            contested_ids=tuple(
                line.id for line in unique if slot_for(line) == slot and line.id in contested_ids
            ),
        )
        for slot, arity in SLOT_ARITY.items()
    )

    return ResolveResult(
        spec=spec,
        used_line_ids=tuple(used),
        conflicts=tuple(conflicts),
        slots=slots,
        facts=tuple(line.id for line in unique if line.kind == "fact"),
    )


def project(order: Order) -> dict[str, Any]:
    """The `PATCH /users/me` body for this order.

    `target_role_titles` are human titles — the backend derives the matcher's
    cluster union from them (one writer, see `role_title_updates`). `lean` has no
    column and is routed to the authored-`preference` writer by the same route.
    """
    return resolve(order).spec


def client_report(order: Order) -> dict[str, Any]:
    """The resolver's report, as the review screen consumes it.

    Each slot names the lines the resolver placed there
    and the ones a conflict is holding, so the client renders the resolver's
    decision rather than repeating it. Each conflict carries the statements and
    how many the slot can keep, so the card can ask without re-deriving arity.
    """
    result = resolve(order)
    return {
        "used": len(result.used_line_ids),
        "facts": list(result.facts),
        "slots": [
            {
                "key": slot.key,
                "arity": slot.arity,
                "line_ids": list(slot.line_ids),
                "contested_ids": list(slot.contested_ids),
            }
            for slot in result.slots
        ],
        "conflicts": [
            {
                "slot": conflict.slot,
                "kind": conflict.kind,
                "line_ids": list(conflict.line_ids),
                "texts": list(conflict.texts),
                "keep": SLOT_ARITY[conflict.slot],
            }
            for conflict in result.conflicts
        ],
    }


def run_summary(order: Order) -> dict[str, int]:
    """The three counts `RunOut` reports back from a dispatch.

    It used to return four more — `used`, `from_market`, `duplicates_collapsed`,
    `conflicts` — and call `resolve()` to get them. No caller read any of the
    four, and `/preflight/run` already resolves the same order through
    `project()`, so the run path paid for the resolver twice per dispatch.
    """
    return {
        "kept": len(order.kept()),
        "dropped": len([x for x in order.lines if x.status == "dropped"]),
        "unanswered": len([x for x in order.lines if x.status == "unanswered"]),
    }
