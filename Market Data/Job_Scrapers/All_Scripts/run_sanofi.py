#!/usr/bin/env python3
"""Standalone runner for Sanofi India Job Scraper.
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

print("Imports loaded. Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
print(f"Location filter: '{LOCATION_FILTER}' (empty = broad/global scraping)")

COMPANY = "Sanofi"
OUTPUT_DIR = get_output_dir(COMPANY)
print(f"Output directory: {OUTPUT_DIR}")

print("=" * 60)
print("SANOFI INDIA JOB SCRAPER")
print("ATS: Workday (sanofi.wd3.myworkdayjobs.com)")
print("=" * 60)

sanofi_jobs = scrape_workday(
    tenant="sanofi",
    instance="wd3",
    career_site="SanofiCareers",
    company_name="Sanofi",
    industry="Pharmaceutical",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

df_sanofi = save_results(sanofi_jobs, "Sanofi", OUTPUT_DIR)
if df_sanofi is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df_sanofi.columns]
    print(df_sanofi[cols].head(10).to_string())
