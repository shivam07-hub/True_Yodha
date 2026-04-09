#!/usr/bin/env python3
"""Standalone runner for WESCO India Job Scraper.
Uses Oracle HCM / Oracle Recruiting Cloud REST API.
Filters: locationId=300000000302954 (India country) in finder param — returns all ~21 India jobs.

API verified 2026-04-02:
  GET https://eklm.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions
    ?finder=findReqs;siteNumber=CX,locationId=300000000302954
    &limit=100&offset=0
    &expand=requisitionList.secondaryLocations,flexFieldsFacet.values
  NOTE: The locationId filter is comma-separated after siteNumber in the finder string.
  NOTE: JobFamily is null for all WESCO jobs — IT filtering not available via API.
  India postings include both tech and non-tech roles (~10-11 IT out of 21 total India).

Job URL: https://eklm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/{Id}
"""
import sys
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests

COMPANY    = "WESCO"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL = "https://eklm.fa.us2.oraclecloud.com"
API_URL  = f"{BASE_URL}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
JOB_BASE = f"{BASE_URL}/hcmUI/CandidateExperience/en/sites/CX/job"

BATCH_SIZE = 100  # single request fetches all India jobs (<=100)

print("=" * 60)
print("WESCO INDIA JOB SCRAPER")
print("ATS: Oracle HCM / Oracle Recruiting Cloud (eklm.fa.us2.oraclecloud.com)")
print("Filters: locationId=300000000302954 (India) — ~21 jobs")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "application/json",
})

jobs = []

try:
    r = session.get(API_URL, params={
        "finder": "findReqs;siteNumber=CX,locationId=300000000302954",
        "limit": BATCH_SIZE,
        "offset": 0,
        "expand": "requisitionList.secondaryLocations,flexFieldsFacet.values",
    }, timeout=30)

    if r.status_code != 200:
        print(f"  [ERROR] HTTP {r.status_code}")
    else:
        data = r.json()
        item = data.get("items", [{}])[0]
        requisition_list = item.get("requisitionList", [])
        total_jobs = item.get("TotalJobsCount", 0)
        print(f"  Total India jobs reported: {total_jobs}, returned: {len(requisition_list)}")

        for j in requisition_list:
            job_id = str(j.get("Id", ""))
            title  = j.get("Title", "")
            loc    = j.get("PrimaryLocation", "India")  # e.g. "Bangalore, Karnataka, India"
            city   = loc.split(",")[0].strip() if loc else "India"
            short_desc = j.get("ShortDescriptionStr", "")

            job_url = f"{JOB_BASE}/{job_id}" if job_id else ""
            posted  = j.get("PostedDate", datetime.now().strftime("%Y-%m-%d"))

            jobs.append({
                "job_id":           job_id,
                "title":            title,
                "company_name":     "WESCO",
                "job_url":          job_url,
                "source_api_url":   API_URL,
                "business_unit":    "",
                "raw_jd_text":      short_desc,
                "location_city":    city,
                "location_country": "India",
                "industry":         "Electrical / Industrial Distribution",
                "date_posted":      posted,
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "Oracle HCM",
            })

except Exception as e:
    print(f"  [ERROR] {e}")

print(f"\n  Total WESCO India jobs: {len(jobs)}")
print("  NOTE: All India roles included — JobFamily field is null in Oracle HCM for WESCO.")
print("  India roles include ~10 tech/dev roles and ~11 non-tech (sales, finance, etc.).")

df = save_results(jobs, "WESCO", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
