#!/usr/bin/env python3
"""
import_master_taxonomy.py — Seed the taxonomy DB from Skill_Taxonomy_v1.xlsx.

Run once before your first Streamlit review session:
    python import_master_taxonomy.py --file Skill_Taxonomy_v1.xlsx

Safe to re-run (INSERT OR IGNORE — existing rows are skipped).
After import, taxonomy.json is written with the 63 canonical skills at count=0.
Counts grow as you review real India IT jobs in the Streamlit app.
"""

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd

from config import DB_PATH, TAXONOMY_PATH

# ── Map Excel "Skill Family" → existing TAXONOMY_CATEGORIES in config.py ──────
SKILL_FAMILY_TO_CATEGORY = {
    "Backend Development":              "Backend Frameworks",
    "Frontend Development":             "Frontend & Mobile",
    "Data Integration & ETL":           "Data & Analytics",
    "Data Storage & Modeling":          "Databases",
    "Business Intelligence":            "Data & Analytics",
    "Statistical & Quantitative Analysis": "Data & Analytics",
    "Core ML":                          "AI & Machine Learning",
    "Applied AI":                       "AI & Machine Learning",
    "Cloud Platforms":                  "Cloud Platforms",
    "Infrastructure & Automation":      "DevOps & Infrastructure",
    "DevOps Practices for Developers":  "DevOps & Infrastructure",
    "Orchestration & Operations":       "DevOps & Infrastructure",
    "Application & Cloud Security":     "Security & Compliance",
    "Security Operations":              "Security & Compliance",
    "SAP":                              "Enterprise Platforms",
    "CRM & Enterprise Platforms":       "Enterprise Platforms",
    "Delivery Management":              "Project & Process",
    "Product Skills":                   "Project & Process",
    "Test Engineering":                 "Other / Uncategorized",
    "Quality Strategy":                 "Other / Uncategorized",
    "Design Practice":                  "Other / Uncategorized",
}


def _build_tech_map(tech_df: pd.DataFrame) -> dict[str, list[str]]:
    """Build {canonical_skill_name → [technology_alias, ...]} from Technology Map sheet."""
    tech_map: dict[str, list[str]] = {}
    for _, row in tech_df.iterrows():
        canonical = str(row.get("Maps To Skill", "")).strip()
        tech_name = str(row.get("Technology", "")).strip()
        if canonical and tech_name:
            tech_map.setdefault(canonical, []).append(tech_name)
    return tech_map


def export_taxonomy_json(conn: sqlite3.Connection) -> int:
    """Write taxonomy.json sorted by demand (primary + secondary DESC). Returns skill count."""
    rows = conn.execute(
        """
        SELECT skill_name, category, aliases, primary_count, secondary_count
        FROM   taxonomy
        ORDER  BY (primary_count + secondary_count) DESC, skill_name
        """
    ).fetchall()

    # Build skills_by_demand list (ranked)
    skills_by_demand = [
        {
            "skill":        r[0],
            "category":     r[1] or "Other / Uncategorized",
            "total_jobs":   r[3] + r[4],
            "required":     r[3],
            "preferred":    r[4],
        }
        for r in rows
    ]

    # Also keep the existing categories dict for backwards compatibility
    categories: dict = {}
    for r in rows:
        cat = r[1] or "Other / Uncategorized"
        if cat not in categories:
            categories[cat] = {}
        categories[cat][r[0]] = {
            "aliases":         json.loads(r[2] or "{}"),
            "primary_count":   r[3],
            "secondary_count": r[4],
        }

    out = {
        "version":         "2.0",
        "generated_at":    datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total_skills":    len(rows),
        "skills_by_demand": skills_by_demand,
        "categories":      categories,
    }

    with open(TAXONOMY_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    return len(rows)


def import_taxonomy(excel_path: Path) -> None:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Ensure taxonomy table exists (in case DB was never initialised)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS taxonomy (
            skill_name       TEXT PRIMARY KEY,
            category         TEXT,
            aliases          TEXT DEFAULT '{}',
            first_seen_job_id   TEXT,
            first_seen_company  TEXT,
            primary_count    INTEGER DEFAULT 0,
            secondary_count  INTEGER DEFAULT 0,
            added_at         TEXT
        )
        """
    )

    # ── Read Excel sheets ────────────────────────────────────────────────────
    try:
        skill_df = pd.read_excel(excel_path, sheet_name="Skill Taxonomy")
    except Exception as e:
        print(f"ERROR: Could not read 'Skill Taxonomy' sheet: {e}")
        return

    try:
        tech_df = pd.read_excel(excel_path, sheet_name="Technology Map")
    except Exception as e:
        print(f"WARNING: Could not read 'Technology Map' sheet: {e}")
        tech_df = pd.DataFrame()

    tech_map = _build_tech_map(tech_df) if not tech_df.empty else {}

    # ── Import skills ────────────────────────────────────────────────────────
    imported = 0
    skipped = 0
    now = datetime.now().isoformat()

    for _, row in skill_df.iterrows():
        raw_skill = str(row.get("Skill", "")).strip()
        skill_family = str(row.get("Skill Family", "")).strip()
        domain = str(row.get("Domain", "")).strip()

        if not raw_skill or raw_skill == "nan":
            continue

        skill_name = raw_skill.lower()
        category = SKILL_FAMILY_TO_CATEGORY.get(skill_family, skill_family or "Other / Uncategorized")

        # Aliases JSON: stores domain, technologies from Tech Map, and original display name
        technologies = tech_map.get(raw_skill, [])
        aliases_json = json.dumps({
            "domain":        domain,
            "skill_family":  skill_family,
            "display_name":  raw_skill,
            "technologies":  technologies,
        })

        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO taxonomy
                (skill_name, category, aliases, primary_count, secondary_count, added_at)
            VALUES (?, ?, ?, 0, 0, ?)
            """,
            (skill_name, category, aliases_json, now),
        )

        if cursor.rowcount > 0:
            imported += 1
        else:
            skipped += 1

    conn.commit()

    # ── Write taxonomy.json ──────────────────────────────────────────────────
    n = export_taxonomy_json(conn)
    conn.close()

    print(f"\n  {imported} skills imported  |  {skipped} already existed (skipped)")
    print(f"  taxonomy.json written → {n} skills total")
    if tech_map:
        total_aliases = sum(len(v) for v in tech_map.values())
        print(f"  Technology aliases stored: {total_aliases} tech names mapped to canonical skills")
    print(f"\n  taxonomy.json: {TAXONOMY_PATH}")


def main():
    parser = argparse.ArgumentParser(
        description="Seed the skill taxonomy DB from the master Excel file."
    )
    parser.add_argument(
        "--file", "-f",
        default="Skill_Taxonomy_v1.xlsx",
        help="Path to the Excel seed file (default: Skill_Taxonomy_v1.xlsx)"
    )
    args = parser.parse_args()

    excel_path = Path(args.file)
    if not excel_path.exists():
        print(f"ERROR: File not found: {excel_path}")
        print("  Make sure you run this from the skill_taxonomy/ directory.")
        return

    print(f"\n  Importing from: {excel_path}")
    print(f"  Taxonomy DB:    {DB_PATH}")
    import_taxonomy(excel_path)


if __name__ == "__main__":
    main()
