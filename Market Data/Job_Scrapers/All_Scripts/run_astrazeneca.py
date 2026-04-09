#!/usr/bin/env python3
"""Standalone runner for AstraZeneca India Job Scraper.
Uses TalentBrew HTML scraping (careers.astrazeneca.com).
Fetches all India job listings — no IT-only filter URL available on this platform.

Page URL verified 2026-04-02:
  https://careers.astrazeneca.com/location/india-jobs/7684/1269750/{page}
  Returns 30 jobs per page; ~65 total India jobs across 3 pages.

Job URL format:
  https://careers.astrazeneca.com/job/{city}/{title-slug}/7684/{job_id}

HTML structure:
  <li><a class="search-results-link" data-job-id="{job_id}" href="/job/...">
    <div class="search-result-left-child"><h2>{title}</h2>
    <span class="job-city-state-country">{city, state, country}</span>
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "AstraZeneca"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL   = "https://careers.astrazeneca.com"
COMPANY_ID = "7684"
LOCATION_ID = "1269750"  # India location segment
PAGE_URL   = f"{BASE_URL}/location/india-jobs/{COMPANY_ID}/{LOCATION_ID}"

print("=" * 60)
print("ASTRAZENECA INDIA JOB SCRAPER")
print("ATS: TalentBrew (careers.astrazeneca.com)")
print("Filters: India (all ~65 jobs — no IT-only URL available)")
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
# TalentBrew page numbering: /1 redirects to homepage; actual results start at /2
page = 2
MAX_PAGES = 50  # handle up to 50 pages x 15 jobs = 750 max

while page <= MAX_PAGES:
    url = f"{PAGE_URL}/{page}"
    try:
        r = session.get(url, timeout=30)
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code} on page {page}")
            break
        # Detect redirect to homepage (page exhausted)
        if r.url == f"{BASE_URL}/" or r.url == BASE_URL:
            print(f"  Page {page}: redirected to homepage — end of results")
            break

        soup = BeautifulSoup(r.text, "lxml")

        # Check total jobs on first page
        if page == 1:
            m = re.search(r"(\d+)\s*Jobs", r.text, re.IGNORECASE)
            if m:
                print(f"  Total India jobs reported: {m.group(1)}")

        # Deduplicated job links (each appears twice: main card + "View Role")
        job_links = soup.find_all("a", {"data-job-id": True})
        batch = []
        for link in job_links:
            job_id = link.get("data-job-id", "")
            if not job_id or job_id in seen_ids:
                continue
            seen_ids.add(job_id)

            href = link.get("href", "")
            job_url = f"{BASE_URL}{href}" if href else ""

            # Extract city from href: /job/{city}/{slug}/{company_id}/{job_id}
            href_parts = href.strip("/").split("/")
            city = href_parts[1].replace("-", " ").title() if len(href_parts) > 1 else "India"

            # Title from h2 inside the link
            h2 = link.find("h2")
            title = h2.get_text(strip=True) if h2 else ""

            # Location text (city, state, country)
            loc_span = link.find("span", class_=lambda c: c and "city" in str(c).lower())
            if loc_span:
                city = loc_span.get_text(strip=True).split(",")[0].strip()

            batch.append({
                "job_id":           job_id,
                "title":            title,
                "company_name":     "AstraZeneca",
                "job_url":          job_url,
                "source_api_url":   PAGE_URL,
                "business_unit":    "",
                "raw_jd_text":      "",   # JD requires per-job page fetch
                "location_city":    city,
                "location_country": "India",
                "industry":         "Pharmaceuticals / Biopharmaceuticals",
                "date_posted":      datetime.now().strftime("%Y-%m-%d"),
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "TalentBrew",
            })

        jobs.extend(batch)
        print(f"  Page {page}: {len(batch)} jobs (total: {len(jobs)})")

        if not batch:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] page {page}: {e}")
        break

print(f"\n  Total AstraZeneca India jobs: {len(jobs)}")
print("  NOTE: All India roles included — TalentBrew has no combined India+IT filter URL.")
print("  Most India postings are technology/analytics roles (SAP, Software, Data, IT).")

df = save_results(jobs, "AstraZeneca", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
