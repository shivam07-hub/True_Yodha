"""
scoring_engine.py
Computes the Mirror Score from CV skill signals.

Flow:
  1. CV signals → proficiency level (P1 Scout → P5 Legend) per skill
  2. Cluster Score = cluster_coverage × (max_proficiency / 5), per Tax-L2 cluster
  3. Domain Score = mean(cluster_scores) × 100, per Tax-L1 domain (present only)
  4. Mirror Score = mean(domain_scores), 0–100
  5. Gap skills = aspiration-driven, 7-day budget, days_to_close per item
  6. Persisted to user_skills + mirror_scores + mirror_score_history

rank_tier: INTERNAL ONLY — never exposed via API.
100% test coverage: backend/tests/test_scoring.py + backend/tests/test_scoring_io.py
"""

import math
import logging
from datetime import datetime, timezone
from functools import lru_cache

from supabase import Client

logger = logging.getLogger(__name__)

_SIGNAL_LEVEL_MAP = {
    "mention":       1,   # P1 Scout       — named in skills section only
    "project":       2,   # P2 Trailblazer — used in a real project
    "impact":        3,   # P3 Excavator   — measurable metrics
    "leadership":    4,   # P4 Cartographer — led design / architecture
    "certification": 3,   # P3 Excavator   — third-party cert
}

_PROFICIENCY_TITLES: dict[int, str] = {
    0: "None",
    1: "Scout",
    2: "Trailblazer",
    3: "Excavator",
    4: "Cartographer",
    5: "Legend",
}

# Days to close a single proficiency step (current → current+1)
_DAYS_PER_STEP: dict[tuple[int, int], int] = {
    (0, 1): 1,
    (1, 2): 2,
    (2, 3): 5,
    (3, 4): 14,
    (4, 5): 30,
}

_RANK_TIERS = [
    (89, 100, "Expert"),
    (76, 88,  "Professional"),
    (61, 75,  "Specialist"),
    (41, 60,  "Practitioner"),
    (21, 40,  "Explorer"),
    (0,  20,  "Newcomer"),
]


# ── Taxonomy cluster maps ─────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _build_cluster_maps() -> tuple[dict[str, list[str]], dict[str, str], dict[str, str]]:
    """
    Builds cluster lookup tables from the Lightcast taxonomy JSON. Cached.

    Returns:
      cluster_children  — {Tax-L2 cluster: [Tax-L3 skill names...]}
      skill_to_cluster  — {skill name: cluster name}
      cluster_to_domain — {cluster name: Tax-L1 domain name}
    """
    from app.services.taxonomy_loader import get_all_skills
    cluster_children: dict[str, list[str]] = {}
    skill_to_cluster: dict[str, str] = {}
    cluster_to_domain: dict[str, str] = {}
    for skill in get_all_skills():
        cluster = skill.l2_cluster or "General"
        domain = skill.l1_domain or "General"
        cluster_children.setdefault(cluster, []).append(skill.name)
        skill_to_cluster[skill.name] = cluster
        cluster_to_domain[cluster] = domain
    return cluster_children, skill_to_cluster, cluster_to_domain


# ── Proficiency inference (signals → level) ───────────────────────────────────

def infer_level_from_signals(signals: list[dict]) -> int:
    """
    Returns proficiency level 0–5 from a skill's CV signals.

    Signal types → base level:
      mention / project / impact / leadership / certification (see _SIGNAL_LEVEL_MAP)
      years_experience → no base level, XP only

    Highest base level wins. Total XP ≥ 1000 boosts one level (depth evidence).
    """
    if not signals:
        return 0
    level = max(_SIGNAL_LEVEL_MAP.get(s["signal_type"], 0) for s in signals)
    total_xp = sum(s["xp_awarded"] for s in signals)
    if total_xp >= 1000 and level < 5:
        level += 1
    return min(level, 5)


def build_skill_level_map(skills_detected: list[dict]) -> dict[str, int]:
    """Groups signals by taxonomy_key → {taxonomy_key: inferred_level}."""
    grouped: dict[str, list[dict]] = {}
    for signal in skills_detected:
        grouped.setdefault(signal["taxonomy_key"], []).append(signal)
    return {key: infer_level_from_signals(sigs) for key, sigs in grouped.items()}


# ── Score formulas ────────────────────────────────────────────────────────────

def compute_cluster_scores(
    skill_level_map: dict[str, int],
    cluster_children: dict[str, list[str]],
    skill_to_cluster: dict[str, str],
) -> dict[str, float]:
    """
    Returns {cluster_name: cluster_score} for clusters the user has ≥1 skill in.
    cluster_score = cluster_coverage × (max_proficiency / 5)

    Rewards users who are broad AND deep within a sub-skill cluster, not just
    those who name-dropped many skills.
    """
    user_by_cluster: dict[str, list[int]] = {}
    for skill, level in skill_level_map.items():
        cluster = skill_to_cluster.get(skill)
        if cluster:
            user_by_cluster.setdefault(cluster, []).append(level)

    result: dict[str, float] = {}
    for cluster, levels in user_by_cluster.items():
        total = len(cluster_children.get(cluster, []))
        if total == 0:
            continue
        # log1p scaling: 1 skill in a 362-skill cluster → 0.14 credit, not 0.003.
        # Proficiency floor (0.3) ensures having any skill in a domain counts.
        coverage_score = math.log1p(len(levels)) / math.log1p(total)
        max_prof = max(levels) / 5
        result[cluster] = round(max_prof * (0.3 + 0.7 * coverage_score), 4)
    return result


def compute_domain_scores(
    cluster_scores: dict[str, float],
    cluster_to_domain: dict[str, str],
    cluster_skill_counts: dict[str, int] | None = None,
) -> dict[str, float]:
    """
    Domain score = skill-count-weighted mean(cluster_scores) × breadth_bonus × 100.

    cluster_skill_counts: {cluster: n_user_skills} — when provided, clusters with more
    skills get higher weight AND the total skill count drives a log breadth bonus.
    A domain with 7 skills at P2 scores higher than a domain with 2 skills at P2.
    """
    counts = cluster_skill_counts or {}
    by_domain: dict[str, list[tuple[float, int]]] = {}
    for cluster, score in cluster_scores.items():
        domain = cluster_to_domain.get(cluster, "General")
        n = counts.get(cluster, 1)
        by_domain.setdefault(domain, []).append((score, n))

    result: dict[str, float] = {}
    for domain, pairs in by_domain.items():
        total_n = sum(c for _, c in pairs)
        weighted_score = sum(s * c for s, c in pairs) / total_n
        # log1p(total_n - 1): 0 for 1 skill, scales to 1.0 at 20 skills
        breadth = math.log1p(total_n - 1) / math.log1p(19)
        domain_score = weighted_score * (1.0 + 0.5 * min(breadth, 1.0))
        result[domain] = round(domain_score * 100, 1)
    return result


def compute_mirror_score(domain_scores: dict[str, float]) -> float:
    """Mirror Score = mean of domain scores. 0–100."""
    if not domain_scores:
        return 0.0
    return round(sum(domain_scores.values()) / len(domain_scores), 1)


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


# ── Supabase I/O ──────────────────────────────────────────────────────────────

def fetch_aspiration_skills(db: Client, target_roles: list[str]) -> dict[str, int]:
    """
    Builds {skill_name: target_proficiency} from jobs matching any of the target roles.

    Proficiency targets derived from skill frequency across matching jobs:
      - main_skill appearing in >50% of role jobs → target L4
      - main_skill appearing in >25%              → target L3
      - side_skill (any frequency)                → target L2

    Returns empty dict if no matching jobs found (caller falls back to market demand).
    """
    if not target_roles:
        return {}

    all_rows: list[dict] = []
    for role in target_roles:
        pattern = f"%{role}%"
        try:
            page1 = db.table("jobs").select("main_skills, side_skills").ilike("job_title", pattern).limit(100).execute().data
        except Exception as exc:
            logger.warning("Aspiration skill lookup failed for role %r: %s", role, exc)
            continue
        all_rows.extend(page1 or [])

    if not all_rows:
        return {}

    total = len(all_rows)
    main_counts: dict[str, int] = {}
    side_set:    set[str]       = set()

    for row in all_rows:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                main_counts[s.strip()] = main_counts.get(s.strip(), 0) + 1
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                side_set.add(s.strip())

    aspiration: dict[str, int] = {}
    for skill, count in main_counts.items():
        freq = count / total
        aspiration[skill] = 4 if freq > 0.5 else 3
    for skill in side_set:
        if skill not in aspiration:
            aspiration[skill] = 2

    return aspiration


def fetch_skill_demand(db: Client) -> dict[str, int]:
    """
    Returns {skill_name: job_count} by counting occurrences across
    jobs.main_skills and jobs.side_skills. Source of truth: public.jobs table.
    main_skills weighted ×2 to reflect must-have vs nice-to-have distinction.
    """
    try:
        page1 = db.table("jobs").select("main_skills, side_skills").range(0, 999).execute().data
        page2 = db.table("jobs").select("main_skills, side_skills").range(1000, 9999).execute().data
    except Exception as exc:
        logger.warning("Market skill demand lookup failed: %s", exc)
        return {}
    counts: dict[str, int] = {}
    for row in (page1 or []) + (page2 or []):
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 2
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 1
    return counts


def persist_user_skills(
    db: Client,
    user_id: str,
    skill_level_map: dict[str, int],
    signals: list[dict],
) -> int:
    """Upsert one row per detected skill into user_skills. Returns count written."""
    from app.services.taxonomy_loader import ensure_skill_in_db

    evidence_map: dict[str, str] = {}
    for s in signals:
        evidence_map.setdefault(s["taxonomy_key"], s["evidence"])

    rows = []
    for key, level in skill_level_map.items():
        skill_id = ensure_skill_in_db(db, key)
        if skill_id is None:
            continue
        rows.append({
            "user_id":         user_id,
            "skill_id":        skill_id,
            "matched_level":   level,
            "proficiency_title": _PROFICIENCY_TITLES.get(level, "Scout"),
            "source":          "cv",
            "evidence_text":   evidence_map.get(key, ""),
            "last_updated":    datetime.now(timezone.utc).isoformat(),
        })

    if rows:
        db.table("user_skills").upsert(rows, on_conflict="user_id,skill_id").execute()
    return len(rows)


def persist_score(
    db: Client,
    user_id: str,
    total_score: float,
    domain_scores: dict[str, float],
    gap_skills: list[dict],
    skills_assessed: int,
    rank_tier: str,
) -> dict:
    """Write to mirror_scores (upsert) and append to mirror_score_history."""
    payload = {
        "total_score":     total_score,
        "domain_scores":   domain_scores,
        "skill_scores":    {},
        "gap_skills":      gap_skills,
        "rank_tier":       rank_tier,
        "skills_assessed": skills_assessed,
    }
    existing = (
        db.table("mirror_scores")
        .select("user_id").eq("user_id", user_id).maybe_single().execute()
    )
    if existing and existing.data:
        db.table("mirror_scores").update(payload).eq("user_id", user_id).execute()
    else:
        db.table("mirror_scores").insert({"user_id": user_id, **payload}).execute()

    db.table("mirror_score_history").insert({
        "user_id":     user_id,
        "total_score": total_score,
    }).execute()

    result = db.table("mirror_scores").select("*").eq("user_id", user_id).single().execute()
    return result.data


# ── Main entry point ──────────────────────────────────────────────────────────

def compute_and_persist_score(
    db: Client,
    user_id: str,
    skills_detected: list[dict] | None = None,
    aspiration_skills: dict[str, int] | None = None,
    skill_level_map: dict[str, int] | None = None,
    include_market_signals: bool = True,
) -> dict:
    """
    Full scoring pipeline. Two calling modes:
      - CV upload: pass skills_detected (raw signals). Infers levels, writes user_skills.
      - Recompute: pass skill_level_map (stored matched_level values). Skips signal
        inference and does NOT overwrite user_skills — preserves original proficiency
        levels and evidence text.
    """
    if skill_level_map is None:
        skill_level_map = build_skill_level_map(skills_detected or [])

    cluster_children, skill_to_cluster, cluster_to_domain = _build_cluster_maps()
    skill_demand = fetch_skill_demand(db) if include_market_signals else {}

    cluster_scores = compute_cluster_scores(skill_level_map, cluster_children, skill_to_cluster)
    cluster_skill_counts = {
        cluster: sum(1 for s in skill_level_map if skill_to_cluster.get(s) == cluster)
        for cluster in cluster_scores
    }
    domain_scores = compute_domain_scores(cluster_scores, cluster_to_domain, cluster_skill_counts)
    total_score = compute_mirror_score(domain_scores)

    gap_skills = compute_gap_skills(
        skill_level_map, skill_demand,
        aspiration_skills or {},
        skill_to_cluster,
    )
    rank_tier = compute_rank_tier(total_score)

    if skills_detected is not None:
        skills_count = persist_user_skills(db, user_id, skill_level_map, skills_detected)
    else:
        skills_count = len(skill_level_map)

    return persist_score(
        db, user_id, total_score, domain_scores, gap_skills, skills_count, rank_tier
    )
