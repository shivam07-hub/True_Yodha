"""
daily_monitor.py — Step 4 (daily): Detect new jobs after each scrape and queue them.

Run this AFTER your daily scraper runs. It will:
  1. Scan each company's Outputs folder for CSVs newer than the last import
  2. Find job_ids not yet in the DB → insert them
  3. Auto-run skill extraction on new jobs (optional, use --no-extract to skip)
  4. Report how many new jobs and NEW SKILLS appeared vs. yesterday's taxonomy

Usage:
    python daily_monitor.py                   # Check all companies, auto-extract
    python daily_monitor.py --company Stripe  # Check one company
    python daily_monitor.py --no-extract      # Just import, skip extraction
    python daily_monitor.py --report-only     # Only show what's new, no writes
"""

import argparse
import csv
import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from config import CSV_BASE, DB_PATH, IT_INDUSTRY_KEYWORDS, MIN_JD_LENGTH

# We reuse the helpers from init_db and extract_skills
from init_db import find_latest_full_csv, import_company, is_it_job


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_known_job_ids(conn: sqlite3.Connection, company_name: str) -> set[str]:
    rows = conn.execute(
        "SELECT job_id FROM jobs WHERE company_name=?", (company_name,)
    ).fetchall()
    return {r[0] for r in rows}


def get_taxonomy_skills(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("SELECT skill_name FROM taxonomy").fetchall()
    return {r[0] for r in rows}


def get_new_extracted_skills(conn: sqlite3.Connection, since_run_id: int) -> list[dict]:
    """Skills extracted from new jobs that are NOT yet in the taxonomy."""
    rows = conn.execute(
        """
        SELECT DISTINCT es.skill_name, es.company_name, es.suggested_classification
        FROM   extracted_skills es
        JOIN   daily_runs dr ON dr.company_name = es.company_name
        WHERE  dr.id > ?
          AND  es.skill_name NOT IN (SELECT skill_name FROM taxonomy)
          AND  es.user_classification IS NULL
        ORDER  BY es.skill_name
        """,
        (since_run_id,),
    ).fetchall()
    return [{"skill_name": r[0], "company": r[1], "suggested": r[2]} for r in rows]


# ── Core logic ─────────────────────────────────────────────────────────────────

def monitor_company(conn: sqlite3.Connection, company_name: str, company_dir: Path) -> dict:
    """
    Check a company's folder for a CSV newer than the last import.
    Returns stats dict.
    """
    stats = {
        "company": company_name,
        "new_jobs": 0,
        "updated_jobs": 0,
        "csv_file": None,
        "is_new_csv": False,
    }

    latest_csv = find_latest_full_csv(company_dir)
    if not latest_csv:
        return stats

    stats["csv_file"] = latest_csv.name

    # Compare against last imported CSV
    row = conn.execute(
        "SELECT last_csv_path, last_imported_at FROM companies WHERE company_name=?",
        (company_name,),
    ).fetchone()

    last_csv_path = row[0] if row else None
    is_new_csv = str(latest_csv) != last_csv_path

    if not is_new_csv:
        # Same CSV as before — check if any new job_ids appeared (unlikely but possible)
        pass

    stats["is_new_csv"] = is_new_csv

    if is_new_csv:
        print(f"  📄 New CSV detected: {latest_csv.name}")
    else:
        print(f"  ✓  No new CSV (last: {Path(last_csv_path).name if last_csv_path else 'never'})")
        return stats

    # Load new CSV and find new job_ids
    known_ids = get_known_job_ids(conn, company_name)
    new_rows = []

    with open(latest_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not is_it_job(row):
                continue
            job_id = str(row.get("job_id", "")).strip()
            if job_id and job_id not in known_ids:
                new_rows.append(row)

    if new_rows:
        print(f"     → {len(new_rows)} new IT jobs found")
        # Use import_company which handles dedup via INSERT OR IGNORE
        import_stats = import_company(conn, company_name, latest_csv)
        stats["new_jobs"] = import_stats["inserted"]
    else:
        print(f"     → No new jobs (CSV refreshed but same job_ids)")
        # Still update the last_csv_path in companies table
        conn.execute(
            "UPDATE companies SET last_csv_path=?, last_monitored_at=? WHERE company_name=?",
            (str(latest_csv), datetime.now().isoformat(), company_name),
        )
        conn.commit()

    # Record the run
    conn.execute(
        "INSERT INTO daily_runs (company_name, csv_file, new_jobs) VALUES (?,?,?)",
        (company_name, latest_csv.name, stats["new_jobs"]),
    )
    conn.commit()

    return stats


def print_new_skills_report(new_skills: list[dict]) -> None:
    """Print a summary of skills seen in new jobs that aren't in the taxonomy yet."""
    if not new_skills:
        print("\n✅ No new unknown skills found. Taxonomy is up to date.")
        return

    print(f"\n🆕 {len(new_skills)} NEW SKILLS found in today's jobs (not yet in taxonomy):")
    print(f"{'Skill':<30} {'Seen in':<25} {'Claude suggests'}")
    print("─" * 70)
    for s in new_skills:
        print(f"  {s['skill_name']:<28} {s['company']:<25} {s['suggested']}")

    print(
        f"\n👉 Open the Streamlit app to review:\n"
        f"   streamlit run app.py"
    )


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Daily monitor: detect new jobs after each scrape.")
    parser.add_argument("--company", nargs="*", metavar="NAME", help="Check only these companies")
    parser.add_argument("--no-extract", action="store_true", help="Skip automatic skill extraction on new jobs")
    parser.add_argument("--report-only", action="store_true", help="Only print a report; write nothing to DB")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)

    # Snapshot the latest run_id before we start (for new-skill detection later)
    last_run_id_row = conn.execute("SELECT MAX(id) FROM daily_runs").fetchone()
    last_run_id = last_run_id_row[0] or 0

    if args.report_only:
        # Just show status
        rows = conn.execute(
            """
            SELECT company_name,
                   COUNT(*) FILTER (WHERE review_status='pending'  AND extraction_status='extracted') AS ready_for_review,
                   COUNT(*) FILTER (WHERE extraction_status='pending') AS pending_extraction,
                   COUNT(*) FILTER (WHERE review_status='reviewed') AS reviewed
            FROM   jobs
            GROUP  BY company_name
            ORDER  BY company_name
            """
        ).fetchall()
        print(f"\n{'Company':<25} {'Ready to review':>16} {'Needs extraction':>17} {'Reviewed':>10}")
        print("─" * 72)
        for r in rows:
            print(f"  {r[0]:<23} {r[1]:>16} {r[2]:>17} {r[3]:>10}")

        taxonomy_size = conn.execute("SELECT COUNT(*) FROM taxonomy").fetchone()[0]
        print(f"\n📚 Taxonomy size: {taxonomy_size} approved skills")
        conn.close()
        return

    # Discover companies
    all_company_dirs = {
        d.name.replace("_", " ").strip(): d
        for d in sorted(CSV_BASE.iterdir())
        if d.is_dir() and d.name != "Master_Output"
    }

    if args.company:
        selected = {}
        for co_filter in args.company:
            for co_name, co_dir in all_company_dirs.items():
                if co_filter.lower() in co_name.lower():
                    selected[co_name] = co_dir
        company_dirs = selected
    else:
        company_dirs = all_company_dirs

    print(f"🔍 Daily Monitor — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"   Checking {len(company_dirs)} companies …\n")

    total_new = 0
    for company_name, company_dir in sorted(company_dirs.items()):
        print(f"[{company_name}]")
        stats = monitor_company(conn, company_name, company_dir)
        total_new += stats["new_jobs"]

    # Auto-extract new jobs
    if not args.no_extract and total_new > 0:
        print(f"\n⚙️  Running skill extraction on {total_new} new jobs …")
        import subprocess, sys
        cmd = [sys.executable, str(Path(__file__).parent / "extract_skills.py")]
        if args.company:
            cmd += ["--company"] + args.company
        subprocess.run(cmd, check=False)

    # Report new skills
    new_skills = get_new_extracted_skills(conn, last_run_id)
    print_new_skills_report(new_skills)

    # Overall summary
    print(f"\n{'─'*55}")
    total_jobs = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    reviewed   = conn.execute("SELECT COUNT(*) FROM jobs WHERE review_status='reviewed'").fetchone()[0]
    tax_size   = conn.execute("SELECT COUNT(*) FROM taxonomy").fetchone()[0]
    print(f"  Total IT jobs in DB : {total_jobs:>5}")
    print(f"  Reviewed            : {reviewed:>5}")
    print(f"  Taxonomy size       : {tax_size:>5} approved skills")
    print(f"  New jobs today      : {total_new:>5}")

    conn.close()


if __name__ == "__main__":
    main()
