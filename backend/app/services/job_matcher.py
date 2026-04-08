"""
job_matcher.py
Skill-overlap scoring: finds the top N job postings that best match a user's skill profile.

Overlap formula (0–100):
  For each required skill in a job:
    - primary skill, user meets level: full credit
    - primary skill, user below required level: partial credit (user_level / required_level)
    - missing skill: 0
  Secondary skills count at half the weight of primary.
  Score = weighted_sum / max_possible × 100

Returns top N jobs sorted by overlap_score descending.
"""

import json
from supabase import Client

PRIMARY_WEIGHT = 2.0
SECONDARY_WEIGHT = 1.0
FETCH_LIMIT = 10_000  # PostgREST hard cap; enough for our job corpus


# ── Taxonomy helpers ──────────────────────────────────────────────────────────

def fetch_skill_id_map(db: Client) -> dict[int, str]:
    """Returns {skill_id: taxonomy_key} for all active skills."""
    result = db.table("skills").select("id, taxonomy_key").eq("is_active", True).execute()
    return {row["id"]: row["taxonomy_key"] for row in result.data}


def fetch_skill_display_map(db: Client) -> dict[str, str]:
    """Returns {taxonomy_key: display_name}."""
    result = db.table("skills").select("taxonomy_key, display_name").eq("is_active", True).execute()
    return {row["taxonomy_key"]: row["display_name"] for row in result.data}


# ── Overlap computation ───────────────────────────────────────────────────────

def _match_credit(user_level: int, required_level: int) -> float:
    """Partial credit: 1.0 if user meets or exceeds required, fractional otherwise."""
    if required_level <= 0:
        return 1.0
    return min(user_level, required_level) / required_level


def compute_overlap_score(
    user_skill_map: dict[str, int],
    primary_skills: list[dict],
    secondary_skills: list[dict],
    id_to_key: dict[int, str],
) -> float:
    """
    Returns 0–100 overlap score.
    primary_skills / secondary_skills: [{"skill_id": int, "required_level": int}]
    """
    primary_sum = sum(
        _match_credit(
            user_skill_map.get(id_to_key.get(s["skill_id"], ""), 0),
            s.get("required_level", 1),
        )
        for s in primary_skills
        if s.get("skill_id") in id_to_key
    )
    secondary_sum = sum(
        _match_credit(
            user_skill_map.get(id_to_key.get(s["skill_id"], ""), 0),
            s.get("required_level", 1),
        )
        for s in secondary_skills
        if s.get("skill_id") in id_to_key
    )

    max_possible = PRIMARY_WEIGHT * len(primary_skills) + SECONDARY_WEIGHT * len(secondary_skills)
    if max_possible == 0:
        return 0.0

    raw = (PRIMARY_WEIGHT * primary_sum + SECONDARY_WEIGHT * secondary_sum) / max_possible
    return round(raw * 100, 1)


def _parse_skills_json(value: object) -> list[dict]:
    """Safely parse primary_skills / secondary_skills from DB (may be str or list)."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, ValueError):
            return []
    return []


# ── Main query ────────────────────────────────────────────────────────────────

def get_top_matches(
    db: Client,
    user_skill_map: dict[str, int],
    top_n: int = 10,
) -> list[dict]:
    """
    Fetch all active job postings, score each by skill overlap with the user,
    return top N sorted by overlap_score descending.

    Each result dict:
      job_id, title, company, location, remote, source_url,
      overlap_score, primary_skills_raw, secondary_skills_raw
    """
    id_to_key = fetch_skill_id_map(db)

    result = (
        db.table("job_postings")
        .select("id, title, company, location, remote, source_url, primary_skills, secondary_skills, description")
        .eq("is_active", True)
        .limit(FETCH_LIMIT)
        .execute()
    )

    scored: list[dict] = []
    for row in result.data:
        primary = _parse_skills_json(row.get("primary_skills"))
        secondary = _parse_skills_json(row.get("secondary_skills"))
        score = compute_overlap_score(user_skill_map, primary, secondary, id_to_key)
        scored.append({
            "job_id": row["id"],
            "title": row["title"],
            "company": row.get("company"),
            "location": row.get("location"),
            "remote": row.get("remote", False),
            "source_url": row.get("source_url"),
            "description": (row.get("description") or "")[:1500],
            "overlap_score": score,
        })

    scored.sort(key=lambda x: x["overlap_score"], reverse=True)
    return scored[:top_n]
