#!/usr/bin/env python3
"""Standalone runner for CNHI India IT Job Scraper.
Uses the SAP SuccessFactors Jobs2Web REST API.
Filters: location=India, then keeps jobs with category=Digital and Information Technology.

API verified 2026-04-02:
  POST https://join.cnh.com/services/recruiting/v1/jobs
  Body: {"keywords": "", "locale": "en_US", "location": "India", "pageNumber": 0, "sortBy": "recent"}
  Response: jobSearchResult[].response with fields:
    unifiedStandardTitle, country_obj, cust_PostingCategory, id, unifiedUrlTitle,
    jobLocationShort (city list), unifiedStandardStart (posted date)

IT category name: "Digital and Information Technology"
NOTE: As of 2026-04-02 there are ~11 India jobs total, ~2 IT/Digital.
"""
import sys, time, random
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "CNHI"
OUTPUT_DIR = get_output_dir(COMPANY)

API_URL    = "https://join.cnh.com/services/recruiting/v1/jobs"
JOB_BASE   = "https://join.cnh.com/job"
LOCATION   = "India"
IT_CATEGORIES = {"Digital and Information Technology", "Information Technology", "IT"}
MAX_PAGES  = 20

print("=" * 60)
print("CNHI INDIA IT JOB SCRAPER")
print("ATS: SAP SuccessFactors / Jobs2Web (join.cnh.com)")
print(f"Filters: location={LOCATION}, category=Digital and Information Technology")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Referer": "https://join.cnh.com/search/?q=&",
})

all_india_jobs = []
page = 0
known_total = None

while page < MAX_PAGES:
    r = session.post(API_URL, json={
        "keywords": "",
        "locale": "en_US",
        "location": LOCATION,
        "pageNumber": page,
        "sortBy": "recent",
    }, timeout=30)

    if r.status_code != 200:
        print(f"  [ERROR] HTTP {r.status_code} on page {page}")
        break

    data = r.json()
    results = data.get("jobSearchResult", [])
    total = data.get("totalJobs", 0)

    if known_total is None:
        known_total = total
        print(f"  Total India jobs on portal: {known_total}")

    if not results:
        break

    all_india_jobs.extend(results)
    print(f"  Page {page}: {len(results)} jobs (collected {len(all_india_jobs)}/{known_total})")

    page += 1
    if len(all_india_jobs) >= known_total:
        break
    time.sleep(random.uniform(0.3, 0.7))

# Filter for IT/Digital category
jobs = []
for item in all_india_jobs:
    rd = item.get("response", {})
    cats = rd.get("cust_PostingCategory", [])
    cat_str = cats[0] if cats else ""

    if not any(it_cat.lower() in cat_str.lower() for it_cat in IT_CATEGORIES):
        continue

    job_id  = str(rd.get("id", ""))
    title   = rd.get("unifiedStandardTitle", rd.get("urlTitle", ""))
    url_title = rd.get("unifiedUrlTitle", rd.get("urlTitle", ""))
    job_url = f"{JOB_BASE}/{url_title}/{job_id}" if job_id else ""

    locs = rd.get("jobLocationShort", [])
    city = locs[0].split(",")[0].strip() if locs else LOCATION

    posted = rd.get("unifiedStandardStart", datetime.now().strftime("%Y-%m-%d"))

    jobs.append({
        "job_id":           job_id,
        "title":            title,
        "company_name":     "CNHI",
        "job_url":          job_url,
        "source_api_url":   API_URL,
        "business_unit":    cat_str,
        "raw_jd_text":      "",   # JD not in listing response; would require per-job page fetch
        "location_city":    city,
        "location_country": "India",
        "industry":         "Agricultural & Construction Equipment",
        "date_posted":      posted,
        "is_active":        True,
        "salary_currency":  "INR",
        "source_platform":  "SAP SuccessFactors",
    })

print(f"\n  India jobs total: {len(all_india_jobs)}")
print(f"  After IT/Digital filter: {len(jobs)}")

df = save_results(jobs, "CNHI", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
