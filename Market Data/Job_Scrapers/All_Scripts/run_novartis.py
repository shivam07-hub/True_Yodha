#!/usr/bin/env python3
"""Standalone runner for Novartis India Job Scraper.
Used by MASTER_Job_Scraper_Orchestrator_v2.py as a companion script
to avoid nbconvert timeout (broad Workday fetch takes >600s).
"""
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
from datetime import datetime

LOCATION_FILTER = ""
COUNTRY_CODE = ""

print("Imports loaded. Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
print(f"Location filter: '{LOCATION_FILTER}' (empty = broad/global scraping)")

COMPANY = "Novartis"
OUTPUT_DIR = get_output_dir(COMPANY)
print(f"Output directory: {OUTPUT_DIR}")

print("=" * 60)
print("NOVARTIS INDIA JOB SCRAPER")
print("ATS: Workday (novartis.wd3.myworkdayjobs.com)")
print("=" * 60)

novartis_jobs = scrape_workday(
    tenant="novartis",
    instance="wd3",
    career_site="Novartis_Careers",
    company_name="Novartis",
    industry="Pharmaceutical",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

df_novartis = save_results(novartis_jobs, "Novartis", OUTPUT_DIR)
if df_novartis is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df_novartis.columns]
    print(df_novartis[cols].head(10).to_string())
