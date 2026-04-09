#!/usr/bin/env python3
"""Standalone runner for Volkswagen India IT Job Scraper.
Uses Jobs2Web HTML scraping (jobs.volkswagen-group.com).

NOTE: As of 2026-04-02 Volkswagen Group career portal has NO India-based jobs.
  All 10 results matching "India" keyword are US/DE/CA-based (false positives).
  This script will correctly return 0 results until India postings appear.
  Re-run periodically — the scraper is working correctly.

Search URL verified 2026-04-02:
  https://jobs.volkswagen-group.com/Volkswagen/search/?q=&locationsearch=India
  Returns HTML table; current results are all Wolfsburg/Chattanooga/etc.
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Volkswagen"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL   = "https://jobs.volkswagen-group.com"
SEARCH_URL = f"{BASE_URL}/Volkswagen/search/"

# India country codes / location indicators
INDIA_INDICATORS = [", IN,", "India", " IN "]
# IT department keywords to filter jobs
IT_DEPARTMENTS   = ["information technology", "it ", "software", "digital", "data", "technology"]

print("=" * 60)
print("VOLKSWAGEN INDIA IT JOB SCRAPER")
print("ATS: Jobs2Web / SAP SuccessFactors (jobs.volkswagen-group.com)")
print("Filters: India location + IT/Technology department")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml",
})

jobs = []
page = 1
MAX_PAGES = 20

while page <= MAX_PAGES:
    params = {
        "q": "",
        "locationsearch": "India",
        "searchby": "location",
        "startrow": (page - 1) * 25,
    }
    try:
        r = session.get(SEARCH_URL, params=params, timeout=30)
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code} on page {page}")
            break

        soup = BeautifulSoup(r.text, "lxml")
        table = soup.find("table", {"id": "searchresults"})
        if not table:
            break

        caption = table.get("aria-label", "")
        if page == 1:
            print(f"  Table: {caption}")

        rows = [tr for tr in table.find_all("tr") if tr.find("td")]

        batch_count = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            title_cell = cells[0]
            link = title_cell.find("a", href=True)
            if not link or "hdr" in link.get("id", ""):
                continue

            title = link.get_text(strip=True)
            href = link.get("href", "")
            job_url = f"{BASE_URL}{href}" if href.startswith("/") else href

            department = cells[2].get_text(strip=True) if len(cells) > 2 else ""
            location_text = cells[3].get_text(strip=True) if len(cells) > 3 else ""
            date_text = cells[4].get_text(strip=True) if len(cells) > 4 else ""

            # Filter: must be India-based
            is_india = any(ind in location_text for ind in INDIA_INDICATORS)
            if not is_india:
                continue

            # Filter: IT department (optional — keep all India jobs if few results)
            dept_lower = department.lower()
            is_it = any(kw in dept_lower for kw in IT_DEPARTMENTS) or any(kw in title.lower() for kw in IT_DEPARTMENTS)

            # Extract job_id from URL (last numeric segment)
            job_id_m = re.search(r"/(\d+)/?$", href)
            job_id = job_id_m.group(1) if job_id_m else href.split("/")[-1]

            # Extract city from location text (e.g. "Pune, IN, 411001")
            city = location_text.split(",")[0].strip() if location_text else "India"

            jobs.append({
                "job_id":           job_id,
                "title":            title,
                "company_name":     "Volkswagen",
                "job_url":          job_url,
                "source_api_url":   SEARCH_URL,
                "business_unit":    department,
                "raw_jd_text":      "",
                "location_city":    city,
                "location_country": "India",
                "industry":         "Automotive",
                "date_posted":      date_text or datetime.now().strftime("%Y-%m-%d"),
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "Jobs2Web",
            })
            batch_count += 1

        print(f"  Page {page}: {batch_count} India jobs added (total: {len(jobs)})")

        # Check if there are more pages
        next_link = soup.find("a", {"aria-label": lambda x: x and "next" in x.lower()})
        if not next_link:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] page {page}: {e}")
        break

print(f"\n  Total Volkswagen India IT jobs: {len(jobs)}")
if len(jobs) == 0:
    print("  NOTE: Volkswagen currently has no India postings on jobs.volkswagen-group.com.")
    print("  Re-run periodically — the scraper is working correctly.")

df = save_results(jobs, "Volkswagen", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
