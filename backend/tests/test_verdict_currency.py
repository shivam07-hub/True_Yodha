"""Verdict Currency's read-path loader gives the keys the brain's own brief does.

`list_profile` reads a few profile columns instead of the whole Targeting Brief (no
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
    "target_locations": ["Pune", "Bengaluru"],
    "target_location_country": "India",
    "target_location_countries": ["India"],
    "years_experience": 3,
    "target_roles": ["Analytics"],
    "deal_breakers": ["no night shifts"],
    "cv_markdown": "# A whole CV",
}


class _Repo:
    _db = None  # no memory client: both briefs carry no facts

    def get_user_profile_targeting(self, _uid):
        return dict(_FULL)

    def get_list_columns(self, _uid):
        # Exactly what `JobsRepository.get_list_columns` selects.
        return {k: _FULL[k] for k in (
            "target_role_title", "target_role_titles", "target_roles", "target_seniority",
            "target_location", "target_locations", "target_location_country",
            "target_location_countries", "years_experience",
        )}

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
    assert verdict_currency.for_profile(verdict_currency.list_profile(_Repo(), "u1")).of(row) == "current"


def test_the_lean_read_names_the_same_direction() -> None:
    """The Return door asks `direction.of` of the lean brief. Without the two
    direction columns it read every person as having none (caught 2026-10-13 in
    a dry run over prod, before it shipped)."""
    from app.services import direction
    from app.services.matching import targeting

    lean = targeting.for_currency(_Repo(), "u1").ranking_profile()
    full = targeting.for_ranking(_Repo(), "u1").ranking_profile()
    assert direction.of(lean).families == direction.of(full).families != ()


def test_no_baseline_proves_no_direction() -> None:
    """Without a CV there is no direction key, so nothing can be stale."""
    currency = verdict_currency.for_profile({**_FULL, "baseline_version_id": None})
    assert currency.of({"eval_context_hash": "x", "target_context_hash": None}) == "foreign"


def test_the_lean_read_admits_what_the_ranking_brief_admits() -> None:
    """Agent Picks and Collections ask Admission with the lean profile; it must
    bar exactly what the /market list bars."""
    from app.services.matching import admission, targeting

    lean = verdict_currency.list_profile(_Repo(), "u1")
    full = targeting.for_ranking(_Repo(), "u1").ranking_profile()
    jobs = [
        {"is_active": True, "location_city": "Bengaluru", "location_country": "India"},
        {"is_active": True, "location_city": "Chennai", "location_country": "India"},
        {"is_active": True, "location_city": "Pune", "location_country": "India", "min_years_experience": 9},
    ]
    verdicts = [admission.admit(lean, job).barred_by for job in jobs]
    assert verdicts == [admission.admit(full, job).barred_by for job in jobs]
    assert verdicts == [None, "location", "level"]
