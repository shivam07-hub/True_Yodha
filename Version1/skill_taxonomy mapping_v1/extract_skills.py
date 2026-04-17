"""
extract_skills.py — Step 2: Extract skills from raw JDs using Claude API.

Usage:
    python extract_skills.py                        # Process all companies
    python extract_skills.py --company Stripe        # One company only
    python extract_skills.py --company Stripe Google # Multiple companies
    python extract_skills.py --limit 50              # Process only first 50 jobs (for testing)
    python extract_skills.py --retry-failed          # Retry previously failed jobs

Cost estimate (claude-haiku-4-5):
    ~$0.001 per job  →  2,000 jobs ≈ $2.00 total

What it does:
  1. Reads jobs with extraction_status='pending' from the DB
  2. Sends each JD to Claude with a structured extraction prompt
  3. Claude returns a JSON list of {skill_name, classification, evidence}
  4. Skills are saved to extracted_skills table
  5. Jobs are marked extraction_status='extracted' or 'failed'
"""

import argparse
import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path

from config import DB_PATH, MIN_JD_LENGTH
from llm_provider import call_llm, get_provider, get_model, is_configured, is_rate_limit_error

# ── Claude prompt ──────────────────────────────────────────────────────────────

EXTRACTION_SYSTEM = """\
You are a senior technical recruiter specialising in IT hiring in India.
Your job is to extract ALL technical and professional skills from a job description.

Rules:
- Return ONLY valid JSON — no commentary, no markdown fences.
- Each skill object must have exactly three fields:
    "skill_name"     : normalized, lowercase (e.g. "python", "aws", "machine learning")
    "classification" : "primary" if the JD says required/must-have, else "secondary"
    "evidence"       : the exact JD phrase (≤80 chars) that mentions this skill
- Normalize brand names consistently: "AWS" → "aws", "React.js" → "react", "K8s" → "kubernetes"
- Include tools, platforms, frameworks, programming languages, methodologies, and domain knowledge.
- Exclude soft skills unless the JD heavily emphasises them (e.g. "strong leadership is essential").
- Return an empty list [] if no skills can be found.

Output format:
{"skills": [{"skill_name": "...", "classification": "primary|secondary", "evidence": "..."}, ...]}
"""

EXTRACTION_USER = """\
Job Title  : {title}
Company    : {company}
Seniority  : {seniority}
Industry   : {industry}

Job Description (truncated to 3 500 chars):
{jd_text}
"""


# ── DB helpers ─────────────────────────────────────────────────────────────────

def get_pending_jobs(conn: sqlite3.Connection, company_filter: list[str] | None, limit: int | None, retry_failed: bool) -> list[dict]:
    statuses = ["pending"]
    if retry_failed:
        statuses.append("failed")

    placeholders = ",".join("?" * len(statuses))
    query = f"""
        SELECT job_id, company_name, title, seniority_level, industry, raw_jd_text
        FROM   jobs
        WHERE  extraction_status IN ({placeholders})
        AND    LENGTH(COALESCE(raw_jd_text, '')) >= {MIN_JD_LENGTH}
    """
    params = list(statuses)

    if company_filter:
        co_placeholders = ",".join("?" * len(company_filter))
        query += f" AND company_name IN ({co_placeholders})"
        params += company_filter

    query += " ORDER BY company_name, date_posted DESC"

    if limit:
        query += f" LIMIT {limit}"

    rows = conn.execute(query, params).fetchall()
    return [dict(zip(["job_id", "company_name", "title", "seniority_level", "industry", "raw_jd_text"], r)) for r in rows]


def save_skills(conn: sqlite3.Connection, job: dict, skills: list[dict]) -> int:
    """Insert extracted skills. Returns the number inserted."""
    count = 0
    for skill in skills:
        raw_name = skill.get("skill_name", "").strip()
        if not raw_name:
            continue
        normalized = raw_name.lower()
        try:
            conn.execute(
                """
                INSERT OR IGNORE INTO extracted_skills
                    (job_id, company_name, skill_name, skill_raw, suggested_classification, evidence)
                VALUES (?,?,?,?,?,?)
                """,
                (
                    job["job_id"],
                    job["company_name"],
                    normalized,
                    raw_name,
                    skill.get("classification", "secondary"),
                    (skill.get("evidence") or "")[:200],
                ),
            )
            count += 1
        except sqlite3.IntegrityError:
            pass  # duplicate skill for this job — skip
    return count


def mark_job(conn: sqlite3.Connection, job: dict, status: str) -> None:
    conn.execute(
        "UPDATE jobs SET extraction_status=?, extracted_at=? WHERE job_id=? AND company_name=?",
        (status, datetime.now().isoformat(), job["job_id"], job["company_name"]),
    )


# ── Claude extraction ──────────────────────────────────────────────────────────

def extract_skills_via_llm(job: dict) -> list[dict]:
    """Call the configured LLM to extract skills from a single JD. Returns list of skill dicts."""
    jd_text = (job.get("raw_jd_text") or "")[:3500]

    user_msg = EXTRACTION_USER.format(
        title=job.get("title", "Unknown"),
        company=job.get("company_name", "Unknown"),
        seniority=job.get("seniority_level", "Unknown"),
        industry=job.get("industry", "Unknown"),
        jd_text=jd_text,
    )

    raw = call_llm(EXTRACTION_SYSTEM, user_msg, max_tokens=1024, temperature=0.1)

    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.split("```")[0].strip()

    data = json.loads(raw)
    return data.get("skills", [])


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract skills from JDs using Claude API.")
    parser.add_argument("--company", nargs="*", metavar="NAME", help="Filter by company name(s)")
    parser.add_argument("--limit", type=int, help="Max jobs to process (useful for testing)")
    parser.add_argument("--retry-failed", action="store_true", help="Also retry previously failed jobs")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)

    # ── Provider check ────────────────────────────────────────────────────────
    provider = get_provider()
    model    = get_model()
    if not is_configured():
        key_var = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}.get(provider, "API_KEY")
        print(f"❌ {key_var} is not set for provider '{provider}'.")
        print(f"   export LLM_PROVIDER={provider}")
        print(f"   export {key_var}=<your-key>")
        conn.close()
        return

    jobs = get_pending_jobs(conn, args.company, args.limit, args.retry_failed)

    if not jobs:
        print("✅ No jobs pending extraction.")
        print("   Run init_db.py first, or check that there are jobs with extraction_status='pending'.")
        conn.close()
        return

    print(f"🔍 Extracting skills for {len(jobs)} jobs  |  provider={provider}  model={model}")
    if args.company:
        print(f"   Company filter: {', '.join(args.company)}")
    print()

    success = 0
    failed = 0
    total_skills = 0

    for i, job in enumerate(jobs, start=1):
        label = f"[{i:>4}/{len(jobs)}] {job['company_name']:<20} {job['title'][:45]}"
        print(f"{label}", end="  ", flush=True)

        try:
            skills = extract_skills_via_llm(job)
            n_saved = save_skills(conn, job, skills)
            mark_job(conn, job, "extracted")
            conn.commit()
            print(f"✓  {n_saved} skills")
            total_skills += n_saved
            success += 1
        except json.JSONDecodeError as e:
            mark_job(conn, job, "failed")
            conn.commit()
            print(f"✗  JSON parse error: {e}")
            failed += 1
        except Exception as e:
            if is_rate_limit_error(e):
                print("⚠️  Rate limit hit — sleeping 60s …")
                time.sleep(60)
                # Don't mark as failed; will retry on next run
            else:
                mark_job(conn, job, "failed")
                conn.commit()
                print(f"✗  ERROR: {e}")
                failed += 1

        # Gentle pacing: 1 req/sec is well within Haiku's limits
        if i % 20 == 0:
            time.sleep(1)

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'─'*55}")
    print(f"  Jobs processed   : {success + failed:>5}")
    print(f"  Succeeded        : {success:>5}")
    print(f"  Failed           : {failed:>5}")
    print(f"  Total skills     : {total_skills:>5}")

    # Per-company breakdown
    rows = conn.execute(
        """
        SELECT company_name,
               COUNT(*) FILTER (WHERE extraction_status='extracted') as done,
               COUNT(*) FILTER (WHERE extraction_status='pending')   as pending,
               COUNT(*) FILTER (WHERE extraction_status='failed')    as failed
        FROM   jobs
        GROUP  BY company_name
        ORDER  BY company_name
        """
    ).fetchall()

    if rows:
        print(f"\n{'Company':<25} {'Extracted':>10} {'Pending':>8} {'Failed':>7}")
        print("─" * 55)
        for r in rows:
            print(f"  {r[0]:<23} {r[1]:>10} {r[2]:>8} {r[3]:>7}")

    print(f"\n👉 Next step: streamlit run app.py")
    conn.close()


if __name__ == "__main__":
    main()
