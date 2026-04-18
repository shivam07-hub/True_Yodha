"""
backfill_skills.py
Populates the full 3-tier Lightcast skill hierarchy in Supabase.

Tier structure:
  skill_domains  (L1) — 31 domains,   e.g. "Information Technology"
  skill_clusters (L2) — 442 clusters, e.g. "Software Development"
  skills         (L3) — 35,108 skills, e.g. "Python (Programming Language)"

Run AFTER applying database/migrations/20260418_skill_hierarchy.sql in Supabase.
Run from project root:
    source .venv/bin/activate
    python database/backfill_skills.py

After this completes, run the FINALIZE block in the migration SQL:
    ALTER TABLE skills ALTER COLUMN cluster_id SET NOT NULL;
    ALTER TABLE skills DROP COLUMN IF EXISTS category;
    ALTER TABLE skills DROP COLUMN IF EXISTS subcategory;

Safe to re-run — all operations are upserts.
"""

import json
import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT          = Path(__file__).resolve().parents[1]
TAXONOMY_FILE = ROOT / "lightcast_skills_taxonomy.json"
ENV_FILE      = ROOT / "backend" / ".env"
BATCH_SIZE    = 500


# ── Load environment ──────────────────────────────────────────

def load_env() -> tuple[str, str]:
    load_dotenv(ENV_FILE)
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY missing in backend/.env")
        sys.exit(1)
    return url, key


# ── Walk taxonomy JSON ────────────────────────────────────────

def walk_taxonomy(path: Path) -> tuple[list[str], dict[str, str], list[dict]]:
    """
    Returns:
      domains   — sorted list of L1 domain names (31)
      cluster_to_domain — {cluster_name: domain_name} (442 entries)
      skills    — list of {name, lightcast_id, domain, cluster} dicts (35,108)
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    domains_set: set[str] = set()
    cluster_to_domain: dict[str, str] = {}
    skills: list[dict] = []

    def _walk(node: dict, domain: str | None = None, cluster: str | None = None) -> None:
        if node.get("id") and domain and cluster:
            skills.append({
                "name":         node["name"],
                "lightcast_id": node["id"],
                "domain":       domain,
                "cluster":      cluster,
            })
        for child in node.get("children", []):
            if domain is None:
                domains_set.add(child["name"])
                _walk(child, child["name"])
            elif cluster is None:
                cluster_to_domain[child["name"]] = domain
                _walk(child, domain, child["name"])
            else:
                _walk(child, domain, cluster)

    _walk(data)
    return sorted(domains_set), cluster_to_domain, skills


# ── Upsert helpers ────────────────────────────────────────────

def upsert_domains(db, domains: list[str]) -> dict[str, int]:
    """Upsert L1 domains. Returns {name: id}."""
    rows = [{"name": d} for d in domains]
    db.table("skill_domains").upsert(rows, on_conflict="name").execute()
    result = db.table("skill_domains").select("id, name").execute()
    return {r["name"]: r["id"] for r in result.data}


def upsert_clusters(db, cluster_to_domain: dict[str, str], domain_ids: dict[str, int]) -> dict[str, int]:
    """Upsert L2 clusters. Returns {name: id}."""
    rows = [
        {"domain_id": domain_ids[domain], "name": cluster}
        for cluster, domain in cluster_to_domain.items()
        if domain in domain_ids
    ]
    for i in range(0, len(rows), BATCH_SIZE):
        db.table("skill_clusters").upsert(rows[i:i+BATCH_SIZE], on_conflict="domain_id,name").execute()
        time.sleep(0.05)

    result = db.table("skill_clusters").select("id, name").execute()
    return {r["name"]: r["id"] for r in result.data}


def upsert_skills(db, skills: list[dict], cluster_ids: dict[str, int]) -> int:
    """Upsert L3 skills with cluster_id FK. Returns count upserted."""
    rows = [
        {
            "taxonomy_key": s["name"],
            "display_name": s["name"],
            "lightcast_id": s["lightcast_id"],
            "cluster_id":   cluster_ids[s["cluster"]],
            # category/subcategory kept until finalize migration drops them
            "category":    s["domain"],
            "subcategory": s["cluster"],
            "is_active":   True,
        }
        for s in skills
        if s["cluster"] in cluster_ids
    ]

    upserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        db.table("skills").upsert(rows[i:i+BATCH_SIZE], on_conflict="taxonomy_key").execute()
        upserted += len(rows[i:i+BATCH_SIZE])
        print(f"  {upserted}/{len(rows)} skills upserted…", end="\r")
        time.sleep(0.05)

    print()
    return upserted


def update_cluster_counts(db, cluster_ids: dict[str, int]) -> None:
    """Set skill_clusters.skill_count from actual skills rows."""
    result = db.table("skills").select("cluster_id").execute()
    counts: dict[int, int] = {}
    for row in result.data:
        cid = row.get("cluster_id")
        if cid:
            counts[cid] = counts.get(cid, 0) + 1

    updated = 0
    for cid, n in counts.items():
        db.table("skill_clusters").update({"skill_count": n}).eq("id", cid).execute()
        updated += 1
        if updated % 50 == 0:
            print(f"  {updated}/{len(counts)} clusters updated…", end="\r")
    print(f"  skill_count updated for {updated} clusters    ")


# ── Main ──────────────────────────────────────────────────────

def main() -> None:
    print("Loading taxonomy JSON…")
    domains, cluster_to_domain, skills = walk_taxonomy(TAXONOMY_FILE)
    print(f"  {len(domains)} L1 domains | {len(cluster_to_domain)} L2 clusters | {len(skills)} L3 skills")

    print("Connecting to Supabase…")
    url, key = load_env()
    db = create_client(url, key)

    print("\n[1/4] Upserting L1 domains…")
    domain_ids = upsert_domains(db, domains)
    print(f"  {len(domain_ids)} domains ready")

    print("\n[2/4] Upserting L2 clusters…")
    cluster_ids = upsert_clusters(db, cluster_to_domain, domain_ids)
    print(f"  {len(cluster_ids)} clusters ready")

    print("\n[3/4] Upserting L3 skills with cluster_id FK…")
    count = upsert_skills(db, skills, cluster_ids)
    print(f"  {count} skills upserted")

    print("\n[4/4] Updating cluster skill counts…")
    update_cluster_counts(db, cluster_ids)

    print("\nDone. Now run the FINALIZE block in:")
    print("  database/migrations/20260418_skill_hierarchy.sql")
    print("\n  ALTER TABLE skills ALTER COLUMN cluster_id SET NOT NULL;")
    print("  ALTER TABLE skills DROP COLUMN IF EXISTS category;")
    print("  ALTER TABLE skills DROP COLUMN IF EXISTS subcategory;")


if __name__ == "__main__":
    main()
