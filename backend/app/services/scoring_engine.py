"""
scoring_engine.py
Computes the Mirror Score from a user's skill signals.

Flow:
  1. XP signals (from CV parser or diary) → inferred skill level per taxonomy key
  2. Mirror Score = (Σ normalised_skill_score across all 63 skills) / 63 × 100
  3. Domain scores = average normalised score per domain
  4. Gap skills = top 5 by (5 - level) × market_demand_weight
  5. Results written to user_skills + mirror_scores + mirror_score_history

Never expose rank_tier or percentile via API — computed internally only.
100% test coverage required: backend/tests/test_scoring.py
"""

from datetime import datetime, timezone

from supabase import Client

# XP thresholds → inferred skill level
# Based on signal type accumulation (not raw XP sum — highest signal wins)
_SIGNAL_LEVEL_MAP = {
    "mention":    1,   # L1 Foundation
    "project":    2,   # L2 Practitioner
    "impact":     3,   # L3 Professional
    "leadership": 4,   # L4 Expert
}

_RANK_TIERS = [
    (89, 100, "Expert"),
    (76, 88,  "Professional"),
    (61, 75,  "Specialist"),
    (41, 60,  "Practitioner"),
    (21, 40,  "Explorer"),
    (0,  20,  "Newcomer"),
]


# ── XP → Level ────────────────────────────────────────────────────────────────

def infer_level_from_signals(signals: list[dict]) -> int:
    """
    Returns inferred level (0–5) for a single taxonomy key from its signals.
    Highest signal type wins; XP accumulation can boost one level further.
    """
    if not signals:
        return 0

    level = max(_SIGNAL_LEVEL_MAP.get(s["signal_type"], 0) for s in signals)
    total_xp = sum(s["xp_awarded"] for s in signals)

    # Boost one level if XP is high enough (evidence of depth, not just breadth)
    if total_xp >= 1000 and level < 5:
        level += 1

    return min(level, 5)


def build_skill_level_map(skills_detected: list[dict]) -> dict[str, int]:
    """
    Groups signals by taxonomy_key and returns {taxonomy_key: inferred_level}.
    """
    grouped: dict[str, list[dict]] = {}
    for signal in skills_detected:
        key = signal["taxonomy_key"]
        grouped.setdefault(key, []).append(signal)
    return {key: infer_level_from_signals(sigs) for key, sigs in grouped.items()}


# ── Score formulas ────────────────────────────────────────────────────────────

def compute_mirror_score(skill_level_map: dict[str, int], all_taxonomy_keys: list[str]) -> float:
    """Mirror Score = (Σ normalised_skill_score) / total_skills × 100"""
    total = sum(
        min(skill_level_map.get(key, 0), 5) / 5 * 100
        for key in all_taxonomy_keys
    )
    return round(total / len(all_taxonomy_keys), 1) if all_taxonomy_keys else 0.0


def compute_domain_scores(
    skill_level_map: dict[str, int],
    skills_by_domain: dict[str, list[str]],
) -> dict[str, float]:
    """Domain score = average normalised score for all skills in that domain."""
    result = {}
    for domain_code, keys in skills_by_domain.items():
        if not keys:
            continue
        avg = sum(min(skill_level_map.get(k, 0), 5) / 5 * 100 for k in keys) / len(keys)
        result[domain_code] = round(avg, 1)
    return result


def compute_gap_skills(
    skill_level_map: dict[str, int],
    skill_demand: dict[str, int],
    skill_display: dict[str, str],
    top_n: int = 5,
) -> list[dict]:
    """
    gap_score = (5 - level) × market_demand_weight
    market_demand_weight = job_count_30d normalised 0–1 across all skills
    """
    max_demand = max(skill_demand.values(), default=1) or 1
    gaps = []
    for key, level in skill_level_map.items():
        if level >= 5:
            continue
        demand = skill_demand.get(key, 0)
        weight = demand / max_demand
        gap_score = (5 - level) * weight
        if gap_score > 0:
            gaps.append({
                "taxonomy_key": key,
                "skill": skill_display.get(key, key),
                "current_level": level,
                "target_level": min(level + 1, 5),
                "gap_score": round(gap_score, 3),
                "job_count_30d": demand,
                "why_it_matters": f"Required in {demand} jobs in the last 30 days.",
            })

    # Also include undetected skills with high demand
    for key, demand in skill_demand.items():
        if key not in skill_level_map and demand > 0:
            weight = demand / max_demand
            gaps.append({
                "taxonomy_key": key,
                "skill": skill_display.get(key, key),
                "current_level": 0,
                "target_level": 1,
                "gap_score": round(5 * weight, 3),
                "job_count_30d": demand,
                "why_it_matters": f"Required in {demand} jobs in the last 30 days.",
            })

    gaps.sort(key=lambda x: x["gap_score"], reverse=True)
    return gaps[:top_n]


def compute_rank_tier(score: float) -> str:
    """INTERNAL ONLY — never return via API."""
    for low, high, tier in _RANK_TIERS:
        if low <= score <= high:
            return tier
    return "Newcomer"


# ── Supabase read helpers ─────────────────────────────────────────────────────

def fetch_taxonomy(db: Client) -> tuple[list[str], dict[str, list[str]], dict[str, str]]:
    """
    Returns:
      all_keys: all taxonomy keys
      by_domain: {domain_code: [taxonomy_key, ...]}
      display: {taxonomy_key: display_name}
    """
    result = db.table("skills").select(
        "taxonomy_key, display_name, skill_domains(code)"
    ).eq("is_active", True).execute()

    all_keys, by_domain, display = [], {}, {}
    for row in result.data:
        key = row["taxonomy_key"]
        domain = row.get("skill_domains", {}).get("code", "UNKNOWN")
        all_keys.append(key)
        by_domain.setdefault(domain, []).append(key)
        display[key] = row["display_name"]
    return all_keys, by_domain, display


def fetch_skill_demand(db: Client) -> dict[str, int]:
    """Returns {taxonomy_key: job_count_30d} from latest demand snapshot."""
    result = db.table("skill_demand_snapshots").select(
        "skill_id, job_count_30d, skills(taxonomy_key)"
    ).order("snapshot_date", desc=True).limit(63).execute()
    return {
        row["skills"]["taxonomy_key"]: row["job_count_30d"]
        for row in result.data
        if row.get("skills")
    }


# ── Persist results ───────────────────────────────────────────────────────────

def persist_user_skills(db: Client, user_id: str, skill_level_map: dict[str, int], signals: list[dict]) -> int:
    """Upsert one row per detected skill into user_skills. Returns count."""
    evidence_map: dict[str, str] = {}
    for s in signals:
        key = s["taxonomy_key"]
        if key not in evidence_map:
            evidence_map[key] = s["evidence"]

    skill_id_result = db.table("skills").select("id, taxonomy_key").execute()
    skill_id_map = {row["taxonomy_key"]: row["id"] for row in skill_id_result.data}

    rows = [
        {
            "user_id": user_id,
            "skill_id": skill_id_map[key],
            "matched_level": level,
            "source": "cv",
            "evidence_text": evidence_map.get(key, ""),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
        for key, level in skill_level_map.items()
        if key in skill_id_map
    ]
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
    row = {
        "user_id": user_id,
        "total_score": total_score,
        "domain_scores": domain_scores,
        "skill_scores": {},
        "gap_skills": gap_skills,
        "rank_tier": rank_tier,
        "skills_assessed": skills_assessed,
    }
    result = db.table("mirror_scores").upsert(row, on_conflict="user_id").execute()

    db.table("mirror_score_history").insert({
        "user_id": user_id,
        "total_score": total_score,
    }).execute()

    return result.data[0] if result.data else row


# ── Main entry point ──────────────────────────────────────────────────────────

def compute_and_persist_score(
    db: Client,
    user_id: str,
    skills_detected: list[dict],
) -> dict:
    """
    Full scoring pipeline. Called after CV upload or diary entry.
    Returns the mirror_scores row (without rank_tier — stripped before API response).
    """
    skill_level_map = build_skill_level_map(skills_detected)
    all_keys, by_domain, display = fetch_taxonomy(db)
    skill_demand = fetch_skill_demand(db)

    total_score = compute_mirror_score(skill_level_map, all_keys)
    domain_scores = compute_domain_scores(skill_level_map, by_domain)
    gap_skills = compute_gap_skills(skill_level_map, skill_demand, display)
    rank_tier = compute_rank_tier(total_score)

    skills_count = persist_user_skills(db, user_id, skill_level_map, skills_detected)
    score_row = persist_score(
        db, user_id, total_score, domain_scores, gap_skills, skills_count, rank_tier
    )

    return score_row
