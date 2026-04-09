#!/usr/bin/env python3
"""Standalone runner for Michelin India Job Scraper.
Uses CXF/Astro platform HTML scraping (jobs.michelin.in).
Filters: India region (criteria JSON with location IDs) — ~18 India jobs across 3 pages.

Page URL verified 2026-04-02:
  https://jobs.michelin.in/job-offer-result-list?criteria={...}&page=N
  India + Sri Lanka region criteria returns 21 jobs (3 pages of 9+9+3).
  After filtering for "India" in location text: ~18 India jobs.

Location criteria IDs (verified from page props):
  level0 (region): clef9npi100080hwi9ulb6phu, sw4r5llp48tmhadpo1jgn5wf
  level1 (cities): x5ziednftq4lnjnkkg96rlvd, clef9npi100070hwig0b9b78r, a4fj1fimu7m8enbotzwwhzgp

Job URL format: https://jobs.michelin.in/job-offer-result-list/{job-slug}

HTML structure (server-rendered Astro + Svelte):
  <a href="/job-offer-result-list/{slug}">{title}Offer published on {date}Location :{city}, {country}Sector :{sector}...</a>
  - pagination via astro-island with "lastPage" prop
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime
import json, urllib.parse

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Michelin"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL   = "https://jobs.michelin.in"
SEARCH_URL = f"{BASE_URL}/job-offer-result-list"

# India region location criteria (from page props, verified 2026-04-02)
INDIA_CRITERIA = json.dumps({
    "jobLocation": {
        "level0": ["clef9npi100080hwi9ulb6phu", "sw4r5llp48tmhadpo1jgn5wf"],
        "level1": ["x5ziednftq4lnjnkkg96rlvd", "clef9npi100070hwig0b9b78r", "a4fj1fimu7m8enbotzwwhzgp"],
    }
})

print("=" * 60)
print("MICHELIN INDIA JOB SCRAPER")
print("ATS: CXF/Astro (jobs.michelin.in)")
print("Filters: India region criteria — ~18 India jobs across 3 pages")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml",
})

jobs = []
seen_slugs = set()
page = 1
max_pages = 50  # safety cap

while page <= max_pages:
    url = f"{SEARCH_URL}?criteria={urllib.parse.quote(INDIA_CRITERIA)}&page={page}"
    try:
        r = session.get(url, timeout=30)
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code} on page {page}")
            break

        soup = BeautifulSoup(r.text, "lxml")

        # Detect total pages from pagination island
        if page == 1:
            for island in soup.find_all("astro-island"):
                comp = island.get("component-url", "")
                if "pagination" in comp:
                    try:
                        props = json.loads(island.get("props", "{}"))
                        data = props.get("data", [0, {}])[1]
                        last = data.get("lastPage", [0, 0])[1]
                        max_pages = int(last) if last else max_pages
                        print(f"  Total pages: {last}")
                    except Exception:
                        pass

        job_links = soup.find_all("a", href=lambda h: h and "/job-offer-result-list/" in str(h))
        batch = []
        for link in job_links:
            href = link.get("href", "")
            slug = href.rstrip("/").split("/")[-1]
            if not slug or slug in seen_slugs:
                continue
            seen_slugs.add(slug)

            text = link.get_text(strip=True)

            # Extract fields from link text:
            # "{title}Offer published on {date}Location :{city}, {country}Sector :{sector}..."
            title_m = re.match(r"^(.+?)Offer published", text)
            title = title_m.group(1).strip() if title_m else text[:60]

            loc_m = re.search(r"Location\s*:\s*(.+?)(?:Sector|Contract type|$)", text, re.IGNORECASE)
            loc_text = loc_m.group(1).strip() if loc_m else ""

            # Filter: must be India
            if "India" not in loc_text:
                continue

            city = loc_text.split(",")[0].strip() if loc_text else "India"

            date_m = re.search(r"published on (\d{2} \d{2} \d{4})", text, re.IGNORECASE)
            posted = ""
            if date_m:
                try:
                    posted = datetime.strptime(date_m.group(1), "%d %m %Y").strftime("%Y-%m-%d")
                except ValueError:
                    pass
            posted = posted or datetime.now().strftime("%Y-%m-%d")

            sector_m = re.search(r"Sector\s*:\s*(.+?)(?:Contract type|$)", text, re.IGNORECASE)
            sector = sector_m.group(1).strip() if sector_m else ""

            job_url = f"{BASE_URL}{href}"

            # Fetch JD from detail page
            jd_text = ""
            try:
                dr = session.get(job_url, timeout=20)
                if dr.status_code == 200:
                    dsoup = BeautifulSoup(dr.text, "lxml")
                    main = dsoup.find("main") or dsoup.find(id="main-content")
                    jd_text = html_to_text(str(main)) if main else ""
                time.sleep(random.uniform(0.3, 0.7))
            except Exception as e:
                print(f"    [WARN] Detail fetch failed for {slug}: {e}")

            batch.append({
                "job_id":           slug,
                "title":            title,
                "company_name":     "Michelin",
                "job_url":          job_url,
                "source_api_url":   SEARCH_URL,
                "business_unit":    sector,
                "raw_jd_text":      jd_text,
                "location_city":    city,
                "location_country": "India",
                "industry":         "Automotive / Tyre Manufacturing",
                "date_posted":      posted,
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "CXF/Astro",
            })

        jobs.extend(batch)
        india_on_page = len(batch)
        print(f"  Page {page}: {len(job_links)} jobs total, {india_on_page} India (total India: {len(jobs)})")

        if not job_links:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] page {page}: {e}")
        break

print(f"\n  Total Michelin India jobs: {len(jobs)}")
print("  IT roles are under 'IS&Digital' sector; finance/operations also included.")

df = save_results(jobs, "Michelin", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
