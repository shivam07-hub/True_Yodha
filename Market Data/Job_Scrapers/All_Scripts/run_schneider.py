#!/usr/bin/env python3
"""Standalone runner for Schneider Electric India IT Job Scraper.
Uses the Phenom/iCIMS REST API directly — no Selenium required.
Filters: location=India + categories=Digital Innovation & Technology (~132 jobs).

API verified 2026-04-02:
  GET https://careers.se.com/api/jobs
    ?location=India
    &categories=Digital+Innovation+%26+Technology
    &pageSize=150
  Returns JSON with jobs[].data containing full JD in description/responsibilities/qualifications fields.
"""
import sys, time
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Schneider_Electric"
OUTPUT_DIR = get_output_dir(COMPANY)

API_BASE   = "https://careers.se.com/api/jobs"
LOCATION   = "India"
CATEGORY   = "Digital Innovation & Technology"
PAGE_SIZE  = 10    # API hard-caps at 10 per page; paginate via page=N

print("=" * 60)
print("SCHNEIDER ELECTRIC INDIA IT JOB SCRAPER")
print("ATS: Phenom/iCIMS (careers.se.com)")
print(f"Filters: location={LOCATION}, category={CATEGORY}")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "application/json",
})

jobs = []

# Build base URL manually — the API requires + for spaces and %26 for &.
# requests.params dict encodes spaces as %20 which breaks the categories filter.
from urllib.parse import quote_plus
category_encoded = quote_plus(CATEGORY)  # "Digital+Innovation+%26+Technology"
base_url = f"{API_BASE}?location={LOCATION}&categories={category_encoded}&pageSize={PAGE_SIZE}"

raw_jobs = []
page = 1
known_total = None

while True:
    url = f"{base_url}&page={page}"
    r = session.get(url, timeout=30)
    if r.status_code != 200:
        print(f"  [ERROR] HTTP {r.status_code} on page {page}")
        break
    data = r.json()
    if known_total is None:
        known_total = data.get("totalCount", 0)
        print(f"  API reports {known_total} total jobs")
    batch = data.get("jobs", [])
    if not batch:
        break
    raw_jobs.extend(batch)
    print(f"  Page {page}: {len(batch)} jobs (total collected: {len(raw_jobs)})")
    if len(raw_jobs) >= known_total:
        break
    page += 1

print(f"  Fetched {len(raw_jobs)} jobs across {page} pages")
if True:  # keep indent consistent with original block
    for item in raw_jobs:
        d = item.get("data", {})

        # Combine JD fields
        jd_parts = [d.get("description", ""), d.get("responsibilities", ""), d.get("qualifications", "")]
        jd_text = "\n\n".join(p for p in jd_parts if p)
        if jd_text:
            jd_text = BeautifulSoup(jd_text, "lxml").get_text(" ", strip=True)

        req_id  = str(d.get("req_id", d.get("slug", "")))
        title   = d.get("title", "")
        city    = d.get("city") or d.get("full_location") or LOCATION
        apply_url = d.get("apply_url", "")
        slug    = d.get("slug", req_id)
        job_url = f"https://careers.se.com/jobs/{slug}/job" if slug else apply_url

        cats = d.get("category", d.get("categories", []))
        if isinstance(cats, list):
            business_unit = ", ".join(str(c).strip() for c in cats)
        else:
            business_unit = str(cats).strip()

        jobs.append({
            "job_id":           req_id,
            "title":            title,
            "company_name":     "Schneider Electric",
            "job_url":          job_url,
            "source_api_url":   API_BASE,
            "business_unit":    business_unit,
            "raw_jd_text":      jd_text,
            "location_city":    city,
            "location_country": "India",
            "industry":         "Energy Management / Industrial Automation",
            "date_posted":      d.get("posted_date", datetime.now().strftime("%Y-%m-%d")),
            "is_active":        True,
            "salary_currency":  "INR",
            "source_platform":  "Phenom/iCIMS",
        })

print(f"\n  Total Schneider Electric India+IT jobs: {len(jobs)}")

df = save_results(jobs, "Schneider_Electric", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
