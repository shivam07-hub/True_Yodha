"""What the gate knows about a person — one shape, from an account or a fixture.

Loading from a real account is how an audit runs ("why did this user see that?").
Loading from a fixture is how the gate runs in CI, where a persona's shape is
committed and its account is marked `is_test_account`.

Years of experience is a REQUIRED input, never inferred. An employer's "3+
years" is compared against professional years in the craft, and nothing in the
account holds that: the seniority band is coarser (`mid` admits entry AND mid),
and the CV's date span is worse than useless — on the CV that started this work
it reads 2011 to 2026, fifteen years, for someone with 3.2 years of engineering
either side of a seven-year gap running a business. A yardstick built on that
number would grade production against a fiction. So the caller states it, and a
persona fixture commits it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Soft skills carry no signal about WHICH job — everyone's CV has them and every
# JD asks for them. Excluded from overlap so "Leadership" cannot make a
# contact-centre role look like a backend match. `skills.skill_kind` is the
# source; this list is the fallback for rows the taxonomy left untyped.
_ALWAYS_SOFT = frozenset({
    "leadership", "time management", "communication", "collaboration",
    "teamwork", "problem solving", "adaptability", "work ethic",
})

@dataclass(frozen=True)
class CandidateProfile:
    """One person, as the yardstick needs them."""

    label: str
    skill_names: frozenset[str]
    """Lowercased HARD skill names, matched against a job's `main_skills`."""

    years_experience: float
    """Professional years in the target craft — not calendar years since school."""

    direction_families: frozenset[str]
    """`jobs.role_family` values the person chose."""

    role_keywords: tuple[str, ...]
    """Words that make a title relevant when the family misses it — the reason a
    hand search finds "Payments Planning Developer" that no family contains."""

    countries: frozenset[str] = frozenset()
    exclude_title_words: tuple[str, ...] = (
        "intern", "trainee", "graduate", "campus", "fresher",
        "phd", "early career", "apprentice",
    )
    notes: dict[str, Any] = field(default_factory=dict)

    def overlap(self, main_skills: list[str] | None) -> int:
        """How many of this person's hard skills the listing actually names."""
        if not main_skills:
            return 0
        named = {s.strip().lower() for s in main_skills if s and s.strip()}
        return len(named & self.skill_names)


def from_account(
    db: Any, user_id: str, *, years_experience: float, label: str | None = None
) -> CandidateProfile:
    """Build a profile from a live account. Used for audits, not for CI.

    `years_experience` is stated by the caller — see the module docstring for
    why it cannot be read off the account.
    """
    profile_rows = (
        db.table("user_profiles")
        .select("full_name, target_role_titles, target_role_title, target_seniority, "
                "target_location_countries")
        .eq("id", user_id)
        .limit(1)
        .execute()
    ).data or []
    profile = profile_rows[0] if profile_rows else {}

    skill_rows = (
        db.table("user_skills")
        .select("skills(display_name, skill_kind)")
        .eq("user_id", user_id)
        .execute()
    ).data or []
    names: set[str] = set()
    for row in skill_rows:
        skill = row.get("skills") or {}
        name = (skill.get("display_name") or "").strip().lower()
        if not name or name in _ALWAYS_SOFT:
            continue
        if (skill.get("skill_kind") or "").lower() == "soft":
            continue
        names.add(name)

    families = [f for f in (profile.get("target_role_titles") or []) if f]
    if not families and profile.get("target_role_title"):
        families = [profile["target_role_title"]]

    return CandidateProfile(
        label=label or (profile.get("full_name") or user_id),
        skill_names=frozenset(names),
        years_experience=years_experience,
        direction_families=frozenset(families),
        role_keywords=(),
        countries=frozenset(profile.get("target_location_countries") or []),
        notes={"user_id": user_id, "band": profile.get("target_seniority")},
    )
