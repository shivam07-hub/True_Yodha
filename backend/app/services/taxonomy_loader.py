"""
taxonomy_loader.py
Runtime Lightcast skills taxonomy loader.

Loads lightcast_skills_taxonomy.json (35,108 skills) as the single source of truth.
All taxonomy lookups, CV parsing, diary processing, and job matching use this module.

Key functions:
  get_all_skills()        → all LightcastSkill records
  lookup_by_name(name)    → find skill by name (case-insensitive)
  get_market_skills(db)   → unique skill names found in the jobs table (cached)
  ensure_skill_in_db(db, name) → insert Lightcast skill into skills table if missing
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from supabase import Client

TAXONOMY_FILE = Path(__file__).resolve().parents[3] / "lightcast_skills_taxonomy.json"

# Lightcast top-level category → (domain_id, family_id) in our DB
# domain_id: 1=SD, 2=DE, 3=DSA, 4=AML, 5=CDO, 6=CS, 7=QAT, 8=EA, 9=PPM, 10=UX
CATEGORY_TO_DOMAIN_FAMILY: dict[str, tuple[int, int]] = {
    "Information Technology":               (1, 18),
    "Analysis":                             (3, 10),
    "Design":                               (10, 21),
    "Engineering":                          (1, 18),
    "Finance":                              (3, 10),
    "Science and Research":                 (4, 1),
    "Energy and Utilities":                 (5, 3),
    "Law, Regulation, and Compliance":      (6, 5),
    "Media and Communications":             (10, 21),
}
_DEFAULT_DOMAIN_FAMILY = (9, 14)  # PPM – Delivery Management


class LightcastSkill(NamedTuple):
    id: str
    name: str
    category: str
    subcategory: str


@lru_cache(maxsize=1)
def get_all_skills() -> list[LightcastSkill]:
    """Load and flatten the Lightcast taxonomy. Cached after first call (~4 MB file)."""
    with open(TAXONOMY_FILE, encoding="utf-8") as f:
        data = json.load(f)

    skills: list[LightcastSkill] = []

    def _walk(node: dict, category: str | None = None, subcategory: str | None = None) -> None:
        if "id" in node:
            skills.append(LightcastSkill(node["id"], node["name"], category or "", subcategory or ""))
        for child in node.get("children", []):
            if category is None:
                _walk(child, child["name"])
            elif subcategory is None:
                _walk(child, category, child["name"])
            else:
                _walk(child, category, subcategory)

    _walk(data)
    return skills


@lru_cache(maxsize=1)
def _name_index() -> dict[str, LightcastSkill]:
    return {s.name.lower(): s for s in get_all_skills()}


def lookup_by_name(name: str) -> LightcastSkill | None:
    return _name_index().get(name.lower())


def get_domain_family(category: str) -> tuple[int, int]:
    return CATEGORY_TO_DOMAIN_FAMILY.get(category, _DEFAULT_DOMAIN_FAMILY)


# ── Market skills (unique skills seen in the jobs table) ──────────────────────

_market_skills_cache: list[str] | None = None


def get_market_skills(db: Client) -> list[str]:
    """
    Returns sorted list of unique skill names seen across all jobs.
    Used as the scoring denominator — market-relevant skills only.
    Cached after first call (queries 1,783 jobs once).
    """
    global _market_skills_cache
    if _market_skills_cache is not None:
        return _market_skills_cache

    names: set[str] = set()
    page1 = db.table("jobs").select("main_skills, side_skills").range(0, 999).execute().data
    page2 = db.table("jobs").select("main_skills, side_skills").range(1000, 9999).execute().data
    for row in page1 + page2:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                names.add(s.strip())
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                names.add(s.strip())

    _market_skills_cache = sorted(names)
    return _market_skills_cache


# ── DB sync ───────────────────────────────────────────────────────────────────

def ensure_skill_in_db(db: Client, skill_name: str) -> int | None:
    """
    Ensures a Lightcast skill exists in the DB `skills` table.
    Inserts it with the appropriate domain/family mapping if missing.
    Returns the skills.id, or None on failure.
    """
    existing = db.table("skills").select("id").eq("taxonomy_key", skill_name).maybe_single().execute()
    if existing and existing.data:
        return existing.data["id"]

    lc = lookup_by_name(skill_name)
    domain_id, family_id = get_domain_family(lc.category if lc else "")

    try:
        result = db.table("skills").insert({
            "taxonomy_key": skill_name,
            "display_name": skill_name,
            "domain_id": domain_id,
            "family_id": family_id,
            "is_active": True,
            "sort_order": 9999,
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception:
        return None
