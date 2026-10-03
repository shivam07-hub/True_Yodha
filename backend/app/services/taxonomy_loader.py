"""
taxonomy_loader.py
Runtime Lightcast skills taxonomy loader.

Loads lightcast_skills_taxonomy.json (35,108 skills) as the single source of truth.
Taxonomy is a 3-level tree:
  L1 category    — e.g. "Information Technology"  (31 nodes)
  L2 subcategory — e.g. "Software Development"    (442 nodes)
  L3 skill       — e.g. "Python (Programming Language)"  (35,108 leaf nodes with Lightcast IDs)

Key functions:
  get_all_skills()          → all LightcastSkill records
  lookup_by_name(name)      → find skill by name (case-insensitive)
  get_market_skills(db)     → unique skill names found in the jobs table (cached)
  ensure_skill_in_db(db, name) → upsert Lightcast skill into skills table
"""

import json
from functools import lru_cache
from pathlib import Path

from supabase import Client

from app.repositories.job_skills_read_model import fetch_job_skill_rows

TAXONOMY_FILE = Path(__file__).resolve().parents[2] / "lightcast_skills_taxonomy.json"


class LightcastSkill:
    __slots__ = ("id", "name", "l1_domain", "l2_cluster")

    def __init__(self, id: str, name: str, l1_domain: str, l2_cluster: str) -> None:
        self.id = id
        self.name = name
        self.l1_domain = l1_domain
        self.l2_cluster = l2_cluster


@lru_cache(maxsize=1)
def get_all_skills() -> list[LightcastSkill]:
    """Load and flatten the Lightcast taxonomy. Cached after first call (~4 MB file)."""
    with open(TAXONOMY_FILE, encoding="utf-8") as f:
        data = json.load(f)

    skills: list[LightcastSkill] = []

    def _walk(node: dict, l1_domain: str | None = None, l2_cluster: str | None = None) -> None:
        if "id" in node and node["id"]:
            skills.append(LightcastSkill(node["id"], node["name"], l1_domain or "", l2_cluster or ""))
        for child in node.get("children", []):
            if l1_domain is None:
                _walk(child, child["name"])
            elif l2_cluster is None:
                _walk(child, l1_domain, child["name"])
            else:
                _walk(child, l1_domain, l2_cluster)

    _walk(data)
    return skills


@lru_cache(maxsize=1)
def _name_index() -> dict[str, LightcastSkill]:
    return {s.name.lower(): s for s in get_all_skills()}


def lookup_by_name(name: str) -> LightcastSkill | None:
    return _name_index().get(name.lower())


# ── Market skills (unique skills seen in the jobs table) ──────────────────────

_market_skills_cache: list[str] | None = None


def get_market_skills(db: Client) -> list[str]:
    """
    Returns sorted list of unique taxonomy skill names seen across all jobs.
    Sources from job_skills JOIN skills (FK-enforced) rather than raw TEXT arrays.
    Cached after first call.
    """
    global _market_skills_cache
    if _market_skills_cache is not None:
        return _market_skills_cache

    names: set[str] = set()
    skill_rows = fetch_job_skill_rows(db, columns="skills(taxonomy_key)")
    for row in skill_rows:
        key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
        if key:
            names.add(key)

    _market_skills_cache = sorted(names)
    return _market_skills_cache


# ── DB sync ───────────────────────────────────────────────────────────────────

_ENSURE_CHUNK = 100  # taxonomy keys are ~40 chars; bounds the `.in_()` URL


def ensure_skills_in_db(db: Client, skill_names: list[str]) -> dict[str, int]:
    """``ensure_skill_in_db`` for many names: one read per 100, an insert only
    for the rare name the catalog lacks. Returns {name: skills.id}.

    Resolving a CV's skills one name at a time was N sequential reads on the
    confirm-skills button — six of the sixteen for a CV naming six skills
    (traced 2026-10-03).
    """
    found: dict[str, int] = {}
    unique = list(dict.fromkeys(name for name in skill_names if name))
    for i in range(0, len(unique), _ENSURE_CHUNK):
        chunk = unique[i:i + _ENSURE_CHUNK]
        rows = (
            db.table("skills").select("id, taxonomy_key").in_("taxonomy_key", chunk).execute()
        ).data or []
        for row in rows:
            key, skill_id = row.get("taxonomy_key"), row.get("id")
            if key and skill_id is not None:
                found[str(key)] = int(skill_id)
    for name in unique:
        if name not in found:
            skill_id = ensure_skill_in_db(db, name)
            if skill_id is not None:
                found[name] = skill_id
    return found


def ensure_skill_in_db(db: Client, skill_name: str) -> int | None:
    """
    Ensures a Lightcast skill exists in the DB `skills` table.
    All 35,108 skills are pre-loaded via backfill_skills.py — insert is a safety net.
    Returns skills.id, or None on failure.
    """
    existing = db.table("skills").select("id").eq("taxonomy_key", skill_name).maybe_single().execute()
    if existing and existing.data:
        return existing.data["id"]

    lc = lookup_by_name(skill_name)
    try:
        result = db.table("skills").insert({
            "taxonomy_key": skill_name,
            "display_name": skill_name,
            "lightcast_id": lc.id if lc else None,
            "l1_domain":    lc.l1_domain if lc else "",
            "l2_cluster":   lc.l2_cluster if lc else "",
            "is_active":    True,
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception:
        return None
