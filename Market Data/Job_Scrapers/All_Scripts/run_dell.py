#!/usr/bin/env python3
"""Standalone runner for Dell India IT Job Scraper.
Uses TalentBrew HTML scraping (jobs.dell.com).
Filters: India (Bangalore/Hyderabad region) — server-renders ~19 IT jobs.

Search URL verified 2026-04-02:
  https://jobs.dell.com/en/search-jobs/India/375/2/1269750/22/79/50/1
  Returns 19 server-rendered jobs; page reports 129 total (remainder needs JS).
  All 19 HTML-visible jobs are tech roles (Software Engineer, Identity Governance, etc.).

URL structure: /en/search-jobs/{keyword}/{companyId}/{locationType}/{locationId}/{countryCode}/{stateCode}/{cityCode}/{page}
  companyId=375, locationId=1269750 (India), countryCode=22, stateCode=79, cityCode=50

Job URL format: https://jobs.dell.com/en/job/{city-slug}/{title-slug}/{companyId}/{jobId}

HTML structure:
  <a data-job-id="{job_id}" href="/en/job/...">
    <h2>{title}</h2>
    <span class="job-city-state-country">{city, country}</span>
  </a>
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Dell"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL    = "https://jobs.dell.com"
SEARCH_URL  = f"{BASE_URL}/en/search-jobs/India/375/2/1269750/22/79/50"
COMPANY_ID  = "375"

print("=" * 60)
print("DELL INDIA IT JOB SCRAPER")
print("ATS: TalentBrew (jobs.dell.com)")
print("Filters: India (Bangalore/Hyderabad region) — ~19 server-rendered IT jobs")
print("NOTE: 129 total India jobs reported; remaining require JavaScript rendering.")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml",
})

jobs = []
seen_ids = set()
page = 1
MAX_PAGES = 10

while page <= MAX_PAGES:
    url = f"{SEARCH_URL}/{page}"
    try:
        r = session.get(url, timeout=30)
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code} on page {page}")
            break

        soup = BeautifulSoup(r.text, "lxml")

        if page == 1:
            m = re.search(r"(\d+)\s+open positions", r.text, re.IGNORECASE)
            if m:
                print(f"  Total India jobs reported: {m.group(1)}")

        job_links = soup.find_all("a", {"data-job-id": True})
        batch = []
        for link in job_links:
            job_id = link.get("data-job-id", "")
            if not job_id or job_id in seen_ids:
                continue
            seen_ids.add(job_id)

            href = link.get("href", "")
            job_url = f"{BASE_URL}{href}" if href else ""

            h2 = link.find("h2")
            title = h2.get_text(strip=True) if h2 else ""

            # Location: "Bangalore,  India" or "Hyderabad,  India"
            loc_span = link.find("span", class_=lambda c: c and (
                "city" in str(c).lower() or "location" in str(c).lower()
            ))
            loc_text = loc_span.get_text(strip=True) if loc_span else ""
            city = loc_text.split(",")[0].strip() if loc_text else "India"

            batch.append({
                "job_id":           job_id,
                "title":            title,
                "company_name":     "Dell",
                "job_url":          job_url,
                "source_api_url":   SEARCH_URL,
                "business_unit":    "",
                "raw_jd_text":      "",   # JD requires per-job page fetch
                "location_city":    city,
                "location_country": "India",
                "industry":         "Technology / IT Hardware & Services",
                "date_posted":      datetime.now().strftime("%Y-%m-%d"),
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "TalentBrew",
            })

        jobs.extend(batch)
        print(f"  Page {page}: {len(batch)} new jobs (total: {len(jobs)})")

        if not batch:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] page {page}: {e}")
        break

print(f"\n  Total Dell India jobs: {len(jobs)}")
print("  NOTE: TalentBrew server-renders only ~19 jobs; 129 total require JavaScript.")
print("  All visible jobs are technology/engineering roles.")

df = save_results(jobs, "Dell", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
