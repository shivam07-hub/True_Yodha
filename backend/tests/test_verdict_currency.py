"""Verdict Currency's read-path loader gives the keys the brain's own brief does.

`for_user` reads three profile columns instead of the whole Targeting Brief (no
CV markdown). If it ever hashed a different profile than the ranking path, every
verdict would read `foreign` on Agent Picks and Collections and nothing would fail.
"""
from __future__ import annotations

from app.services import onboarding_service
from app.services.matching import verdict_currency

_FULL = {
    "target_role_title": "Data Analyst",
    "target_role_titles": ["Data Analyst", "BI Analyst"],
    "target_seniority": "Mid",
    "target_location": "Pune",
    "target_roles": ["Analytics"],
    "deal_breakers": ["no night shifts"],
    "cv_markdown": "# A whole CV",
}


class _Repo:
    _db = None  # no memory client: both briefs carry no facts

    def get_user_profile_targeting(self, _uid):
        return dict(_FULL)

    def get_direction_columns(self, _uid):
        return {k: _FULL[k] for k in ("target_role_title", "target_seniority", "target_location")}

    def get_latest_baseline_id(self, _uid):
        return 7


def test_the_lean_read_hashes_what_the_ranking_brief_hashes() -> None:
    from app.services.matching import targeting

    full = targeting.for_ranking(_Repo(), "u1").ranking_profile()
    full["baseline_version_id"] = 7
    row = {
        "eval_context_hash": onboarding_service.eval_context_key(full),
        "target_context_hash": onboarding_service.context_key(full),
    }
    assert verdict_currency.for_user(_Repo(), "u1").of(row) == "current"


def test_no_baseline_proves_no_direction() -> None:
    """Without a CV there is no direction key, so nothing can be stale."""
    currency = verdict_currency.for_profile({**_FULL, "baseline_version_id": None})
    assert currency.of({"eval_context_hash": "x", "target_context_hash": None}) == "foreign"
