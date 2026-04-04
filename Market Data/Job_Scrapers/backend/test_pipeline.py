#!/usr/bin/env python3
"""
Standalone pipeline test — validates ingestion, prefiltering, and matching
using only pandas + sqlite3 (no FastAPI/SQLAlchemy needed).

Run this to verify the data pipeline works before starting the server.

Usage:
    cd backend/
    python test_pipeline.py
"""

import sqlite3
import sys
from pathlib import Path

import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent
PROJECT_DIR = BACKEND_DIR.parent
MASTER_CSV = PROJECT_DIR / "Master_Output" / "ALL_JOBS_NORMALIZED_2026_03.csv"
import tempfile
DB_PATH = Path(tempfile.gettempdir()) / "test_jobmatch.db"


def step1_ingest():
    """Load CSV into SQLite and verify."""
    print("=" * 60)
    print("STEP 1: CSV → SQLite Ingestion")
    print("=" * 60)

    if not MASTER_CSV.exists():
        print(f"ERROR: CSV not found at {MASTER_CSV}")
        sys.exit(1)

    df = pd.read_csv(MASTER_CSV, dtype=str)
    print(f"  CSV rows read: {len(df)}")

    # Drop rows with no title AND no company
    df = df.dropna(subset=["title", "company_name"], how="all")
    print(f"  Valid rows: {len(df)}")

    # Write to SQLite
    conn = sqlite3.connect(str(DB_PATH))
    df.to_sql("jobs", conn, if_exists="replace", index_label="id")

    # Verify
    count = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    print(f"  Jobs in SQLite: {count}")

    # Stats
    companies = conn.execute(
        "SELECT company_name, COUNT(*) as cnt FROM jobs "
        "WHERE company_name IS NOT NULL GROUP BY company_name ORDER BY cnt DESC"
    ).fetchall()
    print(f"  Companies: {len(companies)}")
    for name, cnt in companies[:5]:
        print(f"    {name}: {cnt} jobs")

    with_jd = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE raw_jd_text IS NOT NULL AND LENGTH(raw_jd_text) > 50"
    ).fetchone()[0]
    with_skills = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE skills_required IS NOT NULL AND skills_required != ''"
    ).fetchone()[0]
    print(f"  With JD text: {with_jd} ({with_jd/count*100:.0f}%)")
    print(f"  With skills: {with_skills} ({with_skills/count*100:.0f}%)")

    conn.close()
    print("  ✅ Ingestion complete\n")
    return count


def step2_prefilter():
    """Test the pre-filtering logic."""
    print("=" * 60)
    print("STEP 2: Pre-filter (3,600 → ~50 jobs)")
    print("=" * 60)

    # Mock candidate profile
    candidate = {
        "skills": {"python", "sql", "aws", "docker", "kubernetes",
                   "machine learning", "pandas", "spark", "airflow",
                   "terraform", "git", "rest api", "postgresql", "redis"},
        "preferred_cities": ["Bengaluru", "Hyderabad"],
        "work_mode": "hybrid",
        "years_experience": "3-5",
    }

    seniority_map = {
        "0-2": ["junior", "entry", "associate", "intern"],
        "3-5": ["mid", "junior", "senior", "associate"],
        "6-10": ["senior", "lead", "mid", "principal"],
        "10+": ["lead", "principal", "senior", "director", "staff"],
    }
    target_seniorities = seniority_map.get(candidate["years_experience"], [])

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM jobs WHERE is_active = 'True' OR is_active IS NULL")
    all_jobs = [dict(row) for row in cursor.fetchall()]
    print(f"  Active jobs: {len(all_jobs)}")

    # City filter
    city_lower = {c.lower() for c in candidate["preferred_cities"]}
    filtered = []
    for job in all_jobs:
        city = (job.get("location_city") or "").lower()
        if not city or any(c in city for c in city_lower) or "india" in city:
            filtered.append(job)
    print(f"  After city filter: {len(filtered)}")

    # Work mode filter
    wm = candidate["work_mode"].lower()
    wm_filtered = []
    for job in filtered:
        jwm = (job.get("work_mode") or "").lower()
        if not jwm or wm in jwm or jwm == "remote":
            wm_filtered.append(job)
    filtered = wm_filtered
    print(f"  After work_mode filter: {len(filtered)}")

    # Skills overlap scoring
    scored = []
    for job in filtered:
        req_raw = job.get("skills_required") or ""
        pref_raw = job.get("skills_preferred") or ""
        req_skills = {s.strip().lower() for s in req_raw.split(",") if s.strip()}
        pref_skills = {s.strip().lower() for s in pref_raw.split(",") if s.strip()}
        all_skills = req_skills | pref_skills

        if all_skills:
            intersection = candidate["skills"] & all_skills
            req_hits = len(intersection & req_skills)
            pref_hits = len(intersection & pref_skills)
            denom = len(req_skills) + len(pref_skills) * 0.5
            score = (req_hits + pref_hits * 0.5) / denom if denom > 0 else 0
        else:
            # Fallback: title keyword match
            title = (job.get("title") or "").lower()
            hits = sum(1 for s in candidate["skills"] if s in title)
            score = min(hits * 0.15, 0.5)

        # Seniority bonus
        if job.get("seniority_level") and job["seniority_level"].lower() in target_seniorities:
            score += 0.15

        # JD bonus
        if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
            score += 0.05

        scored.append((job, round(score, 4)))

    scored.sort(key=lambda x: x[1], reverse=True)
    top50 = scored[:50]

    print(f"  Top 50 score range: [{top50[-1][1]:.3f} — {top50[0][1]:.3f}]")
    print(f"\n  Top 10 pre-filtered jobs:")
    for i, (job, score) in enumerate(top50[:10], 1):
        title = job.get("title", "?")[:45]
        company = job.get("company_name", "?")[:15]
        city = job.get("location_city", "?")[:15]
        print(f"    {i:2}. [{score:.3f}] {title:<45} | {company:<15} | {city}")

    conn.close()
    print("  ✅ Pre-filter complete\n")
    return top50


def step3_mock_match(top50):
    """Test mock deep matching."""
    print("=" * 60)
    print("STEP 3: Deep Match (mock) → Top 5")
    print("=" * 60)

    import random
    random.seed(42)  # reproducible

    candidate_skills = {"python", "sql", "aws", "docker", "kubernetes",
                        "machine learning", "pandas", "spark", "airflow",
                        "terraform", "git", "rest api", "postgresql", "redis"}

    results = []
    for job, prefilter_score in top50:
        req_raw = job.get("skills_required") or ""
        pref_raw = job.get("skills_preferred") or ""
        job_skills = {s.strip().lower() for s in (req_raw + "," + pref_raw).split(",") if s.strip()}

        matching = sorted(candidate_skills & job_skills)
        missing = sorted(job_skills - candidate_skills)

        base_score = prefilter_score * 80
        jd_bonus = 10 if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100 else 0
        noise = random.uniform(-5, 10)
        score = min(max(round(base_score + jd_bonus + noise, 1), 15), 98)

        results.append({
            "score": score,
            "title": job.get("title", "?"),
            "company": job.get("company_name", "?"),
            "city": job.get("location_city", "?"),
            "work_mode": job.get("work_mode", "?"),
            "seniority": job.get("seniority_level", "?"),
            "matching_skills": matching[:8],
            "missing_skills": missing[:5],
            "job_url": job.get("job_url", ""),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    top5 = results[:5]

    print(f"\n  🏆 TOP 5 MATCHES:")
    print(f"  {'─' * 56}")
    for i, r in enumerate(top5, 1):
        print(f"\n  #{i}  {r['title']}")
        print(f"      @ {r['company']}  ({r['score']}% match)")
        print(f"      📍 {r['city']} | {r['work_mode']} | {r['seniority']}")
        if r["matching_skills"]:
            print(f"      ✅ {', '.join(r['matching_skills'][:5])}")
        if r["missing_skills"]:
            print(f"      ❌ {', '.join(r['missing_skills'][:3])}")
        if r["job_url"]:
            url = r["job_url"][:70] + "..." if len(r["job_url"]) > 70 else r["job_url"]
            print(f"      🔗 {url}")

    print(f"\n  ✅ Deep match complete\n")
    return top5


def step4_mock_email(top5, candidate_name="Rahul Sharma", candidate_email="rahul@gmail.com"):
    """Test email formatting."""
    print("=" * 60)
    print("STEP 4: Email Formatting (mock)")
    print("=" * 60)

    lines = [
        f"  Hi {candidate_name},",
        "",
        f"  We found your top {len(top5)} job matches:",
    ]
    for i, r in enumerate(top5, 1):
        lines.append(f"  {i}. {r['title']} @ {r['company']} ({r['score']}% match)")

    print("\n".join(lines))
    print(f"\n  📧 Would send to: {candidate_email}")
    print("  ✅ Email mock complete\n")


if __name__ == "__main__":
    print("\n🚀 JOB MATCH PIPELINE TEST")
    print(f"   CSV: {MASTER_CSV}")
    print(f"   DB:  {DB_PATH}\n")

    total = step1_ingest()
    top50 = step2_prefilter()
    top5 = step3_mock_match(top50)
    step4_mock_email(top5)

    # Cleanup test DB
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("🧹 Cleaned up test DB")

    print("\n✅ ALL PIPELINE STEPS PASSED!")
    print("   Next: install requirements and run the FastAPI server:")
    print("     cd backend/")
    print("     pip install -r requirements.txt")
    print("     uvicorn app.main:app --reload --port 8000")
    print("     # Then visit http://localhost:8000/docs\n")
