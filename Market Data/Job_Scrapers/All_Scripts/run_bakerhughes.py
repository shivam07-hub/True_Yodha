#!/usr/bin/env python3
"""Standalone runner for Baker Hughes India IT Job Scraper.
Uses sitemap XML scraping (careers.bakerhughes.com).

LIMITATION: Baker Hughes careers site is protected by Imperva Incapsula WAF.
All direct API/HTML requests return an Incapsula challenge page, including:
  - https://careers.bakerhughes.com/global/en/search-results?qcountry=India
  - All GraphQL/REST API endpoints under /api/
  - Selenium (headless Chrome) is also blocked.

Fallback approach: Parse sitemap XMLs for India job URLs.
  Sitemaps verified 2026-04-02:
    https://careers.bakerhughes.com/global/en/sitemap1.xml  (580 URLs)
    https://careers.bakerhughes.com/global/en/sitemap2.xml  (271 URLs)
  India job URLs in sitemaps as of 2026-04-02: ~2 (sales roles, not IT)

NOTE: The user sees India IT jobs on the portal because their browser has
authenticated session cookies accepted by Incapsula. Programmatic scraping
is blocked without a real browser session established via CAPTCHA.
"""
import sys, time, random, re
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as ET

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup

COMPANY    = "Baker_Hughes"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL   = "https://careers.bakerhughes.com"
SITEMAP_BASE = f"{BASE_URL}/global/en"

SITEMAPS = [
    f"{SITEMAP_BASE}/sitemap1.xml",
    f"{SITEMAP_BASE}/sitemap2.xml",
]

print("=" * 60)
print("BAKER HUGHES INDIA IT JOB SCRAPER")
print("ATS: Phenom People (careers.bakerhughes.com)")
print("Status: Incapsula WAF blocks all API/HTML requests.")
print("Fallback: Parsing sitemap XMLs for India job URLs.")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
    "Accept": "text/xml,application/xml,text/html",
})

india_urls = []

for sitemap_url in SITEMAPS:
    try:
        r = session.get(sitemap_url, timeout=30)
        if r.status_code != 200:
            print(f"  [ERROR] HTTP {r.status_code}: {sitemap_url}")
            continue

        # Parse XML
        root = ET.fromstring(r.text)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [url.find("sm:loc", ns).text for url in root.findall("sm:url", ns)
                if url.find("sm:loc", ns) is not None]

        india_locs = [u for u in locs if "india" in u.lower() or "/in/" in u.lower()]
        print(f"  {sitemap_url.split('/')[-1]}: {len(locs)} URLs, {len(india_locs)} India")
        india_urls.extend(india_locs)

    except Exception as e:
        print(f"  [ERROR] {sitemap_url}: {e}")

print(f"  Total India job URLs in sitemaps: {len(india_urls)}")

jobs = []
for url in india_urls:
    # Extract job ID and title from URL
    # Format: /global/en/job/{job_id}/{title-slug}
    parts = url.rstrip("/").split("/")
    job_id = parts[-2] if len(parts) >= 2 and re.match(r"R\d+", parts[-2]) else parts[-1]
    slug = parts[-1]
    title = slug.replace("-", " ").title()

    # Try to fetch job detail (likely blocked, but attempt)
    jd_text = ""
    try:
        r = session.get(url, timeout=15)
        if r.status_code == 200 and "incapsula" not in r.text.lower():
            soup = BeautifulSoup(r.text, "lxml")
            main = soup.find("main") or soup.find("article")
            jd_text = html_to_text(str(main)) if main else ""
        time.sleep(random.uniform(0.5, 1.0))
    except Exception:
        pass

    jobs.append({
        "job_id":           job_id,
        "title":            title,
        "company_name":     "Baker Hughes",
        "job_url":          url,
        "source_api_url":   SITEMAP_BASE,
        "business_unit":    "",
        "raw_jd_text":      jd_text,
        "location_city":    "India",
        "location_country": "India",
        "industry":         "Energy / Oil & Gas Services",
        "date_posted":      datetime.now().strftime("%Y-%m-%d"),
        "is_active":        True,
        "salary_currency":  "INR",
        "source_platform":  "Phenom People",
    })

print(f"\n  Total Baker Hughes India jobs found: {len(jobs)}")
if not jobs:
    print("  [WARN] No India jobs in sitemaps. The careers portal requires a browser")
    print("  session accepted by Incapsula. Run manually at:")
    print("  https://careers.bakerhughes.com/global/en/search-results?qcountry=India")

df = save_results(jobs, "Baker_Hughes", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
