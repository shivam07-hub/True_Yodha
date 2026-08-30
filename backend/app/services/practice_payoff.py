"""What a cleared level bought, said in jobs.

A clear used to end in a score, a coin total and silence. The user practised
because a role asked for the skill; the one thing they wanted to know — did that
change anything — was never answered. This module answers it.

The claim is deliberately narrow. Clearing L2 Cold Calling does NOT mean the
user now matches a role: other skills may still be missing, and saying otherwise
would be the same overclaim the no-fabrication guard exists to stop. It means
their level now clears the bar THAT ROLE SET FOR THIS SKILL, which is true,
checkable, and theirs.

Silence is a valid answer. A user who clears a rung on a skill no live role asks
for gets no line at all — never a "0 roles", which reads as a verdict on them
rather than on the market.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from postgrest.exceptions import APIError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PracticePayoff:
    """Roles whose bar for this skill the user now clears."""

    newly_met: int
    met_total: int
    total_asking: int

    def as_dict(self) -> dict[str, int]:
        return {
            "newly_met": self.newly_met,
            "met_total": self.met_total,
            "total_asking": self.total_asking,
        }


def _cities_for(admin, user_id: str) -> list[str]:
    """The user's saved locations — the same list the feed scopes on, so the
    number here can never name a market the feed does not show."""
    try:
        row = (
            admin.table("user_profiles")
            .select("target_locations, target_location")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except APIError:
        return []
    data = (row.data if row else None) or {}
    cities = data.get("target_locations") or []
    if not cities and data.get("target_location"):
        cities = [data["target_location"]]
    return [str(c).strip() for c in cities if str(c or "").strip()]


def roles_cleared(admin, user_id: str, skill_id: int, *, from_level: int, to_level: int) -> PracticePayoff | None:
    """Best-effort. Returns None when there is nothing honest to say — no live
    role asks for this skill, or the read failed.

    Never raises: this decorates a result screen the user has already earned.
    A payoff line that fails must not cost someone their score.
    """
    try:
        rows = admin.rpc(
            "roles_met_by_skill_level",
            {
                "p_skill_id": int(skill_id),
                "p_from_level": int(from_level),
                "p_to_level": int(to_level),
                "p_cities": _cities_for(admin, user_id),
            },
        ).execute().data or []
    except APIError as exc:
        logger.info(
            "metric practice.payoff_unavailable skill=%s reason=%s",
            skill_id, exc.__class__.__name__,
        )
        return None

    row = rows[0] if rows else None
    if not row:
        return None
    payoff = PracticePayoff(
        newly_met=int(row.get("newly_met") or 0),
        met_total=int(row.get("met_total") or 0),
        total_asking=int(row.get("total_asking") or 0),
    )
    # Nothing in the live market asks for this skill. Say nothing.
    if payoff.total_asking <= 0:
        return None
    return payoff
