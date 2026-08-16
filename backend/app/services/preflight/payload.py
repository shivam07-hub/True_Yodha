"""Kept lines → the profile patch the run is dispatched against.

The invariant, in one function: `project()` reads `order.kept()` and nothing
else. An unanswered line never reaches the matcher — not defaulted to kept, not
inferred from "well, Myro proposed it". `lines.drop_unanswered` runs immediately
before this, server-side, so a client that forgets cannot widen the run.

Why a profile patch and not a bespoke run request: `targeting.for_ranking` —
every path that computes a brain verdict — reads `user_profiles` plus the memory
facts. If the order dispatched its own payload there would be two answers to
"what is this user searching for", and the cached-forever verdicts would be
written against whichever one the caller happened to hold. So the order projects
onto the existing columns through the existing writer, and the matcher keeps
reading exactly what it reads today.
"""
from __future__ import annotations

from typing import Any

from app.services.preflight.lines import Order

_MAX_PER_GROUP = 6


def _texts(order: Order, kind: str) -> list[str]:
    out: list[str] = []
    for line in order.kept():
        if line.kind != kind:
            continue
        text = line.text.strip()
        if text and not any(text.lower() == seen.lower() for seen in out):
            out.append(text)
    return out[:_MAX_PER_GROUP]


def project(order: Order) -> dict[str, Any]:
    """The `PATCH /users/me` body for this order.

    `target_role_titles` are human titles — the backend derives the matcher's
    cluster union from them (one writer, see `role_title_updates`). `lean` has no
    column and is routed to the authored-`preference` writer by the same route.
    """
    roles = _texts(order, "role")
    locations = _texts(order, "location")
    # A pay floor is a hard constraint the matcher reads as a deal-breaker; it
    # has no column of its own, and inventing one would be a second place to
    # look for the same fact.
    wont = _texts(order, "wont_take") + [f"Below {text}" for text in _texts(order, "pay_floor")]
    goals = _texts(order, "goal")
    strengths = _texts(order, "strength")

    payload: dict[str, Any] = {
        "deal_breakers": wont[:_MAX_PER_GROUP],
        "lean": _texts(order, "lean"),
        "career_goal": goals[0] if goals else None,
        "superpower": strengths[0] if strengths else None,
    }
    # Only sent when the order actually holds one: a PATCH with an empty title
    # list would wipe the targeting of a user who opened the gate, said nothing
    # and hit Run.
    if roles:
        payload["target_role_titles"] = roles
    if locations:
        payload["target_location"] = locations[0]
    return payload


def run_summary(order: Order) -> dict[str, int]:
    """What the contract line on the review screen counts."""
    return {
        "kept": len(order.kept()),
        "dropped": len([x for x in order.lines if x.status == "dropped"]),
        "unanswered": len([x for x in order.lines if x.status == "unanswered"]),
        "from_market": len([x for x in order.kept() if x.origin == "market"]),
    }
