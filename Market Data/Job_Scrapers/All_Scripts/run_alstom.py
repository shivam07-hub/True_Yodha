#!/usr/bin/env python3
"""Standalone runner for Alstom India Job Scraper."""
import sys, time, random, re
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
from bs4 import BeautifulSoup
from datetime import datetime

COMPANY      = "Alstom"
COUNTRY_PARAM = "India"
BASE_URL     = "https://jobsearch.alstom.com"
SEARCH_PATH  = "/search/jobs"
PAGE_SIZE    = 25
MAX_JOBS     = 500
JD_FETCH_LIMIT = 50   # keep runs fast; increase if full JDs needed

OUTPUT_DIR = get_output_dir(COMPANY)
print(f"Output directory: {OUTPUT_DIR}")
print("=" * 60)
print("ALSTOM INDIA JOB SCRAPER")
print("ATS: SAP SuccessFactors / Jobs2Web (jobsearch.alstom.com)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def build_search_url(country_param, startrow=0):
    params = f"?startrow={startrow}&sortColumn=referencedate&sortDirection=desc"
    if country_param:
        params += f"&country={country_param}"
    return BASE_URL + SEARCH_PATH + params


def parse_job_cards(soup):
    jobs = []
    cards = (
        soup.select("tr.data-row")
        or soup.select("[class*='jobResultItem']")
        or soup.select("[class*='job-result']")
        or soup.select("li[class*='job']")
        or soup.select("article[class*='job']")
    )
    if not cards:
        job_links = (
            soup.select("a[href*='/job/']") or
            soup.select("a[href*='/jobs/']") or
            soup.select("a[href*='jobId']") or
            soup.select("a[href*='jobseqno']")
        )
        seen = set()
        for link in job_links:
            parent = link.parent
            if parent and id(parent) not in seen:
                cards.append(parent)
                seen.add(id(parent))

    for card in cards:
        title_el = (
            card.select_one("[class*='jobTitle'] a")
            or card.select_one("[class*='title'] a")
            or card.select_one("h2 a") or card.select_one("h3 a")
            or card.select_one("a[href*='/job/']")
            or card.select_one("a[href*='jobId']")
            or card.select_one("a")
        )
        title = title_el.get_text(strip=True) if title_el else ""
        if not is_valid_job_title(title):
            continue

        href = title_el.get("href", "") if title_el else ""
        job_url = href if href.startswith("http") else (BASE_URL + href if href else "")

        job_id = ""
        if href:
            id_match = re.search(r'[?&](?:jobId|jobseqno|id)=([^&]+)', href)
            if id_match:
                job_id = id_match.group(1)
            else:
                job_id = href.rstrip("/").split("/")[-1]
        if not job_id:
            job_id = card.get("data-job-id") or card.get("data-id") or str(abs(hash(title + job_url)))

        loc_el = (
            card.select_one("[class*='jobLocation']")
            or card.select_one("[class*='location']")
            or card.select_one("[class*='city']")
        )
        location_text = loc_el.get_text(strip=True) if loc_el else "India"
        city = location_text.split(",")[0].strip() if location_text else "India"

        dept_el = (
            card.select_one("[class*='department']")
            or card.select_one("[class*='category']")
            or card.select_one("[class*='function']")
        )
        department = dept_el.get_text(strip=True) if dept_el else ""

        date_el = (
            card.select_one("[class*='date']")
            or card.select_one("[class*='posted']")
            or card.select_one("time")
        )
        raw_date = date_el.get_text(strip=True) if date_el else ""
        date_posted = datetime.now().strftime("%Y-%m-%d")
        if raw_date:
            for fmt in ("%d %b %Y", "%B %d, %Y", "%Y-%m-%d"):
                try:
                    date_posted = datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue

        jobs.append({
            "job_id": str(job_id),
            "title": title,
            "company_name": "Alstom",
            "job_url": job_url,
            "source_api_url": BASE_URL + SEARCH_PATH,
            "business_unit": department,
            "raw_jd_text": card.get_text(" ", strip=True),
            "location_city": city,
            "location_country": "India",
            "industry": "Transportation / Railway Engineering",
            "date_posted": date_posted,
            "is_active": True,
            "salary_currency": "INR",
            "source_platform": "SAP SuccessFactors / Jobs2Web",
        })
    return jobs


def fetch_jd_detail(driver, url):
    if not url:
        return ""
    try:
        driver.get(url)
        time.sleep(random.uniform(2, 3))
        soup = BeautifulSoup(driver.page_source, "lxml")
        for sel in [
            "[class*='jobDescription']", "[class*='job-description']",
            "[class*='jd-content']",     "[class*='description']",
            "[id*='description']",       "[id*='jobDescription']",
            "article",                   "main",
        ]:
            el = soup.select_one(sel)
            if el and len(el.get_text(strip=True)) > 100:
                return el.get_text(" ", strip=True)
        body = soup.select_one("body")
        return body.get_text(" ", strip=True)[:6000] if body else ""
    except Exception as e:
        print(f"    [WARN] JD fetch failed for {url}: {e}")
        return ""


alstom_jobs = []
seen_ids = set()

driver = setup_selenium()
try:
    startrow = 0
    consecutive_empty = 0

    while startrow < MAX_JOBS:
        url = build_search_url(COUNTRY_PARAM, startrow)
        print(f"  Fetching startrow={startrow}: {url}")
        driver.get(url)

        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR,
                    "tr.data-row, [class*='jobResultItem'], [class*='job-result'], "
                    "a[href*='/job/'], a[href*='jobId'], a[href*='jobseqno']"
                ))
            )
        except Exception:
            print(f"  [WARN] Timeout waiting for cards at startrow={startrow}")
            time.sleep(5)

        soup = BeautifulSoup(driver.page_source, "lxml")
        page_jobs = parse_job_cards(soup)

        new_jobs = [j for j in page_jobs if j["job_id"] not in seen_ids]
        for j in new_jobs:
            seen_ids.add(j["job_id"])
        alstom_jobs.extend(new_jobs)
        print(f"    Got {len(new_jobs)} new jobs (total: {len(alstom_jobs)})")

        if not new_jobs:
            consecutive_empty += 1
            if consecutive_empty >= 2:
                print("  Stopping — 2 consecutive empty pages.")
                break
        else:
            consecutive_empty = 0

        next_link = soup.select_one(
            "a[class*='next'], a[aria-label*='Next'], a[aria-label*='next'], "
            "[class*='pagination'] a[href*='startrow']"
        )
        if not next_link and len(page_jobs) < PAGE_SIZE:
            print("  Last page reached.")
            break

        startrow += PAGE_SIZE
        time.sleep(random.uniform(1.5, 2.5))

    # Fetch full JDs
    if alstom_jobs:
        limit = min(len(alstom_jobs), JD_FETCH_LIMIT)
        print(f"\n  Fetching full JDs for {limit} jobs...")
        for i, job in enumerate(alstom_jobs[:limit]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 200:
                continue
            jd = fetch_jd_detail(driver, job["job_url"])
            if jd:
                alstom_jobs[i]["raw_jd_text"] = jd
            if (i + 1) % 10 == 0:
                print(f"    Fetched {i+1}/{limit} JDs")

except Exception as e:
    print(f"  [ERROR] {e}")
    import traceback; traceback.print_exc()
finally:
    driver.quit()

print(f"\nTotal Alstom India jobs scraped: {len(alstom_jobs)}")
df = save_results(alstom_jobs, "Alstom", OUTPUT_DIR)
if df is not None:
    cols = ["title", "location_city", "seniority_level", "business_unit", "job_url"]
    cols = [c for c in cols if c in df.columns]
    print(df[cols].head(10).to_string())
