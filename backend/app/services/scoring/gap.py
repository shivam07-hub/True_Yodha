"""
gap.py
Aspiration-driven gap analysis and rank tier classification.

compute_gap_skills greedily fills a 7-day budget with high-demand,
low-effort proficiency upgrades. compute_rank_tier maps a 0–100 score
to an internal tier label (NEVER exposed via API).
"""

from app.services.scoring.formulas import _DAYS_PER_STEP, _PROFICIENCY_TITLES

# Band-relative completeness tiers. The Mirror Score is now scored against the
# candidate's seniority band (see formulas.target_level_for_seniority), so a
# tier reads as "how proven are you FOR YOUR STAGE", not an absolute rank.
# Recalibrated 2026-07 to the banded distribution (prod cutover modelled at
# min 20.7 / median 35.6 / max 64.1 — old absolute engine was capped ~31).
# Top two tiers are intentional headroom: reachable, rare at beta sparsity.
_RANK_TIERS = [
    (80, 100, "Expert"),
    (65, 79,  "Professional"),
    (50, 64,  "Specialist"),
    (35, 49,  "Practitioner"),
    (20, 34,  "Explorer"),
    (0,  19,  "Newcomer"),
]


# How much closeness may move a skill up the list.
#
# `_priority` is demand x gap, times at most (1 + this). At 0.5 a maximally
# close skill needs two thirds of a rival's demand x gap to overtake it, so
# closeness reorders the middle of the list and breaks near-ties — it cannot put
# a skill nobody hires for above one everybody does. That ceiling is the point:
# "next to what you know" is a reason to pick BETWEEN two worthwhile skills, not
# a reason to learn an unwanted one.
_CLOSENESS_LIFT = 0.5


def compute_gap_skills(
    skill_level_map: dict[str, int],
    skill_demand: dict[str, int],
    aspiration_skills: dict[str, int],
    skill_to_cluster: dict[str, str],
    max_days: int = 7,
    top_n: int = 5,
    skill_closeness: dict[str, float] | None = None,
) -> list[dict]:
    """
    Returns aspiration-driven gap items fitting within max_days.

    aspiration_skills: {skill_name: target_proficiency} derived from job postings
      for the user's target role/company. When empty, falls back to demand-based
      ordering (target = next level above current).

    skill_closeness: {skill_name: damped lift} from `skill_closeness_for` — how
      much live jobs ask for this skill ALONGSIDE the ones this person already
      has. Normalised across the candidate set here, never across the corpus: the
      question is which of THESE skills is nearest, and a corpus-wide scale would
      hand every candidate in a small market the same tiny number.

    Sorted by market_demand_weight x proficiency_gap, lifted by closeness.
    Greedily fills the 7-day budget — high-demand, low-effort skills first.
    Remaining gap deferred to week 2.

    ⚠️ **A missing closeness is not a distant skill.** The graph covers 15.1% of
    the candidates that reach the top of this list (measured 2026-09-14 over 37
    users with targets), because 55% of the skills people hold appear in fewer
    than 20 live jobs and are deliberately excluded from bonding — below that a
    "bond" is noise, not a signal. So closeness only ever LIFTS. A candidate with
    no bond keeps exactly the rank demand and gap give it, which is why passing
    no map at all reproduces the old ordering to the digit.
    """
    max_demand = max(skill_demand.values(), default=1) or 1

    # With no aspiration the targets below come from open-market demand, not
    # from any role this user chose. The copy has to say so — a pre-target user
    # was being told a skill was "required for your target role" when they had
    # not named one, which is how a YouTube Channel Manager's CV came back
    # demanding Python, ML and SQL.
    role_backed = bool(aspiration_skills)

    target_map: dict[str, int] = dict(aspiration_skills)
    if not target_map:
        # Fallback: close one step for every skill with market demand
        for skill in set(list(skill_level_map.keys()) + list(skill_demand.keys())):
            current = skill_level_map.get(skill, 0)
            if current < 5 and skill_demand.get(skill, 0) > 0:
                target_map[skill] = current + 1

    candidates: list[dict] = []
    for skill, target_level in target_map.items():
        current_level = skill_level_map.get(skill, 0)
        if current_level >= target_level:
            continue
        demand = skill_demand.get(skill, 0)
        weight = demand / max_demand
        step = (current_level, min(current_level + 1, target_level))
        days = _DAYS_PER_STEP.get(step, 1)
        candidates.append({
            "taxonomy_key":        skill,
            "skill":               skill,
            "taxonomy_l2_cluster": skill_to_cluster.get(skill, "General"),
            "current_level":       current_level,
            "target_level":        target_level,
            "gap_score":           round((5 - current_level) * weight, 3),
            "current_title":       _PROFICIENCY_TITLES.get(current_level, "None"),
            "target_title":        _PROFICIENCY_TITLES.get(target_level, "Legend"),
            "days_to_close":       days,
            "market_demand_weight": round(weight, 3),
            "job_count_30d":       demand,
            "why_it_matters":      (
                f"Required at {_PROFICIENCY_TITLES.get(target_level, 'Expert')} level "
                "for your target role."
                if role_backed
                else f"In demand right now — {demand} open roles ask for it."
            ),
            "_priority": weight * (target_level - current_level),
            "_closeness": float((skill_closeness or {}).get(skill, 0.0)),
        })

    # Normalised across THIS candidate set, so the lift means "nearest of the
    # skills actually on offer to you". Max, not sum: the scale has to survive a
    # candidate set of three as well as one of two thousand.
    top_close = max((c["_closeness"] for c in candidates), default=0.0)
    if top_close > 0:
        for item in candidates:
            item["_priority"] *= 1 + _CLOSENESS_LIFT * (item["_closeness"] / top_close)
            # Deliberately NOT emitted. Closeness is a ranking input, and a number
            # in the payload that no surface renders is the next dead field. The
            # card that would earn it is the one naming the skills this sits next
            # to ("asked for alongside React and TypeScript"), and that needs the
            # neighbour NAMES this read does not fetch — a payload change, not a
            # leftover. BACKLOG #46 S5 carries it.

    candidates.sort(key=lambda x: x["_priority"], reverse=True)

    selected: list[dict] = []
    budget = max_days
    for item in candidates:
        if budget <= 0 or len(selected) >= top_n:
            break
        days_alloc = min(item["days_to_close"], budget)
        entry = {k: v for k, v in item.items() if not k.startswith("_")}
        entry["days_allocated"] = days_alloc
        selected.append(entry)
        budget -= days_alloc

    return selected


def compute_rank_tier(score: float) -> str:
    """INTERNAL ONLY — never return via API."""
    for low, high, tier in _RANK_TIERS:
        if low <= score <= high:
            return tier
    return "Newcomer"
