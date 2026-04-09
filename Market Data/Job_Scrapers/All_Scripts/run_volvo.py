#!/usr/bin/env python3
"""Standalone runner for Volvo Group India IT Job Scraper.
Uses Jobs2Web HTML scraping (jobs.volvogroup.com).
Filters: locationsearch=India + organization=Volvo Group Digital Technology & Operations.

Search URL verified 2026-04-02:
  https://jobs.volvogroup.com/search/?q=&locationsearch=India
  Returns HTML table; ~29 total India jobs, ~12 in Digital Technology org.

HTML structure:
  <table id="searchresults">
    <tr>
      <td><a href="/job/{city-slug}/{job_id}/">{title}</a></td>
      <td>{city}, IN, {zip}</td>
      <td>{organization}</td>
    </tr>
  </table>

IT org: "Volvo Group Digital Technology & Operations"
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Volvo_Group"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL   = "https://jobs.volvogroup.com"
SEARCH_URL = f"{BASE_URL}/search/"

# IT organization substring — filter for Volvo's central IT arm
IT_ORG_KEYWORD = "Digital Technology"

# India location indicators
INDIA_INDICATORS = [", IN,", ", IN "]

print("=" * 60)
print("VOLVO GROUP INDIA IT JOB SCRAPER")
print("ATS: Jobs2Web / SAP SuccessFactors (jobs.volvogroup.com)")
print(f'Filters: India + org contains "{IT_ORG_KEYWORD}"')
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
            if len(cells) < 3:
                continue

            title_cell = cells[0]
            link = title_cell.find("a", href=True)
            if not link:
                continue

            title = link.get_text(strip=True)
            # Jobs2Web repeats the title in the cell text; use link text which is clean
            href = link.get("href", "")
            if not href or href == "/search/?q=#reset":
                continue

            job_url = f"{BASE_URL}{href}" if href.startswith("/") else href
            location_text = cells[1].get_text(strip=True) if len(cells) > 1 else ""
            org = cells[2].get_text(strip=True) if len(cells) > 2 else ""

            # Filter: must be India-based
            is_india = any(ind in location_text for ind in INDIA_INDICATORS)
            if not is_india:
                continue

            # Filter: IT organization
            if IT_ORG_KEYWORD not in org:
                continue

            # Extract job_id from URL (last numeric segment)
            job_id_m = re.search(r"/(\d+)/?$", href)
            job_id = job_id_m.group(1) if job_id_m else href.split("/")[-1]

            # Extract city from location text (e.g. "Bangalore, IN, 562122")
            city = location_text.split(",")[0].strip() if location_text else "India"

            jobs.append({
                "job_id":           job_id,
                "title":            title,
                "company_name":     "Volvo Group",
                "job_url":          job_url,
                "source_api_url":   SEARCH_URL,
                "business_unit":    org,
                "raw_jd_text":      "",   # JD not in listing; requires per-job page fetch
                "location_city":    city,
                "location_country": "India",
                "industry":         "Automotive / Transportation",
                "date_posted":      datetime.now().strftime("%Y-%m-%d"),
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "Jobs2Web",
            })
            batch_count += 1

        print(f"  Page {page}: {batch_count} India+IT jobs added (total: {len(jobs)})")

        # Check if there are more pages
        next_link = soup.find("a", {"aria-label": lambda x: x and "next" in x.lower()})
        if not next_link:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] page {page}: {e}")
        break

print(f"\n  Total Volvo Group India+IT jobs: {len(jobs)}")

df = save_results(jobs, "Volvo_Group", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
