"""Verdict Currency — may this person see a stored verdict, and how.

One answer for a person and a stored match row (`ARCHITECTURE_RETURN_LOOP.md`
§4A, BACKLOG #55):

- ``current`` — judged for this CV, this direction, under today's rules and facts.
- ``stale`` — same CV and same direction, but what the brain was told has moved
  since (a `PROMPT_VERSION` bump, a distilled memory fact) or the row predates
  `eval_context_hash`. Shown after the current rows while the drain re-reads it;
  it upgrades in place when the re-read lands.
- ``foreign`` — another CV or another direction. Not shown.

Before this, `eval_context_hash` decided membership on /market, so a prompt edit
hid every list at once and each memory distill hid one person's list (S0,
2026-10-13: 39 of 54 people active in 30 days opened /market to nothing; 18 of
them had stale verdicts worth showing).

Every reader asks it: /market (`published_list`), Agent Picks (at regeneration
and again at read, because a set cut before a direction change outlives it),
Collections (an untouched match only; a saved job is the person's own act), and
the Next chip through the /market list it names jobs from. The replaced-CV list
is /market's alone: it is honest there because the list says so, and no other
surface carries that sentence.

Callers never compare the two hash columns themselves: this module exists to
give one answer, so it does not export its inputs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Currency = Literal["current", "stale", "foreign"]


@dataclass(frozen=True)
class VerdictCurrency:
    _eval_key: str
    _direction_key: str | None

    def of(self, row: dict[str, Any]) -> Currency:
        if row.get("eval_context_hash") == self._eval_key:
            return "current"
        # The direction key hashes the baseline, so a match here is the same CV
        # as well as the same direction. No key (no baseline) proves neither.
        if self._direction_key is not None and row.get("target_context_hash") == self._direction_key:
            return "stale"
        return "foreign"


def for_profile(profile: dict[str, Any]) -> VerdictCurrency:
    """`profile` is the ranking profile with `baseline_version_id` set — the
    same dict the brain is handed, so the keys are what it would be told now."""
    from app.services import onboarding_service

    return VerdictCurrency(
        _eval_key=onboarding_service.eval_context_key(profile),
        _direction_key=onboarding_service.context_key(profile),
    )


def for_user(repo: Any, user_id: str) -> VerdictCurrency:
    """For a read path that holds no profile: three small reads (the direction
    columns, memory, the latest CV), sequential. Callers run it beside the read
    it gates, so it costs a wave slot, not wall time."""
    from app.services.matching import targeting

    profile = targeting.for_currency(repo, user_id).ranking_profile()
    profile["baseline_version_id"] = repo.get_latest_baseline_id(user_id)
    return for_profile(profile)
