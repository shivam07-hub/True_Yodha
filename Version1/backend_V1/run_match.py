#!/usr/bin/env python3
"""
Standalone CLI for running the matching pipeline.
No FastAPI needed — just run this script directly.

Usage:
    # With a real CV (PDF URL from Google Drive):
    python run_match.py --cv-url "https://drive.google.com/uc?id=xxx" \
                        --name "Rahul Sharma" \
                        --email "rahul@gmail.com" \
                        --experience "3-5" \
                        --cities "Bengaluru,Hyderabad" \
                        --work-mode "hybrid"

    # With a local PDF file:
    python run_match.py --cv-file "/path/to/resume.pdf" \
                        --name "Rahul Sharma" \
                        --email "rahul@gmail.com" \
                        --experience "3-5" \
                        --cities "Bengaluru,Hyderabad" \
                        --work-mode "hybrid"

    # Mock mode (no API key needed):
    python run_match.py --mock
"""

import argparse
import asyncio
import csv
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.config import OPENAI_API_KEY, MASTER_CSV, OUTPUT_DIR


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(name)-25s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )


def load_jobs_to_db():
    """Load the master CSV into SQLite and return a DB session."""
    import pandas as pd
    from app.database import engine, Base, SessionLocal
    from app.models import Job

    # Create tables
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    count = db.query(Job).count()

    if count == 0:
        print(f"  Loading jobs from {MASTER_CSV.name}...")
        from app.services.ingestion import ingest_csv
        stats = ingest_csv(db, MASTER_CSV)
        print(f"  Ingested {stats['jobs_ingested']} jobs")
    else:
        print(f"  Database already has {count} jobs")

    return db


async def run_pipeline(args, db):
    """Run the full matching pipeline."""
    from app.models import Job
    from app.schemas import ParsedCV, MatchResponse
    from app.services.prefilter import prefilter_jobs
    from app.services.matcher import deep_match
    from app.services.output import save_results_csv, print_results_console

    logger = logging.getLogger("pipeline")

    total_jobs = db.query(Job).filter(Job.is_active == True).count()
    print(f"\n  Active jobs in database: {total_jobs:,}")

    # ── Step 1: Parse CV ──────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  STEP 1: CV Parsing")
    print(f"{'='*60}")

    if args.cv_file:
        # Local PDF file
        from app.services.cv_parser import _extract_text_from_pdf, _call_llm, _parse_openai_response, CV_EXTRACTION_PROMPT, _mock_cv
        print(f"  Reading local PDF: {args.cv_file}")
        raw_text = _extract_text_from_pdf(args.cv_file)
        print(f"  Extracted {len(raw_text)} characters")

        if OPENAI_API_KEY and not args.mock:
            import json
            cv_text_truncated = raw_text[:8000]
            prompt = CV_EXTRACTION_PROMPT.format(cv_text=cv_text_truncated)
            print(f"  Sending to OpenAI for structured extraction...")
            raw_response = _call_llm(prompt)
            data = _parse_openai_response(raw_response)
            parsed_cv = ParsedCV(
                skills=[s.strip().lower() for s in data.get("skills", [])],
                years_experience=data.get("years_experience"),
                job_titles=data.get("job_titles", []),
                education=data.get("education"),
                industries=data.get("industries", []),
                summary=data.get("summary"),
                raw_text=raw_text,
            )
        else:
            parsed_cv = _mock_cv(args.experience, raw_text=raw_text)
    elif args.cv_url and args.cv_url != "mock":
        from app.services.cv_parser import parse_cv
        parsed_cv = await parse_cv(args.cv_url, args.experience)
    else:
        # Mock mode
        from app.services.cv_parser import _mock_cv
        parsed_cv = _mock_cv(args.experience)

    print(f"  Skills found: {len(parsed_cv.skills)}")
    print(f"  Skills: {', '.join(parsed_cv.skills[:15])}")
    if parsed_cv.job_titles:
        print(f"  Past roles: {', '.join(parsed_cv.job_titles[:5])}")
    if parsed_cv.summary:
        print(f"  Summary: {parsed_cv.summary[:120]}...")

    # ── Step 2: Pre-filter ────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  STEP 2: Pre-filtering")
    print(f"{'='*60}")

    cities = [c.strip() for c in args.cities.split(",")]
    roles = [r.strip() for r in args.roles.split(",")] if args.roles else []

    prefiltered = prefilter_jobs(
        db=db,
        parsed_cv=parsed_cv,
        preferred_cities=cities,
        work_mode=args.work_mode,
        years_experience=args.experience,
        preferred_roles=roles,
    )
    print(f"  Narrowed {total_jobs:,} jobs → {len(prefiltered)} candidates")

    if not prefiltered:
        print("\n  No jobs matched your criteria. Try broadening your preferences.")
        return

    print(f"  Score range: [{prefiltered[-1][1]:.3f} — {prefiltered[0][1]:.3f}]")

    # ── Step 3: Deep match ────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  STEP 3: Deep Matching" + (" (MOCK)" if args.mock or not OPENAI_API_KEY else f" (OpenAI)"))
    print(f"{'='*60}")

    top_matches = await deep_match(parsed_cv, prefiltered)

    # ── Step 4: Output ────────────────────────────────────────────
    response = MatchResponse(
        candidate_name=args.name,
        candidate_email=args.email,
        total_jobs_in_db=total_jobs,
        jobs_after_prefilter=len(prefiltered),
        top_matches=top_matches,
    )

    print_results_console(response)
    csv_path = save_results_csv(response)
    print(f"  CSV saved to: {csv_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Job Match CLI — match a CV against scraped job listings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Candidate info
    parser.add_argument("--name", default="Test Candidate", help="Candidate name")
    parser.add_argument("--email", default="test@example.com", help="Candidate email")
    parser.add_argument("--experience", default="3-5",
                        choices=["0-2", "3-5", "6-10", "10+"],
                        help="Years of experience")
    parser.add_argument("--cities", default="Bengaluru,Hyderabad",
                        help="Comma-separated preferred cities")
    parser.add_argument("--work-mode", default="hybrid",
                        choices=["onsite", "hybrid", "remote", "any"],
                        help="Work mode preference")
    parser.add_argument("--roles", default="Engineering,Data",
                        help="Comma-separated preferred roles")

    # CV source (mutually exclusive)
    cv_group = parser.add_mutually_exclusive_group()
    cv_group.add_argument("--cv-url", help="Google Drive URL to CV PDF")
    cv_group.add_argument("--cv-file", help="Local path to CV PDF file")

    # Options
    parser.add_argument("--mock", action="store_true",
                        help="Use mock data (no API calls)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable debug logging")
    parser.add_argument("--top-n", type=int, default=5,
                        help="Number of top matches to return")

    args = parser.parse_args()
    setup_logging(args.verbose)

    print("\n" + "=" * 60)
    print("  JOB MATCH — CV-to-Job Matching Pipeline")
    print("=" * 60)
    print(f"  Candidate: {args.name} ({args.email})")
    print(f"  Experience: {args.experience} years")
    print(f"  Cities: {args.cities}")
    print(f"  Work mode: {args.work_mode}")
    print(f"  OpenAI API: {'configured' if OPENAI_API_KEY and not args.mock else 'MOCK MODE'}")

    # Load jobs
    print(f"\n  Loading job database...")
    db = load_jobs_to_db()

    # Run pipeline
    asyncio.run(run_pipeline(args, db))
    db.close()


if __name__ == "__main__":
    main()
