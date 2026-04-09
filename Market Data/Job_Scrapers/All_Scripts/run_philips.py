#!/usr/bin/env python3
"""Standalone runner for Philips India IT Job Scraper.
Uses the Workday REST API (philips.wd3.myworkdayjobs.com).
Filters: locationHierarchy1=India + jobFamilyGroup=Software/IT/AI/Security.

API verified 2026-04-02 against philips.wd3.myworkdayjobs.com/jobs-and-careers:
  POST https://philips.wd3.myworkdayjobs.com/wday/cxs/philips/jobs-and-careers/jobs
  Note: Philips uses locationHierarchy1 (not locationCountry) for country filter.

Facet IDs (verified 2026-04-02):
  India (locationHierarchy1):     6e1b2a934716103c2adde1d57e7700ea  (120 total India jobs)
  RD Software:                    94eec23a3cab01216af07777df6a8d29  (79 jobs)
  RD Systems:                     169c3da8f7270169c0ee692fbd324709  (55 jobs)
  SY Information Security:        40b79030b3e0100163f33cd03cff0000  (9 jobs)
  RD Artificial Intelligence:     58aeacb31cc0011e54561931bd325829  (7 jobs)
  IT Platforms:                   358cbd5a2fcc01e0783eb441a1012864  (3 jobs)
  SY Product Security:            a05309e84f810165f53b47218532188d  (3 jobs)
  Combined India+IT:              ~48 jobs
"""
import sys, time, random
from pathlib import Path
from datetime import datetime

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests

COMPANY    = "Philips"
OUTPUT_DIR = get_output_dir(COMPANY)

BASE_URL    = "https://philips.wd3.myworkdayjobs.com"
API_URL     = f"{BASE_URL}/wday/cxs/philips/jobs-and-careers/jobs"
CAREER_SITE = "jobs-and-careers"

INDIA_ID = "6e1b2a934716103c2adde1d57e7700ea"
IT_GROUP_IDS = [
    "94eec23a3cab01216af07777df6a8d29",  # RD Software
    "169c3da8f7270169c0ee692fbd324709",  # RD Systems
    "40b79030b3e0100163f33cd03cff0000",  # SY Information Security
    "58aeacb31cc0011e54561931bd325829",  # RD Artificial Intelligence
    "358cbd5a2fcc01e0783eb441a1012864",  # IT Platforms
    "a05309e84f810165f53b47218532188d",  # SY Product Security
]

MAX_JOBS        = 500
LIMIT_PER_PAGE  = 20

print("=" * 60)
print("PHILIPS INDIA IT JOB SCRAPER")
print("ATS: Workday (philips.wd3.myworkdayjobs.com/jobs-and-careers)")
print("Filters: India + Software/IT/AI/Security job families")
print("=" * 60)
print(f"Output directory: {OUTPUT_DIR}")

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"),
})

jobs = []
offset = 0
known_total = None

while offset < MAX_JOBS:
    payload = {
        "appliedFacets": {
            "locationHierarchy1": [INDIA_ID],
            "jobFamilyGroup":     IT_GROUP_IDS,
        },
        "limit": LIMIT_PER_PAGE,
        "offset": offset,
        "searchText": "",
    }
    try:
        resp = session.post(API_URL, json=payload, timeout=30)
        if resp.status_code != 200:
            print(f"  [ERROR] HTTP {resp.status_code} at offset {offset}")
            break

        data = resp.json()
        postings = data.get("jobPostings", [])
        page_total = data.get("total", 0)

        if known_total is None and page_total >= 0:
            known_total = page_total
            print(f"  Total India+IT jobs reported by API: {known_total}")

        if not postings:
            break

        print(f"  Page offset={offset}: {len(postings)} jobs")

        for jp in postings:
            external_path = jp.get("externalPath", "")
            jd_text, posted_on, job_location, job_req_id = "", "", "", ""

            if external_path:
                try:
                    detail_url = f"{BASE_URL}/wday/cxs/philips/{CAREER_SITE}/{external_path}"
                    dr = session.get(detail_url, timeout=20)
                    if dr.status_code == 200:
                        detail = dr.json()
                        job_info = detail.get("jobPostingInfo", {})
                        jd_html  = job_info.get("jobDescription", "")
                        jd_text  = html_to_text(jd_html)
                        posted_on    = job_info.get("postedOn", "")
                        job_location = job_info.get("location", "")
                        job_req_id   = job_info.get("jobReqId", "")
                        extra = job_info.get("additionalDescription", "")
                        if extra:
                            jd_text += "\n" + html_to_text(extra)
                    time.sleep(random.uniform(0.3, 0.8))
                except Exception as e:
                    print(f"    [WARN] Detail fetch failed for {external_path}: {e}")

            loc_text = jp.get("locationsText", "")
            city = loc_text.split("(")[0].strip() if loc_text else "India"
            if city and city[0].isdigit():
                city = job_location.split(",")[0].strip() if job_location else "India"

            bullet_fields = jp.get("bulletFields", [])
            job_id = job_req_id or (bullet_fields[0] if bullet_fields else external_path.split("/")[-1])
            business_unit = bullet_fields[1] if len(bullet_fields) > 1 else ""
            job_url = f"{BASE_URL}/en-US/{CAREER_SITE}/{external_path}" if external_path else ""

            jobs.append({
                "job_id":           str(job_id),
                "title":            jp.get("title", ""),
                "company_name":     "Philips",
                "job_url":          job_url,
                "source_api_url":   API_URL,
                "business_unit":    business_unit,
                "raw_jd_text":      jd_text,
                "location_city":    city,
                "location_country": "India",
                "industry":         "Healthcare Technology",
                "date_posted":      posted_on or datetime.now().strftime("%Y-%m-%d"),
                "is_active":        True,
                "salary_currency":  "INR",
                "source_platform":  "Workday",
            })

        offset += LIMIT_PER_PAGE
        if known_total and offset >= known_total:
            break
        time.sleep(random.uniform(0.5, 1.0))

    except Exception as e:
        print(f"  [ERROR] {e}")
        break

print(f"\n  Total Philips India+IT jobs: {len(jobs)}")

df = save_results(jobs, "Philips", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
