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
2026-10-13: 39 of 51 people active in 30 days opened /market to nothing; 18 of
them had stale verdicts worth showing).

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
