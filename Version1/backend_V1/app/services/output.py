"""
Output service — saves match results as CSV and prints to console.
Replaces the email service for Phase 1-4 workflow.
"""

import csv
import logging
from datetime import datetime
from pathlib import Path

from app.schemas import MatchResponse
from app.config import OUTPUT_DIR

logger = logging.getLogger(__name__)


def save_results_csv(response: MatchResponse) -> Path:
    """
    Save match results to a CSV file.

    Returns:
        Path to the generated CSV file.
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = response.candidate_name.replace(" ", "_").lower()
    filename = f"matches_{safe_name}_{timestamp}.csv"
    csv_path = OUTPUT_DIR / filename

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Rank", "Match %", "Job Title", "Company", "Location",
            "Work Mode", "Seniority",
            "Your Strengths", "Your Weaknesses", "Why Apply",
            "Matching Skills", "Missing Skills",
            "Overall Reasoning", "Apply URL",
        ])
        for m in response.top_matches:
            writer.writerow([
                m.rank,
                f"{m.score}%",
                m.job_title,
                m.company_name,
                m.location_city or "",
                m.work_mode or "",
                m.seniority_level or "",
                m.strengths,
                m.weaknesses,
                m.why_apply,
                "; ".join(m.matching_skills),
                "; ".join(m.missing_skills),
                m.reasoning,
                m.job_url or "",
            ])

    logger.info(f"Results saved to: {csv_path}")
    return csv_path


def print_results_console(response: MatchResponse) -> None:
    """Pretty-print match results to console."""
    print(f"\n{'='*70}")
    print(f"  MATCH RESULTS for {response.candidate_name} ({response.candidate_email})")
    print(f"  Jobs in DB: {response.total_jobs_in_db:,} | After pre-filter: {response.jobs_after_prefilter}")
    print(f"{'='*70}")

    if not response.top_matches:
        print("  No matches found.")
        return

    for m in response.top_matches:
        bar = "█" * int(m.score / 5) + "░" * (20 - int(m.score / 5))
        print(f"\n  ┌─ #{m.rank}  {m.job_title}")
        print(f"  │  @ {m.company_name}")

        loc_parts = []
        if m.location_city:
            loc_parts.append(m.location_city)
        if m.work_mode:
            loc_parts.append(m.work_mode.title())
        if m.seniority_level:
            loc_parts.append(m.seniority_level.title())
        if loc_parts:
            print(f"  │  {' | '.join(loc_parts)}")

        print(f"  │")
        print(f"  │  MATCH SCORE:  {m.score}%  [{bar}]")
        print(f"  │  {m.reasoning}")

        if m.why_apply:
            print(f"  │")
            print(f"  │  WHY APPLY:")
            for line in m.why_apply.split(". "):
                line = line.strip()
                if line:
                    print(f"  │    • {line.rstrip('.')}.")

        if m.strengths:
            print(f"  │")
            print(f"  │  YOUR STRENGTHS FOR THIS ROLE:")
            for line in m.strengths.split(". "):
                line = line.strip()
                if line:
                    print(f"  │    ✓ {line.rstrip('.')}.")

        if m.weaknesses:
            print(f"  │")
            print(f"  │  GAPS TO ADDRESS:")
            for line in m.weaknesses.split(". "):
                line = line.strip()
                if line:
                    print(f"  │    ✗ {line.rstrip('.')}.")

        if m.matching_skills:
            print(f"  │")
            print(f"  │  Matched skills : {', '.join(m.matching_skills)}")
        if m.missing_skills:
            print(f"  │  Missing skills : {', '.join(m.missing_skills)}")

        if m.job_url:
            url = m.job_url[:90] + "..." if len(m.job_url) > 90 else m.job_url
            print(f"  │")
            print(f"  │  Apply → {url}")

        print(f"  └{'─'*68}")

    print(f"\n{'='*70}\n")
