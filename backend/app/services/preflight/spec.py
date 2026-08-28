"""The six slots, and what an EMPTY one means.

Split out of `payload.py` because the meaning of absence is a contract in its
own right, and it was being decided implicitly by a dict literal.

The bug this module exists to fix: `resolve()` seeded

    spec = {"career_goal": None, "superpower": None, "deal_breakers": [], ...}

and popped a key only on an arity conflict. Every other empty slot reached
`targeting_write.apply` as `None` or `[]` — and nothing downstream strips
either — so **pressing Run wrote NULL over a stored career_goal the user had
never been asked about**. In prod on 2026-08-24: a real goal ("a high paying
job in an MNC with flexible working hours") and six stored deal-breakers, both
about to be erased by a screen whose own header said `Won't take · 10 of 6`.

An empty slot means one of three things and they do NOT write the same patch:

- **stated**   — lines were placed here. Write them.
- **cleared**  — the user ANSWERED no to what was here. Write the empty value;
                 "Myro runs on the lines above and nothing else" requires it.
- **absent**   — nothing was ever answered here. OMIT the key. The stored value
                 stands, because the user never touched it.

`cleared` and `absent` are told apart by `answered_at`, which already exists:
`lines.drop` stamps it, `lines.drop_unanswered` deliberately does not. So an
unanswered guess and a rejected one are the same `status` and a different
answer — which is the whole distinction the old dict could not hold.
"""
from __future__ import annotations

from typing import Any, Literal

from app.services.career_target import MAX_TARGET_LOCATIONS
from app.services.preflight.lines import Order, OrderLine

Presence = Literal["stated", "cleared", "absent", "contested"]

#: The slot key IS the profile column the spec writes (see `payload.project`),
#: so this is `target_locations`, plural, and its arity is the cap
#: `targeting_write` already enforces on that column. It was 1, and a single
#: slot could not hold "Mumbai. Bangalore is also fine" — the second city was
#: dropped at the door while /market, onboarding and Settings all took both.
SLOT_ARITY: dict[str, int] = {
    "target_role_titles": 6,
    "target_locations": MAX_TARGET_LOCATIONS,
    "deal_breakers": 6,
    "lean": 6,
    "career_goal": 1,
    "superpower": 1,
}

SLOT_KINDS: dict[str, tuple[str, ...]] = {
    "target_role_titles": ("role",),
    "target_locations": ("location",),
    "deal_breakers": ("wont_take", "pay_floor"),
    "lean": ("lean",),
    "career_goal": ("goal",),
    "superpower": ("strength",),
}

#: What "the user emptied this slot" writes. A scalar slot clears to NULL, a
#: list slot to []. Only ever reached through `cleared`.
EMPTY: dict[str, Any] = {
    "target_role_titles": [],
    "target_locations": [],
    "deal_breakers": [],
    "lean": [],
    "career_goal": None,
    "superpower": None,
}


def slot_for(line: OrderLine) -> str | None:
    for slot, kinds in SLOT_KINDS.items():
        if line.kind in kinds:
            return slot
    return None


def presence_of(order: Order, slot: str, *, placed: int, contested: bool) -> Presence:
    """What this slot is asserting, given what the resolver did with it.

    Order matters: a contested slot is neither stated nor cleared — the user has
    not finished answering, so it must not write at all.
    """
    if contested:
        return "contested"
    if placed:
        return "stated"
    filed = [line for line in order.lines if slot_for(line) == slot]
    return "cleared" if any(line.answered_at for line in filed) else "absent"
