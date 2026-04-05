"""
taxonomy_loader.py
Reads skill_taxonomy mapping/taxonomy.json and generates database/seed_skills.sql.

Run from project root:
    python3 backend/app/services/taxonomy_loader.py

Output: database/seed_skills.sql — apply this in Supabase SQL Editor after schema.sql.

Rules:
- Never edit seed_skills.sql manually.
- To add/change a skill: update taxonomy.json → update Skill_Taxonomy_v1.xlsx →
  log in TAXONOMY_CHANGELOG.md → re-run this script.
"""

import json
import sys
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TAXONOMY_JSON = PROJECT_ROOT / "skill_taxonomy mapping" / "taxonomy.json"
OUTPUT_SQL = PROJECT_ROOT / "database" / "seed_skills.sql"

# ── Domain name → code mapping ────────────────────────────────────────────────
# Matches the 10 domain codes in schema.sql

DOMAIN_CODE_MAP: dict[str, str] = {
    "Software Development": "SD",
    "Data Engineering": "DE",
    "Data Science & Analytics": "DSA",
    "AI & Machine Learning": "AML",
    "Cloud & DevOps": "CDO",
    "Cybersecurity": "CS",
    "Quality Assurance & Testing": "QAT",
    "Enterprise Applications": "EA",
    "Product & Project Management": "PPM",
    "UI/UX Design": "UX",
}

DOMAIN_DISPLAY_MAP: dict[str, str] = {
    "SD": "Software Development",
    "DE": "Data Engineering",
    "DSA": "Data Science & Analytics",
    "AML": "AI & Machine Learning",
    "CDO": "Cloud & DevOps",
    "CS": "Cybersecurity",
    "QAT": "Quality Assurance & Testing",
    "EA": "Enterprise Applications",
    "PPM": "Product & Project Management",
    "UX": "UI/UX Design",
}

# ── L1–L5 level description templates ─────────────────────────────────────────
# Phase 1 templates — refine per-skill as market evidence accumulates.

LEVEL_TEMPLATES: list[tuple[int, str, str]] = [
    (
        1, "Foundation",
        "Awareness and foundational understanding of {skill}. "
        "Can identify core concepts, describe what {skill} is used for, "
        "and has begun exploring it through study or basic tasks."
    ),
    (
        2, "Practitioner",
        "Has applied {skill} in real project or work contexts with guidance. "
        "Demonstrates practical usage, understands common patterns, "
        "and can deliver results with moderate oversight."
    ),
    (
        3, "Professional",
        "Proficient in {skill} and applies it independently with measurable impact. "
        "Handles complex scenarios, optimises for scale or quality, "
        "and contributes meaningfully without supervision."
    ),
    (
        4, "Expert",
        "Leads and architects solutions using {skill}. "
        "Mentors others, drives design decisions, "
        "and is the go-to resource for {skill} within their organisation."
    ),
    (
        5, "Authority",
        "Industry-recognised authority in {skill}. "
        "Publishes, speaks, teaches, or sets standards. "
        "Shapes how {skill} is understood and applied at a field level."
    ),
]


def sql_escape(val: str) -> str:
    return val.replace("'", "''")


def build_seed_sql(taxonomy: dict) -> str:
    lines: list[str] = [
        "-- ============================================================",
        "-- MIRROR APP — Skill Taxonomy Seed Data",
        "-- GENERATED — do not edit manually. Re-run taxonomy_loader.py.",
        f"-- taxonomy.json version: {taxonomy.get('version', 'unknown')}",
        "-- ============================================================",
        "",
        "BEGIN;",
        "",
    ]

    # ── Collect unique domains and families from taxonomy categories ──────────
    # domain_name → code
    domains_seen: dict[str, str] = {}
    # (domain_name, family_name) → True
    families_seen: dict[tuple[str, str], bool] = {}
    # skill_key → {domain, family, display_name, technologies}
    skills_data: list[dict] = []

    for _category, skills in taxonomy["categories"].items():
        for skill_key, skill_info in skills.items():
            aliases = skill_info["aliases"]
            domain_name: str = aliases["domain"]
            family_name: str = aliases["skill_family"]
            display_name: str = aliases["display_name"]
            technologies: list[str] = aliases.get("technologies", [])

            if domain_name not in DOMAIN_CODE_MAP:
                print(f"WARNING: Unknown domain '{domain_name}' for skill '{skill_key}'")
                continue

            domains_seen[domain_name] = DOMAIN_CODE_MAP[domain_name]
            families_seen[(domain_name, family_name)] = True

            skills_data.append({
                "taxonomy_key": skill_key,
                "display_name": display_name,
                "domain_name": domain_name,
                "family_name": family_name,
                "technologies": technologies,
            })

    # ── INSERT skill_domains ──────────────────────────────────────────────────
    lines.append("-- skill_domains")
    sort_order = 1
    domain_sort: dict[str, int] = {}
    for code in ["SD", "DE", "DSA", "AML", "CDO", "CS", "QAT", "EA", "PPM", "UX"]:
        domain_name = DOMAIN_DISPLAY_MAP[code]
        if domain_name in domains_seen:
            lines.append(
                f"INSERT INTO skill_domains (code, name, sort_order) VALUES "
                f"('{code}', '{sql_escape(domain_name)}', {sort_order}) "
                f"ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;"
            )
            domain_sort[domain_name] = sort_order
            sort_order += 1

    lines.append("")

    # ── INSERT skill_families ─────────────────────────────────────────────────
    lines.append("-- skill_families")
    family_sort: dict[tuple[str, str], int] = {}
    fam_sort_counter: dict[str, int] = {}

    for (domain_name, family_name) in sorted(families_seen.keys()):
        code = DOMAIN_CODE_MAP[domain_name]
        fam_sort_counter[domain_name] = fam_sort_counter.get(domain_name, 0) + 1
        fam_sort = fam_sort_counter[domain_name]
        family_sort[(domain_name, family_name)] = fam_sort

        # family code: first word of domain code + first 3 chars of family name, uppercased
        fam_code = f"{code}_{family_name[:8].upper().replace(' ', '_').replace('&', 'N')}"

        lines.append(
            f"INSERT INTO skill_families (domain_id, code, name, sort_order) "
            f"SELECT id, '{sql_escape(fam_code)}', '{sql_escape(family_name)}', {fam_sort} "
            f"FROM skill_domains WHERE code = '{code}' "
            f"ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;"
        )

    lines.append("")

    # ── INSERT skills ─────────────────────────────────────────────────────────
    lines.append("-- skills")
    for idx, skill in enumerate(skills_data):
        domain_code = DOMAIN_CODE_MAP[skill["domain_name"]]
        tech_array = "{" + ",".join(f'"{t}"' for t in skill["technologies"]) + "}"
        fam_code = (
            f"{domain_code}_{skill['family_name'][:8].upper().replace(' ', '_').replace('&', 'N')}"
        )

        lines.append(
            f"INSERT INTO skills (domain_id, family_id, taxonomy_key, display_name, "
            f"technology_aliases, sort_order) "
            f"SELECT d.id, f.id, "
            f"'{sql_escape(skill['taxonomy_key'])}', "
            f"'{sql_escape(skill['display_name'])}', "
            f"ARRAY{tech_array}::text[], {idx + 1} "
            f"FROM skill_domains d "
            f"JOIN skill_families f ON f.domain_id = d.id AND f.code = '{sql_escape(fam_code)}' "
            f"WHERE d.code = '{domain_code}' "
            f"ON CONFLICT (taxonomy_key) DO UPDATE SET "
            f"display_name = EXCLUDED.display_name, "
            f"technology_aliases = EXCLUDED.technology_aliases;"
        )

    lines.append("")

    # ── INSERT skill_levels ───────────────────────────────────────────────────
    lines.append("-- skill_levels (L1–L5 per skill)")
    for skill in skills_data:
        for level_num, label, template in LEVEL_TEMPLATES:
            description = template.format(skill=skill["display_name"])
            lines.append(
                f"INSERT INTO skill_levels (skill_id, level, label, description) "
                f"SELECT id, {level_num}, '{sql_escape(label)}', "
                f"'{sql_escape(description)}' "
                f"FROM skills WHERE taxonomy_key = '{sql_escape(skill['taxonomy_key'])}' "
                f"ON CONFLICT (skill_id, level) DO UPDATE SET "
                f"label = EXCLUDED.label, description = EXCLUDED.description;"
            )

    lines.append("")
    lines.append("COMMIT;")
    lines.append("")
    lines.append(f"-- Seed complete: {len(skills_data)} skills, "
                 f"{len(skills_data) * 5} skill_level rows")

    return "\n".join(lines)


def main() -> None:
    if not TAXONOMY_JSON.exists():
        print(f"ERROR: taxonomy.json not found at {TAXONOMY_JSON}")
        sys.exit(1)

    print(f"Reading {TAXONOMY_JSON}")
    with open(TAXONOMY_JSON, encoding="utf-8") as f:
        taxonomy = json.load(f)

    total_skills = taxonomy.get("total_skills", "?")
    print(f"  Skills in taxonomy: {total_skills}")

    sql = build_seed_sql(taxonomy)

    OUTPUT_SQL.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_SQL, "w", encoding="utf-8") as f:
        f.write(sql)

    print(f"Written: {OUTPUT_SQL}")
    print("Next step: paste database/seed_skills.sql into Supabase SQL Editor and run.")


if __name__ == "__main__":
    main()
