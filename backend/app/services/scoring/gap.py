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


def compute_gap_skills(
    skill_level_map: dict[str, int],
    skill_demand: dict[str, int],
    aspiration_skills: dict[str, int],
    skill_to_cluster: dict[str, str],
    max_days: int = 7,
    top_n: int = 5,
) -> list[dict]:
    """
    Returns aspiration-driven gap items fitting within max_days.

    aspiration_skills: {skill_name: target_proficiency} derived from job postings
      for the user's target role/company. When empty, falls back to demand-based
      ordering (target = next level above current).

    Sorted by market_demand_weight × proficiency_gap. Greedily fills the 7-day
    budget — high-demand, low-effort skills first. Remaining gap deferred to week 2.
    """
    max_demand = max(skill_demand.values(), default=1) or 1

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
            ),
            "_priority": weight * (target_level - current_level),
        })

    candidates.sort(key=lambda x: x["_priority"], reverse=True)

    selected: list[dict] = []
    budget = max_days
    for item in candidates:
        if budget <= 0 or len(selected) >= top_n:
            break
        days_alloc = min(item["days_to_close"], budget)
        entry = {k: v for k, v in item.items() if k != "_priority"}
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
