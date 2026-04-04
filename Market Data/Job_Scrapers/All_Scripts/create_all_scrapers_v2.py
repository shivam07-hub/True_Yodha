"""
Job Scraper Generator v2.2 - March 2026
Generates 28 Jupyter notebooks with WORKING scraping logic.

TCS and Infosys removed — both require account registration before viewing jobs.
Scrapers fetch broadly (no hardcoded India filter); pre-filter pipeline handles geo-narrowing.

Companies grouped by ATS platform:
  - Workday (11):       Novartis, Sanofi, Fidelity, Capgemini, HCL,
                        Salesforce, Wells Fargo, Mastercard, Eli Lilly, RTX, Accenture
  - SmartRecruiters (3): Syngenta, Continental, ServiceNow
  - Eightfold (2):      Morgan Stanley, American Express
  - Greenhouse (1):     Stripe
  - Avature (1):        Synopsys
  - Custom/API (10):    Apple, Microsoft, Google, Wipro, Cognizant,
                        Goldman Sachs, IBM, L'Oreal, Atlassian, MSCI

Run: python create_all_scrapers_v2.py
"""

import json
from pathlib import Path

# ============================================================
# Notebook builder helpers
# ============================================================
K = {
    "display_name": "Python 3 (ipykernel)",
    "language": "python",
    "name": "python3"
}
S = Path(__file__).resolve().parent

def nb(cells):
    return {
        "nbformat": 4, "nbformat_minor": 5,
        "metadata": {"kernelspec": K, "language_info": {"name": "python", "version": "3.10.0"}},
        "cells": cells,
    }

def c(src):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": src}

def m(src):
    return {"cell_type": "markdown", "metadata": {}, "source": src}

def write(fname, cells):
    with open(S / fname, "w") as f:
        json.dump(nb(cells), f, indent=1)
    print(f"Written: {fname}")

# ============================================================
# Common cells used by ALL notebooks
# ============================================================
INSTALL = "!pip install selenium webdriver-manager pandas openpyxl requests beautifulsoup4 lxml playwright -q"

IMPORT_UTILS = '''import sys, time, random, re
from pathlib import Path

# Add scripts dir to path so we can import scraper_utils
SCRIPTS_DIR = Path.home() / "Job_Scrapers" / "All_Scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from scraper_utils import *
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# ── LOCATION CONFIG ──────────────────────────────────────────────────────────
# Change to "" to scrape globally (all countries).
# The matching pipeline's pre-filter handles India-specific narrowing.
# Set to "India" here only if you want to reduce volume at scrape time.
LOCATION_FILTER = ""
COUNTRY_CODE   = ""  # e.g. "in" for SmartRecruiters country= param; "" = all
# ─────────────────────────────────────────────────────────────────────────────

print("Imports loaded. Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
print(f"Location filter: '{LOCATION_FILTER}' (empty = broad/global scraping)")
'''

def path_cell(company):
    return f'''COMPANY = "{company}"
OUTPUT_DIR = get_output_dir(COMPANY)
print(f"Output directory: {{OUTPUT_DIR}}")
'''

def save_cell(var_name, company_name):
    return f'''df_{var_name} = save_results({var_name}_jobs, "{company_name}", OUTPUT_DIR)
if df_{var_name} is not None:
    print(f"\\nSample jobs:")
    cols = ["title","location_city","seniority_level","business_unit","job_url"]
    cols = [c for c in cols if c in df_{var_name}.columns]
    print(df_{var_name}[cols].head(10).to_string())
'''

# ============================================================
# Helper: Selenium JD fetcher (used by many scrapers)
# ============================================================
SELENIUM_JD_FETCH = '''
def fetch_jd_selenium(driver, url, timeout=10):
    """Visit a job detail page and extract the JD text."""
    try:
        driver.get(url)
        time.sleep(random.uniform(2, 4))
        soup = BeautifulSoup(driver.page_source, "lxml")
        # Try common JD container selectors
        for sel in ["[class*='job-description']", "[class*='jd-info']", "[class*='description']",
                     "[class*='details']", "article", "main", ".content"]:
            el = soup.select_one(sel)
            if el and len(el.get_text(strip=True)) > 100:
                return el.get_text(" ", strip=True)
        # Fallback: get body text
        body = soup.select_one("body")
        return body.get_text(" ", strip=True)[:5000] if body else ""
    except Exception as e:
        print(f"    [WARN] JD fetch failed for {url}: {e}")
        return ""

def fetch_jd_requests(session, url):
    """Fetch a job detail page via requests and extract JD text."""
    try:
        resp = session.get(url, timeout=20)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            for sel in ["[class*='job-description']", "[class*='jd-info']", "[class*='description']",
                         "[class*='details']", "article", "main"]:
                el = soup.select_one(sel)
                if el and len(el.get_text(strip=True)) > 100:
                    return el.get_text(" ", strip=True)
            body = soup.select_one("body")
            return body.get_text(" ", strip=True)[:5000] if body else ""
    except:
        pass
    return ""
'''


# ============================================================
# WORKDAY SCRAPERS (API - verified working)
# ============================================================

NOVARTIS_SCRAPER = '''print("=" * 60)
print("NOVARTIS INDIA JOB SCRAPER")
print("ATS: Workday (novartis.wd3.myworkdayjobs.com)")
print("=" * 60)

novartis_jobs = scrape_workday(
    tenant="novartis",
    instance="wd3",
    career_site="Novartis_Careers",
    company_name="Novartis",
    industry="Pharmaceutical",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

SANOFI_SCRAPER = '''print("=" * 60)
print("SANOFI INDIA JOB SCRAPER")
print("ATS: Workday (sanofi.wd3.myworkdayjobs.com)")
print("=" * 60)

sanofi_jobs = scrape_workday(
    tenant="sanofi",
    instance="wd3",
    career_site="SanofiCareers",
    company_name="Sanofi",
    industry="Pharmaceutical",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

# Fallback: also try jobs.sanofi.com if Workday returns few results
if len(sanofi_jobs) < 5:
    print("\\n  Few results from Workday, trying jobs.sanofi.com fallback...")
    try:
        session = get_session()
        base = "https://jobs.sanofi.com/en/search-jobs/India"
        resp = session.get(base, timeout=20)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            cards = soup.select('#search-results-list a[href*="/en/job/"]')
            for card in cards:
                title_el = card.select_one("h2, h3, strong")
                if title_el:
                    title = title_el.get_text(strip=True)
                    href = card.get("href", "")
                    job_id = href.split("/")[-1] if href else str(len(sanofi_jobs))
                    sanofi_jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company_name": "Sanofi",
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": "India",
                        "industry": "Pharmaceutical",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "job_url": href if href.startswith("http") else f"https://jobs.sanofi.com{href}",
                        "business_unit": "",
                        "source_platform": "Sanofi fallback",
                    })
            print(f"  Fallback found {len(cards)} additional jobs")
    except Exception as e:
        print(f"  Fallback failed: {e}")
'''

FIDELITY_SCRAPER = '''print("=" * 60)
print("FIDELITY INVESTMENTS INDIA JOB SCRAPER")
print("ATS: Workday (fmr.wd1.myworkdayjobs.com)")
print("=" * 60)

fidelity_jobs = scrape_workday(
    tenant="fmr",
    instance="wd1",
    career_site="FidelityCareers",
    company_name="Fidelity Investments",
    industry="Financial Services",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

# Also try Fidelity International (FIL)
if len(fidelity_jobs) < 5:
    print("\\n  Also trying Fidelity International (FIL)...")
    fil_jobs = scrape_workday(
        tenant="fil",
        instance="wd3",
        career_site="001",
        company_name="Fidelity Investments",
        industry="Financial Services",
        location_filter=LOCATION_FILTER,
        max_jobs=200
    )
    fidelity_jobs.extend(fil_jobs)
'''

CAPGEMINI_SCRAPER = '''print("=" * 60)
print("CAPGEMINI INDIA JOB SCRAPER")
print("Primary: Workday API + Selenium fallback")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

capgemini_jobs = []

# Try Workday first (Capgemini uses Workday)
try:
    capgemini_jobs = scrape_workday(
        tenant="capgemini",
        instance="wd3",
        career_site="Global",
        company_name="Capgemini",
        industry="IT Services & Consulting",
        location_filter=LOCATION_FILTER,
        max_jobs=500
    )
except Exception as e:
    print(f"  Workday approach failed: {e}")

# Fallback: Selenium on capgemini.com/in-en/careers
if len(capgemini_jobs) < 5:
    print("\\n  Trying Selenium on capgemini.com careers...")
    driver = setup_selenium()
    try:
        url = "https://www.capgemini.com/in-en/careers/join-capgemini/job-search/?search_term=&country=in"
        driver.get(url)
        time.sleep(8)

        for page in range(10):
            soup = BeautifulSoup(driver.page_source, "lxml")
            cards = soup.select("article.job-result, .job-card, [class*='job-result'], [class*='job-listing']")
            if not cards:
                cards = soup.select("a[href*='/careers/'], a[href*='/job/']")

            for card in cards:
                title_el = card.select_one("h2, h3, h4, .job-title, [class*='title']")
                title = title_el.get_text(strip=True) if title_el else ""
                loc_el = card.select_one(".location, [class*='location'], [class*='city']")
                loc = loc_el.get_text(strip=True) if loc_el else "India"
                href = card.get("href", "") if card.name == "a" else ""
                if not href:
                    link = card.select_one("a[href]")
                    href = link.get("href", "") if link else ""

                if title and title not in [j["title"] for j in capgemini_jobs]:
                    capgemini_jobs.append({
                        "job_id": href.split("/")[-1] if href else str(len(capgemini_jobs)),
                        "title": title,
                        "company_name": "Capgemini",
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": loc.split(",")[0].strip(),
                        "industry": "IT Services & Consulting",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "job_url": href if href.startswith("http") else f"https://www.capgemini.com{href}" if href else "",
                        "business_unit": "",
                        "source_platform": "Capgemini Selenium fallback",
                    })

            try:
                next_btn = driver.find_element(By.CSS_SELECTOR, "a.next, [class*='next'], [rel='next']")
                driver.execute_script("arguments[0].click();", next_btn)
                time.sleep(3)
            except:
                break
    except Exception as e:
        print(f"  Selenium failed: {e}")
    finally:
        driver.quit()

print(f"Total Capgemini India jobs: {len(capgemini_jobs)}")
'''

HCL_SCRAPER = '''print("=" * 60)
print("HCL TECHNOLOGIES INDIA JOB SCRAPER")
print("Primary: Workday API + Selenium fallback")
print("=" * 60)

from selenium.webdriver.common.by import By

hcl_jobs = []

# Try Workday first
try:
    hcl_jobs = scrape_workday(
        tenant="hcltech",
        instance="wd3",
        career_site="HCLTech",
        company_name="HCL Technologies",
        industry="IT Services",
        location_filter=LOCATION_FILTER,
        max_jobs=500
    )
except Exception as e:
    print(f"  Workday approach failed: {e}")

# Fallback: Selenium on careers.hcltech.com
if len(hcl_jobs) < 5:
    print("\\n  Trying Selenium on careers.hcltech.com...")
    driver = setup_selenium()
    try:
        driver.get("https://careers.hcltech.com/jobs?location=India")
        time.sleep(8)
        soup = BeautifulSoup(driver.page_source, "lxml")

        cards = soup.select("[class*='job-card'], [class*='job-listing'], [class*='career-card'], .views-row, a[href*='/job']")
        for card in cards:
            title_el = card.select_one("h2, h3, h4, a, [class*='title']")
            title = title_el.get_text(strip=True) if title_el else ""
            loc_el = card.select_one("[class*='location'], [class*='city']")
            loc = loc_el.get_text(strip=True) if loc_el else "India"
            link = card.select_one("a[href]")
            href = link.get("href", "") if link else ""

            if title:
                hcl_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(hcl_jobs)),
                    "title": title,
                    "company_name": "HCL Technologies",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "IT Services",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": href if href.startswith("http") else f"https://careers.hcltech.com{href}" if href else "",
                    "business_unit": "",
                    "source_platform": "HCL Selenium fallback",
                })
    except Exception as e:
        print(f"  Selenium failed: {e}")
    finally:
        driver.quit()

print(f"Total HCL India jobs: {len(hcl_jobs)}")
'''

# ============================================================
# SMARTRECRUITERS SCRAPERS (API - verified working)
# ============================================================

SYNGENTA_SCRAPER = '''print("=" * 60)
print("SYNGENTA INDIA JOB SCRAPER")
print("ATS: SmartRecruiters (api.smartrecruiters.com)")
print("=" * 60)

syngenta_jobs = scrape_smartrecruiters(
    company_id="SyngentaGroup",
    company_name="Syngenta",
    industry="Agriculture / Agrochemical",
    country=COUNTRY_CODE,
    max_jobs=500
)
'''

# ============================================================
# EIGHTFOLD SCRAPERS (API)
# ============================================================

MORGAN_STANLEY_SCRAPER = '''print("=" * 60)
print("MORGAN STANLEY INDIA JOB SCRAPER")
print("ATS: Eightfold AI (morganstanley.eightfold.ai)")
print("=" * 60)

morgan_stanley_jobs = scrape_eightfold(
    domain="morganstanley.eightfold.ai",
    company_name="Morgan Stanley",
    industry="Financial Services / Investment Banking",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ============================================================
# APPLE - Confirmed DOM structure via browser testing
# ============================================================

APPLE_SCRAPER = '''print("=" * 60)
print("APPLE INDIA JOB SCRAPER")
print("Source: jobs.apple.com/en-in/search?location=india-INDC")
print("DOM: div.job-list-item > a.link-inline[href*='/details/']")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

apple_jobs = []
driver = setup_selenium()

try:
    base_url = "https://jobs.apple.com/en-in/search?location=india-INDC"
    driver.get(base_url)
    time.sleep(8)

    # Wait for job cards to render
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.job-list-item"))
        )
    except:
        print("  Waiting longer for Apple jobs page to load...")
        time.sleep(10)

    page = 1
    while page <= 15:
        soup = BeautifulSoup(driver.page_source, "lxml")

        # Apple uses div.job-list-item for each job card (confirmed Mar 2026)
        cards = soup.select("div.job-list-item")
        if not cards and page == 1:
            # Try alternate selectors
            cards = soup.select("a[href*='/en-in/details/']")
            cards = [c.parent for c in cards if c.parent]

        if not cards:
            print(f"  Page {page}: No job cards found")
            if page == 1:
                print(f"  Page title: {driver.title}")
            break

        new_jobs = 0
        for card in cards:
            # Title: a.link-inline with href to /details/
            title_link = card.select_one("a.link-inline[href*='/details/'], a[href*='/details/']")
            if not title_link:
                continue
            title = title_link.get_text(strip=True)
            href = title_link.get("href", "")

            # Extract job ID from URL: /en-in/details/200314122/job-slug
            job_id_match = re.search(r"/details/(\\d+)/", href)
            job_id = job_id_match.group(1) if job_id_match else href.split("/")[-1]

            # Team name: span.team-name
            team_el = card.select_one("span.team-name")
            team = team_el.get_text(strip=True) if team_el else ""

            # Posted date: span.job-posted-date
            date_el = card.select_one("span.job-posted-date")
            date_text = date_el.get_text(strip=True) if date_el else ""
            # Parse date like "21 Mar 2026" -> "2026-03-21"
            posted_date = datetime.now().strftime("%Y-%m-%d")
            if date_text:
                try:
                    posted_date = datetime.strptime(date_text, "%d %b %Y").strftime("%Y-%m-%d")
                except:
                    pass

            # Location: look for text after "Location"
            loc_spans = card.select("span")
            loc = "India"
            for span in loc_spans:
                text = span.get_text(strip=True)
                if any(city in text for city in ["Bengaluru", "Mumbai", "Hyderabad", "Pune",
                       "Chennai", "Delhi", "Gurugram", "Noida", "Kolkata", "India"]):
                    loc = text
                    break

            if title and title not in [j["title"] for j in apple_jobs]:
                apple_jobs.append({
                    "job_id": job_id,
                    "title": title,
                    "company_name": "Apple",
                    "raw_jd_text": "",  # Will fetch individually below
                    "location_city": loc.split(",")[0].strip().replace("Various locations within ", ""),
                    "industry": "Technology",
                    "date_posted": posted_date,
                    "is_active": True,
                    "job_url": f"https://jobs.apple.com{href}",
                    "business_unit": team,
                    "source_platform": "Apple Jobs",
                })
                new_jobs += 1

        print(f"  Page {page}: {new_jobs} new jobs (total: {len(apple_jobs)})")

        if new_jobs == 0:
            break

        # Click Next page button
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR,
                "button[aria-label='Next Page']:not([disabled])")
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(4)
            page += 1
        except:
            break

    # Fetch JD for first N jobs (limit to avoid being blocked)
    print(f"\\n  Fetching JD details for up to 50 jobs...")
    for i, job in enumerate(apple_jobs[:50]):
        if job["raw_jd_text"]:
            continue
        detail_url = f"https://jobs.apple.com/en-in/details/{job['job_id']}"
        jd = fetch_jd_selenium(driver, detail_url)
        apple_jobs[i]["raw_jd_text"] = jd
        if (i + 1) % 10 == 0:
            print(f"    Fetched {i+1}/{min(50, len(apple_jobs))} JDs")

except Exception as e:
    print(f"  Error: {e}")
    import traceback; traceback.print_exc()
finally:
    driver.quit()

print(f"Total Apple India jobs: {len(apple_jobs)}")
has_jd = sum(1 for j in apple_jobs if j.get("raw_jd_text") and len(j["raw_jd_text"]) > 50)
print(f"  Jobs with JD: {has_jd}/{len(apple_jobs)}")
'''

# ============================================================
# MICROSOFT - GCS Services API (confirmed endpoint)
# ============================================================

MICROSOFT_SCRAPER = '''print("=" * 60)
print("MICROSOFT INDIA JOB SCRAPER")
print("Source: gcsservices.careers.microsoft.com/search/api/v1/search")
print("=" * 60)

microsoft_jobs = []
session = get_session()
session.headers.update({
    "Accept": "application/json",
    "Content-Type": "application/json",
})

# Microsoft uses the GCS Services API (confirmed Mar 2026)
api_url = "https://gcsservices.careers.microsoft.com/search/api/v1/search"

print("  Using Microsoft GCS Services API...")
page = 1
max_retries = 3

while len(microsoft_jobs) < 1000:
    params = {
        "l": "en_us",
        "pg": page,
        "pgSz": 20,
        "o": "Relevance",
        "flt": "true",
        "loc": "India",
    }

    success = False
    for attempt in range(max_retries):
        try:
            resp = session.get(api_url, params=params, timeout=30)
            if resp.status_code == 200:
                success = True
                break
            elif resp.status_code == 502:
                print(f"  API returned 502 (attempt {attempt+1}), retrying...")
                time.sleep(5)
            else:
                print(f"  API returned {resp.status_code}")
                break
        except Exception as e:
            print(f"  Request error (attempt {attempt+1}): {e}")
            time.sleep(3)

    if not success:
        break

    try:
        data = resp.json()
        result = data.get("operationResult", {}).get("result", {})
        jobs_list = result.get("jobs", [])
        total = result.get("totalJobs", 0)

        if not jobs_list:
            break

        print(f"  Page {page}: {len(jobs_list)} jobs (total available: {total})")

        for job in jobs_list:
            props = job.get("properties", job)
            title = props.get("title", job.get("title", ""))
            loc = props.get("primaryLocation", props.get("location", "India"))
            city = loc.split(",")[0].strip() if loc else "India"
            jd = props.get("description", "")

            microsoft_jobs.append({
                "job_id": str(props.get("jobId", job.get("jobId", len(microsoft_jobs)))),
                "title": title,
                "company_name": "Microsoft",
                "raw_jd_text": html_to_text(jd),
                "location_city": city,
                "industry": "Technology",
                "date_posted": str(props.get("datePosted", props.get("postingDate",
                    datetime.now().strftime("%Y-%m-%d"))))[:10],
                "is_active": True,
                "job_url": f"https://jobs.careers.microsoft.com/global/en/job/{props.get('jobId', '')}",
                "business_unit": props.get("category", props.get("discipline", "")),
                "source_platform": "Microsoft GCS API",
            })

        if len(jobs_list) < 20 or page * 20 >= total:
            break
        page += 1
        time.sleep(random.uniform(0.5, 1.5))

    except Exception as e:
        print(f"  Parse error: {e}")
        break

# Selenium fallback if API fails
if len(microsoft_jobs) < 5:
    print("\\n  API failed, trying Selenium on jobs.careers.microsoft.com...")
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    driver = setup_selenium()
    try:
        driver.get("https://jobs.careers.microsoft.com/global/en/search?lc=India&l=en_us&pg=1&pgSz=20&o=Relevance")
        time.sleep(10)

        for pg in range(5):
            soup = BeautifulSoup(driver.page_source, "lxml")
            cards = soup.select("[class*='ms-List-cell'], [class*='job-card'], [role='listitem']")
            if not cards:
                cards = soup.select("a[href*='/job/'], [data-automation-id*='job']")

            for card in cards:
                title_el = card.select_one("h2, h3, [class*='title'], a")
                title = title_el.get_text(strip=True) if title_el else ""
                loc_el = card.select_one("[class*='location'], [class*='city']")
                loc = loc_el.get_text(strip=True) if loc_el else "India"

                if title and len(title) > 3 and title not in [j["title"] for j in microsoft_jobs]:
                    microsoft_jobs.append({
                        "job_id": str(len(microsoft_jobs)),
                        "title": title,
                        "company_name": "Microsoft",
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": loc.split(",")[0].strip(),
                        "industry": "Technology",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "job_url": "",
                        "business_unit": "",
                        "source_platform": "Selenium",
                    })

            try:
                next_btn = driver.find_element(By.CSS_SELECTOR, "button[aria-label='Next'], [class*='next']")
                driver.execute_script("arguments[0].click();", next_btn)
                time.sleep(4)
            except:
                break
    except Exception as e:
        print(f"  Selenium error: {e}")
    finally:
        driver.quit()

print(f"Total Microsoft India jobs: {len(microsoft_jobs)}")
'''

# ============================================================
# GOOGLE - Selenium (no public API available)
# ============================================================

GOOGLE_SCRAPER = '''print("=" * 60)
print("GOOGLE INDIA JOB SCRAPER")
print("Source: www.google.com/about/careers/applications/jobs/results")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

google_jobs = []
driver = setup_selenium()

try:
    url = "https://www.google.com/about/careers/applications/jobs/results/?location=India"
    driver.get(url)
    time.sleep(10)

    # Wait for results to render (Google uses heavy JS)
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[class*='lLd3Je'], li[class*='sMn82b'], [data-id]"))
        )
    except:
        print("  Waiting longer for Google careers to load...")
        time.sleep(10)

    # Scroll to load more jobs (infinite scroll)
    prev_count = 0
    for scroll in range(30):
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)

        soup = BeautifulSoup(driver.page_source, "lxml")

        # Google uses specific class names for job cards
        cards = soup.select("li[class*='lLd3Je'], li[class*='sMn82b']")
        if not cards:
            cards = soup.select("[data-id], li.result, [class*='job-result']")

        if len(cards) == prev_count and scroll > 3:
            break  # No new results loaded
        prev_count = len(cards)

        if scroll % 5 == 0:
            print(f"  Scroll {scroll+1}: {len(cards)} jobs found so far")

    # Now parse all visible cards
    soup = BeautifulSoup(driver.page_source, "lxml")

    # Google's class names change with every build — use href patterns instead
    # Primary: any anchor pointing to a Google Careers job result page
    job_anchors = soup.select(
        "a[href*='/about/careers/applications/jobs/results/'], "
        "a[href*='/careers/applications/jobs/results/']"
    )

    # Deduplicate by href and build cards from anchor parents
    seen_hrefs = set()
    cards = []
    for a in job_anchors:
        h = a.get("href", "")
        if h and h not in seen_hrefs:
            seen_hrefs.add(h)
            cards.append((a, h))

    # Fallback to old class-based selectors if anchor approach gets nothing
    if not cards:
        for card in soup.select("li[class*='lLd3Je'], li[class*='sMn82b'], [data-id]"):
            link = card.select_one("a[href]")
            h = link.get("href", "") if link else ""
            if h not in seen_hrefs:
                seen_hrefs.add(h)
                cards.append((link or card, h))

    for anchor, href in cards:
        # Walk up to find the card container
        card = anchor.parent or anchor

        title_el = anchor  # The anchor itself usually contains the title
        title = title_el.get_text(strip=True)
        if not title:
            title_el = card.select_one("h3, h2, [class*='QJPWVe'], [class*='title']")
            title = title_el.get_text(strip=True) if title_el else ""

        loc_el = card.select_one("[class*='r0wTof'], [class*='location'], [class*='city']")
        loc = loc_el.get_text(strip=True) if loc_el else "India"

        # Extract job ID from URL: /jobs/results/12345678901-title-slug
        job_id_match = re.search(r"/jobs/results/([\\d]+)", href)
        job_id = job_id_match.group(1) if job_id_match else href.split("/")[-1]

        # Build canonical job URL — use the full href so the link goes to the right page
        job_url = href if href.startswith("http") else f"https://www.google.com{href}" if href else ""

        if title and title not in [j["title"] for j in google_jobs]:
            google_jobs.append({
                "job_id": str(job_id),
                "title": title,
                "company_name": "Google",
                "raw_jd_text": card.get_text(" ", strip=True),
                "location_city": loc.split(",")[0].strip(),
                "industry": "Technology",
                "date_posted": datetime.now().strftime("%Y-%m-%d"),
                "is_active": True,
                "job_url": job_url,
                "business_unit": "",
                "source_platform": "Google Careers",
            })

    print(f"  Found {len(google_jobs)} total Google India jobs")

    # Fetch JD for first N jobs — use each job's own stored URL (no scope bug)
    if google_jobs:
        print(f"  Fetching JD details for up to 30 jobs...")
        for i, job in enumerate(google_jobs[:30]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 200:
                continue
            jd_url = job["job_url"]  # use the URL we already stored — correct per job
            if not jd_url:
                jd_url = f"https://www.google.com/about/careers/applications/jobs/results/{job['job_id']}"
            jd = fetch_jd_selenium(driver, jd_url)
            if jd:
                google_jobs[i]["raw_jd_text"] = jd
            if (i + 1) % 10 == 0:
                print(f"    Fetched {i+1}/{min(30, len(google_jobs))} JDs")

except Exception as e:
    print(f"  Error: {e}")
    import traceback; traceback.print_exc()
finally:
    driver.quit()

print(f"Total Google India jobs: {len(google_jobs)}")
'''

# ============================================================
# TCS - iBegin portal + Selenium
# ============================================================

TCS_SCRAPER = '''print("=" * 60)
print("TCS INDIA JOB SCRAPER")
print("Source: ibegin.tcs.com + tcs.com/careers")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

tcs_jobs = []

# Strategy 1: iBegin portal (for experienced professionals)
driver = setup_selenium()
try:
    driver.get("https://ibegin.tcs.com/iBegin/jobs/search")
    time.sleep(12)

    # Try setting location to India if there's a filter
    try:
        loc_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='location'], input[name*='location'], input[type='search']")
        loc_input.clear()
        loc_input.send_keys("India")
        time.sleep(3)
    except:
        pass

    soup = BeautifulSoup(driver.page_source, "lxml")

    # Exclude nav, header, footer elements from search
    for unwanted in soup.select("nav, header, footer, [role='navigation'], [class*='menu'], [class*='nav']"):
        unwanted.decompose()

    # Try multiple selector strategies for actual job cards
    cards = soup.select("[class*='job-card'], [class*='job-listing'], [class*='search-result']")
    if not cards:
        cards = soup.select("table.job-results tr, table tr[class*='job']")
    if not cards:
        # Look for links that point to job detail pages
        job_links = soup.select("a[href*='/job/'], a[href*='/iBegin/jobs/']")
        cards = list(set(link.parent for link in job_links if link.parent and link.parent.name not in ("nav", "header", "footer")))

    for card in cards:
        title_el = card.select_one("h2, h3, h4, td:first-child a, [class*='title'] a, a[href*='/job/']")
        title = title_el.get_text(strip=True) if title_el else ""
        loc_el = card.select_one("[class*='location'], [class*='city'], td:nth-child(2)")
        loc = loc_el.get_text(strip=True) if loc_el else "India"

        # Validate: must be a real job title, not nav/UI text
        if is_valid_job_title(title):
            link = card.select_one("a[href]")
            href = link.get("href", "") if link else ""
            tcs_jobs.append({
                "job_id": href.split("/")[-1] if href else str(len(tcs_jobs)),
                "title": title,
                "company_name": "TCS",
                "raw_jd_text": "",
                "location_city": loc.split(",")[0].strip(),
                "industry": "IT Services",
                "date_posted": datetime.now().strftime("%Y-%m-%d"),
                "is_active": True,
                "job_url": href if href.startswith("http") else f"https://ibegin.tcs.com{href}" if href else "",
                "business_unit": "",
                "source_platform": "TCS iBegin",
            })

    print(f"  iBegin portal: {len(tcs_jobs)} valid jobs found")

except Exception as e:
    print(f"  iBegin error: {e}")
finally:
    driver.quit()

# Strategy 2: TCS lateral hiring page
if len(tcs_jobs) < 5:
    print("\\n  Trying tcs.com/careers/india/lateral-hiring...")
    driver = setup_selenium()
    try:
        driver.get("https://www.tcs.com/careers/india/lateral-hiring")
        time.sleep(8)
        soup = BeautifulSoup(driver.page_source, "lxml")

        # Remove nav/footer
        for unwanted in soup.select("nav, header, footer, [role=\\'navigation\\']"):
            unwanted.decompose()

        # Look for job role cards/links
        cards = soup.select("[class*=\\'job\\'], [class*=\\'role\\'], [class*=\\'card\\']")
        if not cards:
            cards = soup.select("a[href*=\\'/careers/india/\\']")
            cards = [c.parent for c in cards if c.parent]

        for card in cards:
            title_el = card.select_one("h2, h3, h4, a, [class*=\\'title\\']")
            title = title_el.get_text(strip=True) if title_el else ""
            if is_valid_job_title(title) and title not in [j["title"] for j in tcs_jobs]:
                link = card.select_one("a[href]")
                href = link.get("href", "") if link else ""
                tcs_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(tcs_jobs)),
                    "title": title,
                    "company_name": "TCS",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": "India",
                    "industry": "IT Services",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": href if href.startswith("http") else f"https://www.tcs.com{href}" if href else "",
                    "business_unit": "",
                    "source_platform": "TCS Careers",
                })
    except Exception as e:
        print(f"  TCS careers error: {e}")
    finally:
        driver.quit()

# Fetch JDs for found jobs
if tcs_jobs:
    print(f"\\n  Fetching JD details for up to 30 jobs...")
    driver = setup_selenium()
    try:
        for i, job in enumerate(tcs_jobs[:30]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
                continue
            if job["job_url"]:
                jd = fetch_jd_selenium(driver, job["job_url"])
                if jd:
                    tcs_jobs[i]["raw_jd_text"] = jd
            if (i + 1) % 10 == 0:
                print(f"    Fetched {i+1}/{min(30, len(tcs_jobs))} JDs")
    except Exception as e:
        print(f"  JD fetch error: {e}")
    finally:
        driver.quit()

print(f"Total TCS India jobs: {len(tcs_jobs)}")
'''

# ============================================================
# INFOSYS - career.infosys.com
# ============================================================

INFOSYS_SCRAPER = '''print("=" * 60)
print("INFOSYS INDIA JOB SCRAPER")
print("Source: career.infosys.com (Angular SPA)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

infosys_jobs = []

# Strategy 1: Try intercepting the XHR API that the Angular SPA calls
session = get_session()
try:
    # Common Infosys career API patterns
    api_urls = [
        "https://career.infosys.com/api/joblist?location=India&limit=100",
        "https://career.infosys.com/api/jobs?country=India&limit=100",
    ]
    for api_url in api_urls:
        try:
            resp = session.get(api_url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                jobs_list = data if isinstance(data, list) else data.get("jobs", data.get("data", data.get("results", [])))
                if jobs_list and len(jobs_list) > 0:
                    print(f"  API found at {api_url}: {len(jobs_list)} jobs")
                    for j in jobs_list:
                        title = j.get("title", j.get("jobTitle", j.get("name", "")))
                        if is_valid_job_title(title):
                            ref = j.get("jobReferenceCode", j.get("id", j.get("reqId", "")))
                            infosys_jobs.append({
                                "job_id": str(ref),
                                "title": title,
                                "company_name": "Infosys",
                                "raw_jd_text": j.get("description", j.get("jd", "")),
                                "location_city": j.get("location", j.get("city", "India")),
                                "industry": "IT Services",
                                "date_posted": j.get("postedDate", datetime.now().strftime("%Y-%m-%d"))[:10],
                                "is_active": True,
                                "job_url": f"https://career.infosys.com/jobdesc?jobReferenceCode={ref}" if ref else "",
                                "business_unit": j.get("department", j.get("category", "")),
                                "source_platform": "Infosys API",
                            })
                    break
        except:
            continue
except Exception as e:
    print(f"  API discovery: {e}")

# Strategy 2: Selenium with careful element targeting
if len(infosys_jobs) < 5:
    print("  Using Selenium on career.infosys.com/joblist...")
    driver = setup_selenium()
    try:
        driver.get("https://career.infosys.com/joblist")
        time.sleep(12)

        # Wait for Angular to render
        try:
            WebDriverWait(driver, 25).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='jobdesc'], a[href*='jobReferenceCode']"))
            )
        except:
            time.sleep(8)

        for page in range(10):
            soup = BeautifulSoup(driver.page_source, "lxml")

            # Remove nav/header/footer to avoid grabbing UI text
            for unwanted in soup.select("nav, header, footer, [role='navigation'], [class*='menu'], [class*='filter'], [class*='pagination-text']"):
                unwanted.decompose()

            # Primary: find links to job description pages
            job_links = soup.select("a[href*='jobdesc'], a[href*='jobReferenceCode']")

            new_count = 0
            for link in job_links:
                title = link.get_text(strip=True)
                href = link.get("href", "")

                # Extract ref code from URL
                ref_match = re.search(r"jobReferenceCode=([\\w-]+)", href)
                ref_code = ref_match.group(1) if ref_match else href.split("/")[-1]

                # Get parent card for location
                card = link.parent
                if card:
                    loc_el = card.select_one("[class*='location'], [class*='city'], span")
                    loc = loc_el.get_text(strip=True) if loc_el else "India"
                else:
                    loc = "India"

                if is_valid_job_title(title) and title not in [j["title"] for j in infosys_jobs]:
                    full_url = href if href.startswith("http") else f"https://career.infosys.com{href}" if href else ""
                    infosys_jobs.append({
                        "job_id": ref_code,
                        "title": title,
                        "company_name": "Infosys",
                        "raw_jd_text": "",
                        "location_city": loc.split(",")[0].strip() if loc else "India",
                        "industry": "IT Services",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "job_url": full_url,
                        "business_unit": "",
                        "source_platform": "Infosys Selenium",
                    })
                    new_count += 1

            print(f"  Page {page+1}: {new_count} new jobs (total: {len(infosys_jobs)})")
            if new_count == 0 and page > 0:
                break

            # Try next page
            try:
                next_btn = driver.find_element(By.CSS_SELECTOR, "a[aria-label*='Next'], a[aria-label*='next'], button[aria-label*='Next']")
                driver.execute_script("arguments[0].click();", next_btn)
                time.sleep(5)
            except:
                break

        # Fetch JDs for found jobs
        if infosys_jobs:
            print(f"\\n  Fetching JD details for up to 40 jobs...")
            for i, job in enumerate(infosys_jobs[:40]):
                if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
                    continue
                if job["job_url"]:
                    jd = fetch_jd_selenium(driver, job["job_url"])
                    if jd:
                        infosys_jobs[i]["raw_jd_text"] = jd
                if (i + 1) % 10 == 0:
                    print(f"    Fetched {i+1}/{min(40, len(infosys_jobs))} JDs")

    except Exception as e:
        print(f"  Selenium error: {e}")
        import traceback; traceback.print_exc()
    finally:
        driver.quit()

print(f"Total Infosys India jobs: {len(infosys_jobs)}")
'''

# ============================================================
# WIPRO - careers.wipro.com
# ============================================================

WIPRO_SCRAPER = '''print("=" * 60)
print("WIPRO INDIA JOB SCRAPER")
print("Source: careers.wipro.com (Radancy/Jobs2Web platform)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

wipro_jobs = []

# Wipro uses Radancy/Jobs2Web — URL pattern: /job/TITLE/JOBID-en_US/
# Strategy 1: Try the search results page directly
driver = setup_selenium()
try:
    # Use the search page with India location
    driver.get("https://careers.wipro.com/search/?q=&location=India")
    time.sleep(10)

    # Wait for job listings to render
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*=\\'/job/\\']"))
        )
    except:
        print("  Waiting longer...")
        time.sleep(8)
        # Try alternate URL
        driver.get("https://careers.wipro.com/viewalljobs/")
        time.sleep(10)

    for page in range(15):
        soup = BeautifulSoup(driver.page_source, "lxml")

        # Remove nav/header/footer
        for unwanted in soup.select("nav, header, footer, [role=\\'navigation\\'], [class*=\\'nav-\\'], [class*=\\'menu\\']"):
            unwanted.decompose()

        # Primary selector: links to /job/ pages (Radancy pattern)
        job_links = soup.select("a[href*=\\'/job/\\'][href*=\\'-en_US\\']")
        if not job_links:
            job_links = soup.select("a[href*=\\'/job/\\']")

        new_count = 0
        for link in job_links:
            title = link.get_text(strip=True)
            href = link.get("href", "")

            # Extract job ID from URL pattern: /job/TITLE/JOBID-en_US/
            job_id_match = re.search(r"/job/[^/]+/(\\d+)", href)
            job_id = job_id_match.group(1) if job_id_match else href.split("/")[-2] if "/" in href else str(len(wipro_jobs))

            # Get parent card for location
            card = link.parent
            loc = "India"
            if card:
                loc_el = card.select_one("[class*=\\'location\\'], [class*=\\'city\\'], span[class*=\\'loc\\']")
                if loc_el:
                    loc = loc_el.get_text(strip=True)

            if is_valid_job_title(title) and title not in [j["title"] for j in wipro_jobs]:
                full_url = href if href.startswith("http") else f"https://careers.wipro.com{href}" if href else ""
                wipro_jobs.append({
                    "job_id": str(job_id),
                    "title": title,
                    "company_name": "Wipro",
                    "raw_jd_text": "",
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "IT Services",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": full_url,
                    "business_unit": "",
                    "source_platform": "Wipro Radancy",
                })
                new_count += 1

        print(f"  Page {page+1}: {new_count} new jobs (total: {len(wipro_jobs)})")
        if new_count == 0 and page > 0:
            break

        # Try pagination
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, "a[aria-label*=\\'Next\\'], a[aria-label*=\\'next\\'], [class*=\\'next\\'] a, a.next-btn")
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(4)
        except:
            break

    # Fetch JDs for found jobs
    if wipro_jobs:
        print(f"\\n  Fetching JD details for up to 40 jobs...")
        for i, job in enumerate(wipro_jobs[:40]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
                continue
            if job["job_url"]:
                jd = fetch_jd_selenium(driver, job["job_url"])
                if jd:
                    wipro_jobs[i]["raw_jd_text"] = jd
            if (i + 1) % 10 == 0:
                print(f"    Fetched {i+1}/{min(40, len(wipro_jobs))} JDs")

except Exception as e:
    print(f"  Error: {e}")
    import traceback; traceback.print_exc()
finally:
    driver.quit()

print(f"Total Wipro India jobs: {len(wipro_jobs)}")
'''

# ============================================================
# COGNIZANT - RSS feed + Selenium fallback
# ============================================================

COGNIZANT_SCRAPER = '''print("=" * 60)
print("COGNIZANT INDIA JOB SCRAPER")
print("Source: careers.cognizant.com/india-en/jobs (XML feed)")
print("=" * 60)

cognizant_jobs = []
session = get_session()

# XML feed — uses <job> elements (NOT <item> like standard RSS)
try:
    xml_url = "https://careers.cognizant.com/india-en/jobs/xml/?rss=true"
    print(f"  Fetching XML feed: {xml_url}")
    resp = session.get(xml_url, timeout=30)
    if resp.status_code == 200:
        soup = BeautifulSoup(resp.text, "xml")
        # Cognizant XML uses <job> tags, not <item>
        jobs_xml = soup.find_all("job")
        if not jobs_xml:
            # Fallback: try <item> in case format changed
            jobs_xml = soup.find_all("item")
        print(f"  XML feed returned {len(jobs_xml)} job entries")

        for job_el in jobs_xml:
            title = job_el.find("title")
            title = title.get_text(strip=True) if title else ""
            url_el = job_el.find("url")
            link = url_el.get_text(strip=True) if url_el else ""
            if not link:
                link_el = job_el.find("link")
                link = link_el.get_text(strip=True) if link_el else ""
            desc = job_el.find("description")
            desc = desc.get_text(strip=True) if desc else ""
            date_el = job_el.find("date")
            pub_date = date_el.get_text(strip=True) if date_el else ""
            req_id = job_el.find("requisitionid")
            req_id = req_id.get_text(strip=True) if req_id else ""
            city_el = job_el.find("city")
            city = city_el.get_text(strip=True) if city_el else ""
            country_el = job_el.find("country")
            country = country_el.get_text(strip=True) if country_el else ""
            category_el = job_el.find("category")
            category = category_el.get_text(strip=True) if category_el else ""
            remote_el = job_el.find("remotetype")
            remote_type = remote_el.get_text(strip=True) if remote_el else ""

            # Filter: only India jobs
            if country.lower() != "india":
                continue

            if title and is_valid_job_title(title):
                cognizant_jobs.append({
                    "job_id": req_id or (link.split("/")[-1] if link else str(len(cognizant_jobs))),
                    "title": title,
                    "company_name": "Cognizant",
                    "raw_jd_text": html_to_text(desc),
                    "location_city": city if city else "India",
                    "industry": "IT Services & Consulting",
                    "date_posted": pub_date[:10] if pub_date and len(pub_date) >= 10 else datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": link,
                    "business_unit": category,
                    "work_mode": "hybrid" if "hybrid" in remote_type.lower() else ("remote" if "remote" in remote_type.lower() else "onsite"),
                    "source_platform": "Cognizant XML Feed",
                })
        print(f"  India jobs after filtering: {len(cognizant_jobs)}")
    else:
        print(f"  XML feed returned HTTP {resp.status_code}")
except Exception as e:
    print(f"  XML feed failed: {e}")

# Selenium fallback if XML returned too few
if len(cognizant_jobs) < 5:
    print("  Trying Selenium on careers.cognizant.com...")
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    driver = setup_selenium()
    try:
        driver.get("https://careers.cognizant.com/india-en/jobs/")
        time.sleep(10)

        # Wait for job cards to render
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[class*=\\'job\\'], [class*=\\'search-result\\'], [data-ph-at-id]"))
            )
        except:
            time.sleep(5)

        soup = BeautifulSoup(driver.page_source, "lxml")
        # Try multiple selector strategies
        cards = soup.select("[data-ph-at-id*=\\'job\\'], [class*=\\'job-card\\'], [class*=\\'search-result-item\\'], li[class*=\\'job\\']")
        if not cards:
            cards = soup.select("a[href*=\\'/job/\\']")
            cards = [c.parent for c in cards if c.parent and c.parent.name != "nav"]

        for card in cards:
            title_el = card.select_one("h2, h3, h4, [class*=\\'title\\'], a[href*=\\'/job/\\']")
            title = title_el.get_text(strip=True) if title_el else ""
            loc_el = card.select_one("[class*=\\'location\\'], [class*=\\'city\\']")
            loc = loc_el.get_text(strip=True) if loc_el else "India"

            if is_valid_job_title(title) and title not in [j["title"] for j in cognizant_jobs]:
                link = card.select_one("a[href]")
                href = link.get("href", "") if link else ""
                cognizant_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(cognizant_jobs)),
                    "title": title,
                    "company_name": "Cognizant",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "IT Services & Consulting",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": href if href.startswith("http") else f"https://careers.cognizant.com{href}" if href else "",
                    "business_unit": "",
                    "source_platform": "Cognizant Selenium fallback",
                })
    except Exception as e:
        print(f"  Selenium error: {e}")
    finally:
        driver.quit()

print(f"Total Cognizant India jobs: {len(cognizant_jobs)}")
'''

# ============================================================
# GOLDMAN SACHS - higher.gs.com
# ============================================================

GOLDMAN_SACHS_SCRAPER = '''print("=" * 60)
print("GOLDMAN SACHS INDIA JOB SCRAPER")
print("Source: higher.gs.com (TAL.NET)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

goldman_jobs = []

# Goldman uses higher.gs.com with Selenium
driver = setup_selenium()
try:
    # Try Bangalore as primary, then other India cities
    for city_query in ["Bengaluru%2C+India", "Mumbai%2C+India", "India"]:
        url = f"https://higher.gs.com/roles?location={city_query}"
        print(f"  Loading: {url}")
        driver.get(url)
        time.sleep(8)

        soup = BeautifulSoup(driver.page_source, "lxml")
        cards = soup.select("[class*='role-card'], [class*='job-card'], [class*='result'], a[href*='/roles/']")
        if not cards:
            cards = soup.select("[class*='opportunity'], [class*='position'], [class*='listing']")

        for card in cards:
            title_el = card.select_one("h2, h3, h4, [class*='title'], a")
            title = title_el.get_text(strip=True) if title_el else ""
            loc_el = card.select_one("[class*='location'], [class*='city']")
            loc = loc_el.get_text(strip=True) if loc_el else city_query.split("%2C")[0]

            link = card.select_one("a[href*='/roles/']")
            href = link.get("href", "") if link else ""

            if title and title not in [j["title"] for j in goldman_jobs]:
                goldman_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(goldman_jobs)),
                    "title": title,
                    "company_name": "Goldman Sachs",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "Financial Services / Investment Banking",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": href if href.startswith("http") else f"https://higher.gs.com{href}" if href else "",
                    "business_unit": "",
                    "source_platform": "Selenium",
                })

        print(f"  {city_query}: {len(goldman_jobs)} total jobs so far")
        if len(goldman_jobs) >= 10:
            break

    # Fetch JDs for found jobs
    if goldman_jobs:
        print(f"  Fetching JD details for up to 30 jobs...")
        for i, job in enumerate(goldman_jobs[:30]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 200:
                continue
            detail_url = f"https://higher.gs.com/roles/{job['job_id']}"
            jd = fetch_jd_selenium(driver, detail_url)
            if jd:
                goldman_jobs[i]["raw_jd_text"] = jd
            time.sleep(1)

except Exception as e:
    print(f"  Error: {e}")
finally:
    driver.quit()

print(f"Total Goldman Sachs India jobs: {len(goldman_jobs)}")
'''

# ============================================================
# ACCENTURE - accenture.com/in-en/careers
# ============================================================

ACCENTURE_SCRAPER = '''print("=" * 60)
print("ACCENTURE INDIA JOB SCRAPER")
print("ATS: Workday (accenture.wd103.myworkdayjobs.com)")
print("=" * 60)

# Accenture uses Workday — same API as Novartis/Sanofi/Fidelity
accenture_jobs = scrape_workday(
    tenant="accenture",
    instance="wd103",
    career_site="AccentureCareers",
    company_name="Accenture",
    industry="Consulting & IT Services",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

print(f"Total Accenture India jobs: {len(accenture_jobs)}")
'''

# ============================================================
# IBM - ibm.com/careers/search
# ============================================================

IBM_SCRAPER = '''print("=" * 60)
print("IBM INDIA JOB SCRAPER")
print("Source: Google Cloud Talent Solution API (jobsapi-google.m-cloud.io)")
print("=" * 60)

ibm_jobs = []
session = get_session()
session.headers.update({
    "Accept": "application/json",
    "Content-Type": "application/json",
})

# IBM uses Google Cloud Talent Solution API
api_url = "https://jobsapi-google.m-cloud.io/api/job/search"
ibm_company_id = "companies/728ae96b-0028-4d31-9697-9b42f37dd3f4"

print("  Using Google Cloud Talent Solution API...")
page_token = ""
page_num = 0

while len(ibm_jobs) < 500:
    payload = {
        "companyName": ibm_company_id,
        "pageSize": 20,
        "offset": page_num * 20,
        "searchText": "",
        "locationFilters": [{"address": "India", "distanceInMiles": 0}],
        "customAttributeFilter": "",
    }
    if page_token:
        payload["pageToken"] = page_token

    try:
        resp = session.post(api_url, json=payload, timeout=30)
        if resp.status_code != 200:
            print(f"  [ERROR] HTTP {resp.status_code}")
            # Try alternate endpoint format
            if page_num == 0:
                print("  Trying alternate GET endpoint...")
                alt_url = f"{api_url}?companyName={ibm_company_id}&pageSize=20&location=India"
                resp = session.get(alt_url, timeout=30)
                if resp.status_code != 200:
                    print(f"  Alt also returned HTTP {resp.status_code}")
                    break
            else:
                break

        data = resp.json()
        matched_jobs = data.get("matchingJobs", data.get("jobs", []))
        total = data.get("totalSize", data.get("total", 0))
        page_token = data.get("nextPageToken", "")

        if page_num == 0:
            print(f"  Total matching jobs: {total}")

        if not matched_jobs:
            break

        print(f"  Page {page_num+1}: {len(matched_jobs)} jobs")

        for mj in matched_jobs:
            job = mj.get("job", mj)
            title = job.get("title", job.get("name", ""))
            desc = job.get("description", "")
            locations = job.get("locations", [])
            city = locations[0].split(",")[0].strip() if locations else "India"
            custom = job.get("customAttributes", {})
            category = custom.get("primary_category", {}).get("stringValues", [""])[0] if "primary_category" in custom else ""
            req_id = job.get("requisitionId", job.get("name", "").split("/")[-1])
            posted = job.get("postingPublishTime", job.get("postingCreateTime", ""))

            if title and is_valid_job_title(title):
                ibm_jobs.append({
                    "job_id": str(req_id),
                    "title": title,
                    "company_name": "IBM",
                    "raw_jd_text": html_to_text(desc),
                    "location_city": city,
                    "industry": "Technology / IT Services",
                    "date_posted": posted[:10] if posted else datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": f"https://www.ibm.com/careers/job/{req_id}",
                    "business_unit": category,
                    "source_platform": "IBM Google CTS API",
                })

        if not page_token:
            break
        page_num += 1
        time.sleep(random.uniform(0.5, 1.5))

    except Exception as e:
        print(f"  [ERROR] {e}")
        break

# Selenium fallback if API fails
if len(ibm_jobs) < 5:
    print("\\n  API approach returned few results. Trying Selenium on ibm.com/careers...")
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    driver = setup_selenium()
    try:
        driver.get("https://www.ibm.com/careers/search?field_keyword_18[0]=India")
        time.sleep(12)

        # Wait for Angular/React rendering
        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*=\\'/job/\\']"))
            )
        except:
            time.sleep(5)

        soup = BeautifulSoup(driver.page_source, "lxml")
        # Target actual job links, not UI buttons
        job_links = soup.select("a[href*=\\'/careers/job/\\'], a[href*=\\'/job/\\']")
        for link in job_links:
            title = link.get_text(strip=True)
            href = link.get("href", "")
            if is_valid_job_title(title) and title not in [j["title"] for j in ibm_jobs]:
                card = link.parent
                loc_el = card.select_one("[class*=\\'location\\']") if card else None
                loc = loc_el.get_text(strip=True) if loc_el else "India"
                ibm_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(ibm_jobs)),
                    "title": title,
                    "company_name": "IBM",
                    "raw_jd_text": card.get_text(" ", strip=True) if card else "",
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "Technology / IT Services",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": href if href.startswith("http") else f"https://www.ibm.com{href}" if href else "",
                    "business_unit": "",
                    "source_platform": "IBM Selenium fallback",
                })
    except Exception as e:
        print(f"  Selenium error: {e}")
    finally:
        driver.quit()

print(f"Total IBM India jobs: {len(ibm_jobs)}")
'''

# ============================================================
# L'OREAL - careers.loreal.com (Phenom platform)
# ============================================================

LOREAL_SCRAPER = '''print("=" * 60)
print("L\\'OREAL INDIA JOB SCRAPER")
print("Source: careers.loreal.com (Phenom platform)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

loreal_jobs = []

# Phenom platform uses internal XHR APIs. Try to find them via Selenium.
driver = setup_selenium()
try:
    # Enable network logging to capture XHR API calls
    driver.get("https://careers.loreal.com/global/en/search-results?keywords=&location=India")
    time.sleep(12)

    # Wait for Phenom to render job cards
    try:
        WebDriverWait(driver, 25).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[data-ph-at-id], [class*=\\'job-card\\'], [class*=\\'search-result\\'], a[href*=\\'/job/\\']"))
        )
    except:
        print("  Waiting longer for Phenom to render...")
        time.sleep(10)

    for page in range(10):
        soup = BeautifulSoup(driver.page_source, "lxml")

        # Remove nav/header/footer
        for unwanted in soup.select("nav, header, footer, [role=\\'navigation\\']"):
            unwanted.decompose()

        # Phenom career sites typically use data-ph-at-id attributes for job cards
        cards = soup.select("[data-ph-at-id*=\\'job\\'], [class*=\\'job-card\\'], [class*=\\'search-result-item\\']")
        if not cards:
            # Fallback: look for job links
            job_links = soup.select("a[href*=\\'/job/\\'], a[href*=\\'/en/job/\\']")
            seen_parents = set()
            for link in job_links:
                parent = link.parent
                if parent and id(parent) not in seen_parents:
                    cards.append(parent)
                    seen_parents.add(id(parent))

        new_count = 0
        for card in cards:
            title_el = card.select_one("h2, h3, h4, [class*=\\'title\\'], [data-ph-at-id*=\\'title\\'], a[href*=\\'/job/\\']")
            title = title_el.get_text(strip=True) if title_el else ""
            loc_el = card.select_one("[class*=\\'location\\'], [class*=\\'city\\'], [data-ph-at-id*=\\'location\\']")
            loc = loc_el.get_text(strip=True) if loc_el else "India"
            dept_el = card.select_one("[class*=\\'department\\'], [class*=\\'category\\'], [data-ph-at-id*=\\'department\\']")
            dept = dept_el.get_text(strip=True) if dept_el else ""

            link = card.select_one("a[href*=\\'/job/\\']")
            href = link.get("href", "") if link else ""

            if is_valid_job_title(title) and title not in [j["title"] for j in loreal_jobs]:
                full_url = href if href.startswith("http") else f"https://careers.loreal.com{href}" if href else ""
                loreal_jobs.append({
                    "job_id": href.split("/")[-1] if href else str(len(loreal_jobs)),
                    "title": title,
                    "company_name": "L\\'Oreal",
                    "raw_jd_text": "",
                    "location_city": loc.split(",")[0].strip(),
                    "industry": "FMCG / Beauty & Cosmetics",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "job_url": full_url,
                    "business_unit": dept,
                    "source_platform": "L\\'Oreal Phenom",
                })
                new_count += 1

        print(f"  Page {page+1}: {new_count} new jobs (total: {len(loreal_jobs)})")
        if new_count == 0 and page > 0:
            break

        # Pagination: Phenom uses "Load more" or numbered pages
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR,
                "button[data-ph-at-id*=\\'load-more\\'], a[aria-label*=\\'Next\\'], a[aria-label*=\\'next\\'], [class*=\\'next\\'] a, button[class*=\\'load-more\\']")
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(4)
        except:
            # Try scrolling for infinite scroll
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(3)
            new_soup = BeautifulSoup(driver.page_source, "lxml")
            new_cards = new_soup.select("[data-ph-at-id*=\\'job\\'], a[href*=\\'/job/\\']")
            if len(new_cards) <= len(cards):
                break

    # Fetch JDs for found jobs
    if loreal_jobs:
        print(f"\\n  Fetching JD details for up to 30 jobs...")
        for i, job in enumerate(loreal_jobs[:30]):
            if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
                continue
            if job["job_url"]:
                jd = fetch_jd_selenium(driver, job["job_url"])
                if jd:
                    loreal_jobs[i]["raw_jd_text"] = jd
            if (i + 1) % 10 == 0:
                print(f"    Fetched {i+1}/{min(30, len(loreal_jobs))} JDs")

except Exception as e:
    print(f"  Error: {e}")
    import traceback; traceback.print_exc()
finally:
    driver.quit()

print(f"Total L\\'Oreal India jobs: {len(loreal_jobs)}")
'''

# ============================================================
# NEW BATCH v3 - March 2026
# ============================================================

# ── WORKDAY: Salesforce ──────────────────────────────────────
SALESFORCE_SCRAPER = '''print("=" * 60)
print("SALESFORCE INDIA JOB SCRAPER")
print("ATS: Workday (salesforce.wd12.myworkdayjobs.com)")
print("=" * 60)

salesforce_jobs = scrape_workday(
    tenant="salesforce",
    instance="wd12",
    career_site="External_Career_Site",
    company_name="Salesforce",
    industry="Technology / CRM / SaaS",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ── WORKDAY: Wells Fargo ─────────────────────────────────────
WELLS_FARGO_SCRAPER = '''print("=" * 60)
print("WELLS FARGO INDIA JOB SCRAPER")
print("ATS: Workday (wf.wd1.myworkdayjobs.com)")
print("=" * 60)

wells_fargo_jobs = scrape_workday(
    tenant="wf",
    instance="wd1",
    career_site="WellsFargoJobs",
    company_name="Wells Fargo",
    industry="Banking / Financial Services",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ── WORKDAY: Mastercard ──────────────────────────────────────
MASTERCARD_SCRAPER = '''print("=" * 60)
print("MASTERCARD INDIA JOB SCRAPER")
print("ATS: Workday (mastercard.wd1.myworkdayjobs.com)")
print("=" * 60)

mastercard_jobs = scrape_workday(
    tenant="mastercard",
    instance="wd1",
    career_site="CorporateCareers",
    company_name="Mastercard",
    industry="Financial Technology / Payments",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ── WORKDAY: Eli Lilly ───────────────────────────────────────
ELI_LILLY_SCRAPER = '''print("=" * 60)
print("ELI LILLY INDIA JOB SCRAPER")
print("ATS: Workday (lilly.wd5.myworkdayjobs.com)")
print("=" * 60)

eli_lilly_jobs = scrape_workday(
    tenant="lilly",
    instance="wd5",
    career_site="LLY",
    company_name="Eli Lilly",
    industry="Pharmaceutical / Life Sciences",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ── WORKDAY: RTX (Raytheon Technologies) ─────────────────────
RTX_SCRAPER = '''print("=" * 60)
print("RTX (RAYTHEON TECHNOLOGIES) INDIA JOB SCRAPER")
print("ATS: Workday (globalhr.wd5.myworkdayjobs.com)")
print("=" * 60)

rtx_jobs = scrape_workday(
    tenant="globalhr",
    instance="wd5",
    career_site="REC_RTX_Ext_Gateway",
    company_name="RTX",
    industry="Aerospace & Defense / Engineering",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)
'''

# ── SMARTRECRUITERS: Continental ─────────────────────────────
CONTINENTAL_SCRAPER = '''print("=" * 60)
print("CONTINENTAL INDIA JOB SCRAPER")
print("ATS: SmartRecruiters (api.smartrecruiters.com/continental)")
print("=" * 60)

continental_jobs = scrape_smartrecruiters(
    company_id="continental",
    company_name="Continental",
    industry="Automotive / Engineering",
    country=COUNTRY_CODE,
    max_jobs=500
)

# Fallback: try alternate company ID if primary returns nothing
if len(continental_jobs) < 3:
    print("\\n  Trying alternate SmartRecruiters ID 'ContiGroup'...")
    continental_jobs = scrape_smartrecruiters(
        company_id="ContiGroup",
        company_name="Continental",
        industry="Automotive / Engineering",
        country=COUNTRY_CODE,
        max_jobs=500
    )
'''

# ── SMARTRECRUITERS: ServiceNow ──────────────────────────────
SERVICENOW_SCRAPER = '''print("=" * 60)
print("SERVICENOW INDIA JOB SCRAPER")
print("ATS: SmartRecruiters (careers.smartrecruiters.com/servicenow)")
print("=" * 60)

servicenow_jobs = scrape_smartrecruiters(
    company_id="ServiceNow",
    company_name="ServiceNow",
    industry="Technology / IT Service Management / SaaS",
    country=COUNTRY_CODE,
    max_jobs=500
)
'''

# ── EIGHTFOLD (fixed): Morgan Stanley ────────────────────────
# Rebuilt with multi-endpoint retry and relaxed location filter
MORGAN_STANLEY_SCRAPER_FIXED = '''print("=" * 60)
print("MORGAN STANLEY INDIA JOB SCRAPER (Fixed v2)")
print("ATS: Eightfold AI (morganstanley.eightfold.ai)")
print("=" * 60)

import requests, time, random
from bs4 import BeautifulSoup

morgan_stanley_jobs = []
domain = "morganstanley.eightfold.ai"
session = requests.Session()
session.headers.update({
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": f"https://{domain}/careers",
})

# Eightfold v2 API — try multiple endpoint and param patterns
ENDPOINTS = [
    f"https://{domain}/api/apply/v2/jobs",
    f"https://{domain}/api/jobs/search",
]

INDIA_KEYWORDS = ["india", "bengaluru", "bangalore", "hyderabad", "mumbai",
                  "pune", "chennai", "delhi", "gurugram", "noida"]

page_size = 50
found = False

for api_url in ENDPOINTS:
    if found:
        break
    print(f"  Trying endpoint: {api_url}")

    # Try both GET with params and POST with body
    for attempt_type in ["get_location", "get_all"]:
        page = 1
        attempt_jobs = []

        while len(attempt_jobs) < 1000:
            if attempt_type == "get_location":
                params = {
                    "num": page_size,
                    "start": (page - 1) * page_size,
                    "location": "India",
                    "domain": "morganstanley",
                }
            else:
                params = {
                    "num": page_size,
                    "start": (page - 1) * page_size,
                    "domain": "morganstanley",
                }

            try:
                resp = session.get(api_url, params=params, timeout=30)
                if resp.status_code != 200:
                    print(f"  [{attempt_type}] HTTP {resp.status_code}")
                    break

                data = resp.json()
                positions = data.get("positions", data.get("jobs", data.get("results", [])))

                if not positions:
                    break

                print(f"  [{attempt_type}] Page {page}: {len(positions)} positions")

                for pos in positions:
                    loc = (pos.get("location", "") or
                           pos.get("city", "") or
                           pos.get("locations", [""])[0] if isinstance(pos.get("locations"), list) else "")
                    loc_str = str(loc).lower()

                    # Include if location matches India keywords, or if we\'re fetching all
                    if attempt_type == "get_all" and not any(k in loc_str for k in INDIA_KEYWORDS):
                        continue

                    city = str(loc).split(",")[0].strip() if loc else "India"
                    jd_text = html_to_text(pos.get("description", pos.get("summary", "")))
                    job_id = str(pos.get("id", pos.get("requisition_id", pos.get("job_id", ""))))
                    job_url = pos.get("apply_url", f"https://{domain}/careers?pid={job_id}" if job_id else "")
                    dept = pos.get("team", pos.get("department", pos.get("category", "")))

                    attempt_jobs.append({
                        "job_id": job_id,
                        "title": pos.get("name", pos.get("title", "")),
                        "company_name": "Morgan Stanley",
                        "job_url": job_url,
                        "business_unit": str(dept) if dept else "",
                        "raw_jd_text": jd_text,
                        "location_city": city,
                        "location_country": "India",
                        "industry": "Financial Services / Investment Banking",
                        "date_posted": str(pos.get("t_update", pos.get("updated_at",
                                          datetime.now().strftime("%Y-%m-%d"))))[:10],
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Eightfold (Morgan Stanley)",
                    })

                if len(positions) < page_size:
                    break
                page += 1
                time.sleep(random.uniform(0.5, 1.5))

            except Exception as e:
                print(f"  [{attempt_type}] Error: {e}")
                break

        if attempt_jobs:
            print(f"  SUCCESS with [{attempt_type}]: {len(attempt_jobs)} India jobs")
            morgan_stanley_jobs = attempt_jobs
            found = True
            break

# Selenium fallback if API fails
if not morgan_stanley_jobs:
    print("\\n  API failed — trying Selenium fallback on morganstanley.eightfold.ai...")
    driver = setup_selenium()
    try:
        driver.get(f"https://{domain}/careers?location=India")
        time.sleep(10)
        soup = BeautifulSoup(driver.page_source, "lxml")
        cards = soup.select("[class*=\'job-card\'], [class*=\'position\'], [data-job-id], a[href*=\'/careers?pid\']")
        for card in cards:
            title_el = card.select_one("h3, h2, [class*=\'title\'], a")
            title = title_el.get_text(strip=True) if title_el else ""
            href = card.get("href", card.select_one("a[href]").get("href", "") if card.select_one("a[href]") else "")
            if is_valid_job_title(title):
                morgan_stanley_jobs.append({
                    "job_id": href.split("pid=")[-1] if "pid=" in href else str(len(morgan_stanley_jobs)),
                    "title": title,
                    "company_name": "Morgan Stanley",
                    "job_url": href if href.startswith("http") else f"https://{domain}{href}",
                    "business_unit": "",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": "India",
                    "location_country": "India",
                    "industry": "Financial Services / Investment Banking",
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "salary_currency": "INR",
                    "source_platform": "Eightfold Selenium (Morgan Stanley)",
                })
    except Exception as e:
        print(f"  Selenium error: {e}")
    finally:
        driver.quit()

print(f"Total Morgan Stanley India jobs: {len(morgan_stanley_jobs)}")
'''

# ── EIGHTFOLD: American Express ──────────────────────────────
AMEX_SCRAPER = '''print("=" * 60)
print("AMERICAN EXPRESS INDIA JOB SCRAPER")
print("ATS: Eightfold AI (aexp.eightfold.ai)")
print("=" * 60)

amex_jobs = scrape_eightfold(
    domain="aexp.eightfold.ai",
    company_name="American Express",
    industry="Financial Services / Payments",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

# Fallback: try with alternate location strings
if len(amex_jobs) < 5:
    print("\\n  Retrying with broader location filter...")
    for city in ["Bengaluru", "Gurugram", "Hyderabad"]:
        city_jobs = scrape_eightfold(
            domain="aexp.eightfold.ai",
            company_name="American Express",
            industry="Financial Services / Payments",
            location_filter=city,
            max_jobs=200
        )
        existing_ids = {j["job_id"] for j in amex_jobs}
        amex_jobs.extend([j for j in city_jobs if j["job_id"] not in existing_ids])

print(f"Total American Express India jobs: {len(amex_jobs)}")
'''

# ── GREENHOUSE: Stripe ────────────────────────────────────────
STRIPE_SCRAPER = '''print("=" * 60)
print("STRIPE INDIA JOB SCRAPER")
print("ATS: Greenhouse (boards-api.greenhouse.io/stripe)")
print("=" * 60)

stripe_jobs = scrape_greenhouse(
    board_token="stripe",
    company_name="Stripe",
    industry="Financial Technology / Payments",
    location_filter=LOCATION_FILTER,
    max_jobs=500
)

# Greenhouse may list jobs with broad regions — also check common Indian cities
if len(stripe_jobs) < 3:
    print("\\n  Checking individual Indian city offices...")
    import requests
    from bs4 import BeautifulSoup

    session = get_session()
    resp = session.get(
        "https://boards-api.greenhouse.io/v1/boards/stripe/jobs",
        params={"content": "true"},
        timeout=30
    )
    if resp.status_code == 200:
        all_jobs = resp.json().get("jobs", [])
        india_keywords = ["india", "bengaluru", "bangalore", "mumbai", "pune",
                          "chennai", "hyderabad", "delhi", "gurugram", "noida", "apac"]
        for posting in all_jobs:
            loc = posting.get("location", {}).get("name", "").lower()
            offices = posting.get("offices", [])
            office_names = " ".join([o.get("location", "") + " " + o.get("name", "")
                                     for o in offices]).lower()
            if any(k in loc or k in office_names for k in india_keywords):
                if posting.get("id") not in [j["job_id"] for j in stripe_jobs]:
                    dept = (posting.get("departments", [{}])[0].get("name", "")
                            if posting.get("departments") else "")
                    jd_text = html_to_text(posting.get("content", ""))
                    stripe_jobs.append({
                        "job_id": str(posting.get("id", "")),
                        "title": posting.get("title", ""),
                        "company_name": "Stripe",
                        "job_url": posting.get("absolute_url", ""),
                        "business_unit": dept,
                        "raw_jd_text": jd_text,
                        "location_city": posting.get("location", {}).get("name", "India").split(",")[0].strip(),
                        "location_country": "India",
                        "industry": "Financial Technology / Payments",
                        "date_posted": (posting.get("updated_at", "")[:10]
                                        or datetime.now().strftime("%Y-%m-%d")),
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Greenhouse",
                    })

print(f"Total Stripe India jobs: {len(stripe_jobs)}")
'''

# ── SELENIUM: Synopsys (Avature) ─────────────────────────────
SYNOPSYS_SCRAPER = '''print("=" * 60)
print("SYNOPSYS INDIA JOB SCRAPER")
print("ATS: Avature (synopsys.avature.net) — Selenium required")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

''' + SELENIUM_JD_FETCH + '''

synopsys_jobs = []

# Avature URL with India filter
avature_url = "https://synopsys.avature.net/careers/SearchJobs?locationCountry=IN&projectOffset=0"

# Try scrape_avature helper first
try:
    synopsys_jobs = scrape_avature(
        base_url=avature_url,
        company_name="Synopsys",
        industry="Semiconductor / EDA / Electronic Design",
        location_filter=LOCATION_FILTER,
        max_pages=15
    )
except Exception as e:
    print(f"  scrape_avature helper failed: {e}")

# Selenium fallback with direct approach if needed
if len(synopsys_jobs) < 5:
    print("\\n  Trying direct Selenium approach on synopsys.avature.net...")
    driver = setup_selenium()
    try:
        driver.get(avature_url)
        time.sleep(10)

        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR,
                    ".paginationData li, tr.data-row, [class*=\'job\'], a[href*=\'/careers/\']"))
            )
        except:
            time.sleep(8)

        for page_num in range(15):
            soup = BeautifulSoup(driver.page_source, "lxml")

            # Avature table layout
            rows = soup.select("tr.data-row, .paginationData li, [class*=\'job-row\']")
            if not rows:
                rows = soup.select("a[href*=\'/careers/JobDetail\'], a[href*=\'ProjectDetail\']")
                rows = [r.parent for r in rows if r.parent]

            new_jobs = 0
            for row in rows:
                title_el = (row.select_one("td.jobTitle a, .jobTitle a, a[href*=\'JobDetail\'], a[href*=\'ProjectDetail\']") or
                            row.select_one("a[href*=\'/careers/\']"))
                title = title_el.get_text(strip=True) if title_el else ""
                href = title_el.get("href", "") if title_el else ""

                loc_el = row.select_one("td.jobLocation, .jobLocation, [class*=\'location\']")
                loc = loc_el.get_text(strip=True) if loc_el else "India"

                dept_el = row.select_one("td.jobDepartment, [class*=\'department\']")
                dept = dept_el.get_text(strip=True) if dept_el else ""

                if not is_valid_job_title(title):
                    continue

                # Only keep India jobs
                india_locs = ["india", "bengaluru", "bangalore", "hyderabad",
                              "pune", "noida", "chennai", "gurugram"]
                if not any(k in loc.lower() for k in india_locs):
                    continue

                full_url = href if href.startswith("http") else f"https://synopsys.avature.net{href}" if href else ""
                job_id = href.split("/")[-1].split("?")[0] if href else str(len(synopsys_jobs))

                if job_id not in [j["job_id"] for j in synopsys_jobs]:
                    synopsys_jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company_name": "Synopsys",
                        "job_url": full_url,
                        "business_unit": dept,
                        "raw_jd_text": "",
                        "location_city": loc.split(",")[0].strip(),
                        "location_country": "India",
                        "industry": "Semiconductor / EDA / Electronic Design",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Avature",
                    })
                    new_jobs += 1

            print(f"  Page {page_num+1}: {new_jobs} new jobs (total: {len(synopsys_jobs)})")

            if new_jobs == 0 and page_num > 0:
                break

            # Avature pagination: look for numeric page links or Next
            try:
                next_btn = driver.find_element(By.CSS_SELECTOR,
                    "a[aria-label=\'Next\'], a[title=\'Next\'], .nextPage a, "
                    "[class*=\'next\'] a, a[rel=\'next\']")
                driver.execute_script("arguments[0].click();", next_btn)
                time.sleep(5)
            except:
                break

        # Fetch JD details for found jobs
        if synopsys_jobs:
            print(f"\\n  Fetching JD details for up to 40 jobs...")
            for i, job in enumerate(synopsys_jobs[:40]):
                if job.get("raw_jd_text") and len(job["raw_jd_text"]) > 100:
                    continue
                if job["job_url"]:
                    jd = fetch_jd_selenium(driver, job["job_url"])
                    synopsys_jobs[i]["raw_jd_text"] = jd
                if (i + 1) % 10 == 0:
                    print(f"    Fetched {i+1}/{min(40, len(synopsys_jobs))} JDs")

    except Exception as e:
        print(f"  Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        driver.quit()

print(f"Total Synopsys India jobs: {len(synopsys_jobs)}")
'''

# ── SELENIUM: Atlassian ───────────────────────────────────────
ATLASSIAN_SCRAPER = '''print("=" * 60)
print("ATLASSIAN INDIA JOB SCRAPER")
print("Source: www.atlassian.com/company/careers/all-jobs")
print("Method: Selenium + JSON API discovery")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import json

''' + SELENIUM_JD_FETCH + '''

atlassian_jobs = []

# First, try Atlassian\'s internal JSON API (common pattern for React-based career pages)
session = get_session()
session.headers.update({"Accept": "application/json"})

# Atlassian uses a careers API - try common endpoints
API_ATTEMPTS = [
    "https://www.atlassian.com/endpoint/careers/api/jobs?location=India",
    "https://api.greenhouse.io/v1/boards/atlassian/jobs?content=true",
    "https://boards-api.greenhouse.io/v1/boards/atlassian/jobs?content=true",
]

for api_url in API_ATTEMPTS:
    try:
        print(f"  Trying API: {api_url}")
        resp = session.get(api_url, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            jobs_list = data.get("jobs", data.get("positions", data.get("results", [])))
            if jobs_list:
                india_keywords = ["india", "bengaluru", "bangalore", "pune", "hyderabad", "sydney apac"]
                for job in jobs_list:
                    loc = (job.get("location", {}).get("name", "") if isinstance(job.get("location"), dict)
                           else str(job.get("location", "")))
                    if not any(k in loc.lower() for k in india_keywords) and len(atlassian_jobs) < 3:
                        # Accept all if we have no matches yet (location may be broad)
                        pass
                    elif not any(k in loc.lower() for k in india_keywords):
                        continue

                    dept = ""
                    if isinstance(job.get("departments"), list) and job["departments"]:
                        dept = job["departments"][0].get("name", "")

                    jd_html = job.get("content", job.get("description", ""))
                    jd_text = html_to_text(jd_html)

                    job_id = str(job.get("id", job.get("job_id", len(atlassian_jobs))))
                    job_url = job.get("absolute_url", job.get("url", ""))

                    atlassian_jobs.append({
                        "job_id": job_id,
                        "title": job.get("title", job.get("name", "")),
                        "company_name": "Atlassian",
                        "job_url": job_url,
                        "business_unit": dept,
                        "raw_jd_text": jd_text,
                        "location_city": loc.split(",")[0].strip() if loc else "India",
                        "location_country": "India",
                        "industry": "Technology / DevOps / Collaboration",
                        "date_posted": str(job.get("updated_at", datetime.now().strftime("%Y-%m-%d")))[:10],
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Atlassian API",
                    })

                print(f"  API success: {len(atlassian_jobs)} India jobs from {api_url}")
                if atlassian_jobs:
                    break
    except Exception as e:
        print(f"  API {api_url} failed: {e}")

# Selenium fallback on Atlassian\'s careers page
if len(atlassian_jobs) < 5:
    print("\\n  Trying Selenium on atlassian.com/company/careers/all-jobs...")
    driver = setup_selenium()
    try:
        url = "https://www.atlassian.com/company/careers/all-jobs?team=&location=India"
        driver.get(url)
        time.sleep(10)

        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR,
                    "[class*=\'JobCard\'], [class*=\'job-card\'], [class*=\'career-listing\'], a[href*=\'/careers/\']"))
            )
        except:
            time.sleep(8)

        # Try to intercept JSON from network (Atlassian loads jobs via XHR)
        # Check window.__NEXT_DATA__ or similar React page data
        try:
            next_data = driver.execute_script("return JSON.stringify(window.__NEXT_DATA__ || {})")
            if next_data and len(next_data) > 100:
                nd = json.loads(next_data)
                # Navigate the Next.js data tree to find job listings
                def find_jobs_in_dict(d, depth=0):
                    if depth > 8:
                        return []
                    if isinstance(d, list):
                        if len(d) > 3 and all(isinstance(i, dict) and
                            ("title" in i or "jobTitle" in i or "name" in i) for i in d[:3]):
                            return d
                        for item in d:
                            result = find_jobs_in_dict(item, depth+1)
                            if result:
                                return result
                    elif isinstance(d, dict):
                        for key in ["jobs", "positions", "listings", "careers", "allJobs"]:
                            if key in d and isinstance(d[key], (list, dict)):
                                return find_jobs_in_dict(d[key], depth+1)
                        for v in d.values():
                            result = find_jobs_in_dict(v, depth+1)
                            if result:
                                return result
                    return []

                jobs_from_ssr = find_jobs_in_dict(nd)
                if jobs_from_ssr:
                    print(f"  Found {len(jobs_from_ssr)} jobs from SSR data")
                    india_keywords = ["india", "bengaluru", "bangalore", "pune", "hyderabad"]
                    for job in jobs_from_ssr:
                        loc = str(job.get("location", job.get("office", "India")))
                        if any(k in loc.lower() for k in india_keywords) or len(atlassian_jobs) == 0:
                            job_id = str(job.get("id", job.get("jobId", len(atlassian_jobs))))
                            atlassian_jobs.append({
                                "job_id": job_id,
                                "title": job.get("title", job.get("jobTitle", job.get("name", ""))),
                                "company_name": "Atlassian",
                                "job_url": job.get("url", job.get("applyUrl", "")),
                                "business_unit": str(job.get("team", job.get("department", ""))),
                                "raw_jd_text": str(job.get("description", "")),
                                "location_city": loc.split(",")[0].strip(),
                                "location_country": "India",
                                "industry": "Technology / DevOps / Collaboration",
                                "date_posted": datetime.now().strftime("%Y-%m-%d"),
                                "is_active": True,
                                "salary_currency": "INR",
                                "source_platform": "Atlassian SSR",
                            })
        except Exception as e:
            print(f"  SSR extraction failed: {e}")

        # Pure DOM scraping as last resort
        if not atlassian_jobs:
            for scroll in range(10):
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)

            soup = BeautifulSoup(driver.page_source, "lxml")
            cards = soup.select(
                "[class*=\'JobCard\'], [class*=\'job-card\'], [class*=\'JobListing\'], "
                "[class*=\'career-item\'], li[class*=\'job\']"
            )
            for card in cards:
                title_el = card.select_one("h3, h2, a, [class*=\'title\']")
                title = title_el.get_text(strip=True) if title_el else ""
                href = title_el.get("href", "") if title_el and title_el.name == "a" else ""
                if not href:
                    link = card.select_one("a[href]")
                    href = link.get("href", "") if link else ""

                loc_el = card.select_one("[class*=\'location\'], [class*=\'office\']")
                loc = loc_el.get_text(strip=True) if loc_el else "India"

                if is_valid_job_title(title):
                    full_url = href if href.startswith("http") else f"https://www.atlassian.com{href}" if href else ""
                    atlassian_jobs.append({
                        "job_id": href.split("/")[-1] if href else str(len(atlassian_jobs)),
                        "title": title,
                        "company_name": "Atlassian",
                        "job_url": full_url,
                        "business_unit": "",
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": loc.split(",")[0].strip(),
                        "location_country": "India",
                        "industry": "Technology / DevOps / Collaboration",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Atlassian Selenium",
                    })

    except Exception as e:
        print(f"  Selenium error: {e}")
        import traceback; traceback.print_exc()
    finally:
        driver.quit()

print(f"Total Atlassian India jobs: {len(atlassian_jobs)}")
'''

# ── SELENIUM: MSCI ────────────────────────────────────────────
MSCI_SCRAPER = '''print("=" * 60)
print("MSCI INDIA JOB SCRAPER")
print("Source: careers.msci.com — Custom portal (Selenium)")
print("=" * 60)

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import json

''' + SELENIUM_JD_FETCH + '''

msci_jobs = []

# Try API first — MSCI careers may have a hidden JSON endpoint
session = get_session()

API_ATTEMPTS = [
    ("https://careers.msci.com/api/jobs?location=India&limit=100", "GET"),
    ("https://careers.msci.com/api/search?q=&location=India", "GET"),
    ("https://careers.msci.com/search/jobs?location=India", "GET"),
]

for api_url, method in API_ATTEMPTS:
    try:
        print(f"  Trying API: {api_url}")
        resp = session.get(api_url, timeout=15)
        if resp.status_code == 200 and "application/json" in resp.headers.get("Content-Type", ""):
            data = resp.json()
            jobs_list = data.get("jobs", data.get("results", data.get("data", [])))
            if jobs_list:
                print(f"  API found {len(jobs_list)} jobs")
                for job in jobs_list:
                    loc = str(job.get("location", "India"))
                    msci_jobs.append({
                        "job_id": str(job.get("id", len(msci_jobs))),
                        "title": job.get("title", job.get("name", "")),
                        "company_name": "MSCI",
                        "job_url": job.get("url", job.get("apply_url", "")),
                        "business_unit": str(job.get("department", job.get("category", ""))),
                        "raw_jd_text": html_to_text(job.get("description", "")),
                        "location_city": loc.split(",")[0].strip(),
                        "location_country": "India",
                        "industry": "Financial Services / Investment Research / Analytics",
                        "date_posted": str(job.get("updated_at", datetime.now().strftime("%Y-%m-%d")))[:10],
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "MSCI API",
                    })
                if msci_jobs:
                    break
    except Exception as e:
        print(f"  {api_url} failed: {e}")

# Selenium approach on careers.msci.com
if len(msci_jobs) < 5:
    print("\\n  Trying Selenium on careers.msci.com...")
    driver = setup_selenium()
    try:
        driver.get("https://careers.msci.com/job-search")
        time.sleep(10)

        # Try to extract from SSR / page state
        try:
            next_data = driver.execute_script("return JSON.stringify(window.__REDUX_STATE__ || window.__INITIAL_STATE__ || window.__NEXT_DATA__ || {})")
            if next_data and len(next_data) > 200:
                print(f"  Found page state ({len(next_data)} chars)")
                nd = json.loads(next_data)
                # Look for job arrays in the state
                def extract_from_state(obj, depth=0):
                    if depth > 8: return []
                    if isinstance(obj, list) and len(obj) > 2:
                        if all(isinstance(i, dict) and any(k in i for k in ["title","jobTitle","name"]) for i in obj[:3]):
                            return obj
                    if isinstance(obj, dict):
                        for key in ["jobs","positions","listings","searchResults","results"]:
                            if key in obj:
                                r = extract_from_state(obj[key], depth+1)
                                if r: return r
                        for v in obj.values():
                            r = extract_from_state(v, depth+1)
                            if r: return r
                    return []
                jobs_raw = extract_from_state(nd)
                if jobs_raw:
                    print(f"  Found {len(jobs_raw)} jobs in page state")
                    india_kw = ["india", "bengaluru", "hyderabad", "pune", "mumbai", "delhi"]
                    for job in jobs_raw:
                        loc = str(job.get("location", job.get("office", job.get("city", "India"))))
                        if not any(k in loc.lower() for k in india_kw):
                            continue
                        msci_jobs.append({
                            "job_id": str(job.get("id", job.get("jobId", len(msci_jobs)))),
                            "title": job.get("title", job.get("jobTitle", job.get("name", ""))),
                            "company_name": "MSCI",
                            "job_url": job.get("url", job.get("applyUrl", "")),
                            "business_unit": str(job.get("department", job.get("team", ""))),
                            "raw_jd_text": html_to_text(job.get("description", "")),
                            "location_city": loc.split(",")[0].strip(),
                            "location_country": "India",
                            "industry": "Financial Services / Investment Research / Analytics",
                            "date_posted": datetime.now().strftime("%Y-%m-%d"),
                            "is_active": True,
                            "salary_currency": "INR",
                            "source_platform": "MSCI SSR",
                        })
        except Exception as e:
            print(f"  State extraction failed: {e}")

        # DOM scraping
        if not msci_jobs:
            try:
                WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR,
                        "[class*=\'job\'], [class*=\'position\'], [class*=\'opportunity\'], a[href*=\'/job/\']"))
                )
            except:
                time.sleep(5)

            for scroll in range(15):
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)

            soup = BeautifulSoup(driver.page_source, "lxml")
            india_kw = ["india", "bengaluru", "hyderabad", "pune", "mumbai",
                        "delhi", "gurugram", "noida", "chennai"]

            # Remove nav/header/footer
            for el in soup.select("nav, header, footer, [class*=\'nav\'], [class*=\'header\']"):
                el.decompose()

            cards = (soup.select("[class*=\'job-card\'], [class*=\'JobCard\'], [class*=\'position-card\']") or
                     soup.select("a[href*=\'/job/\'], a[href*=\'/careers/job\']"))

            for card in cards:
                title_el = card.select_one("h2, h3, h4, [class*=\'title\'], a")
                title = title_el.get_text(strip=True) if title_el else ""
                href = card.get("href", "") if card.name == "a" else ""
                if not href:
                    link = card.select_one("a[href]")
                    href = link.get("href", "") if link else ""

                loc_el = card.select_one("[class*=\'location\'], [class*=\'office\'], [class*=\'city\']")
                loc = loc_el.get_text(strip=True) if loc_el else "India"

                if is_valid_job_title(title) and any(k in loc.lower() for k in india_kw):
                    full_url = href if href.startswith("http") else f"https://careers.msci.com{href}"
                    msci_jobs.append({
                        "job_id": href.split("/")[-1] if href else str(len(msci_jobs)),
                        "title": title,
                        "company_name": "MSCI",
                        "job_url": full_url,
                        "business_unit": "",
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": loc.split(",")[0].strip(),
                        "location_country": "India",
                        "industry": "Financial Services / Investment Research / Analytics",
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "MSCI Selenium",
                    })

    except Exception as e:
        print(f"  Selenium error: {e}")
        import traceback; traceback.print_exc()
    finally:
        driver.quit()

# Deduplicate by title
seen_titles = set()
msci_jobs_deduped = []
for j in msci_jobs:
    if j["title"] not in seen_titles:
        seen_titles.add(j["title"])
        msci_jobs_deduped.append(j)
msci_jobs = msci_jobs_deduped

print(f"Total MSCI India jobs: {len(msci_jobs)}")
'''

# ============================================================
# GENERATE ALL NOTEBOOKS
# ============================================================

SCRAPERS = [
    # (filename, title, source_url, company_folder, scraper_code, var_name, company_name)
    ("Novartis India Job scrapper.ipynb", "Novartis India Job Scraper",
     "novartis.wd3.myworkdayjobs.com/Novartis_Careers", "Novartis",
     NOVARTIS_SCRAPER, "novartis", "Novartis"),

    ("Sanofi India Job Scrapper.ipynb", "Sanofi India Job Scraper",
     "sanofi.wd3.myworkdayjobs.com/SanofiCareers", "Sanofi",
     SANOFI_SCRAPER, "sanofi", "Sanofi"),

    ("Fidelity Investments India Job Scraper.ipynb", "Fidelity Investments India Job Scraper",
     "fmr.wd1.myworkdayjobs.com/FidelityCareers", "Fidelity_Investments",
     FIDELITY_SCRAPER, "fidelity", "Fidelity Investments"),

    ("Capgemini India Job Scraper.ipynb", "Capgemini India Job Scraper",
     "capgemini.com/in-en/careers", "Capgemini",
     CAPGEMINI_SCRAPER, "capgemini", "Capgemini"),

    ("HCL Technologies India Job Scraper.ipynb", "HCL Technologies India Job Scraper",
     "careers.hcltech.com", "HCL_Technologies",
     HCL_SCRAPER, "hcl", "HCL Technologies"),

    ("Syngenta Job Scrapper.ipynb", "Syngenta India Job Scraper",
     "api.smartrecruiters.com/SyngentaGroup", "Syngenta",
     SYNGENTA_SCRAPER, "syngenta", "Syngenta"),

    ("Morgan Stanley India Job Scraper.ipynb", "Morgan Stanley India Job Scraper",
     "morganstanley.eightfold.ai/careers", "Morgan_Stanley",
     MORGAN_STANLEY_SCRAPER_FIXED, "morgan_stanley", "Morgan Stanley"),

    ("Apple india Job scrapper.ipynb", "Apple India Job Scraper",
     "jobs.apple.com/en-in/search?location=india-INDC", "Apple",
     APPLE_SCRAPER, "apple", "Apple"),

    ("Microsoft India Job Scrapper.ipynb", "Microsoft India Job Scraper",
     "gcsservices.careers.microsoft.com (GCS Services API)", "Microsoft",
     MICROSOFT_SCRAPER, "microsoft", "Microsoft"),

    ("Google India Job Scrapper.ipynb", "Google India Job Scraper",
     "careers.google.com/jobs/results/?location=India", "Google",
     GOOGLE_SCRAPER, "google", "Google"),

    # TCS (ibegin.tcs.com) — REMOVED: requires account registration before viewing jobs
    # Infosys (career.infosys.com) — REMOVED: requires account registration before viewing jobs

    ("Wipro India Job Scraper.ipynb", "Wipro India Job Scraper",
     "careers.wipro.com", "Wipro",
     WIPRO_SCRAPER, "wipro", "Wipro"),

    ("Cognizant India Job Scraper.ipynb", "Cognizant India Job Scraper",
     "careers.cognizant.com/india-en/jobs (RSS + Selenium)", "Cognizant",
     COGNIZANT_SCRAPER, "cognizant", "Cognizant"),

    ("Goldman Sachs India Job Scraper.ipynb", "Goldman Sachs India Job Scraper",
     "higher.gs.com", "Goldman_Sachs",
     GOLDMAN_SACHS_SCRAPER, "goldman", "Goldman Sachs"),

    ("Accenture India Job Scraper.ipynb", "Accenture India Job Scraper",
     "accenture.com/in-en/careers/jobsearch", "Accenture",
     ACCENTURE_SCRAPER, "accenture", "Accenture"),

    ("IBM India India Job Scraper.ipynb", "IBM India Job Scraper",
     "ibm.com/careers/search", "IBM_India",
     IBM_SCRAPER, "ibm", "IBM"),

    ("Loreal India Job Scraper.ipynb", "L'Oreal India Job Scraper",
     "careers.loreal.com", "Loreal",
     LOREAL_SCRAPER, "loreal", "L'Oreal"),

    # ── NEW: Workday companies ────────────────────────────────────────
    ("Salesforce India Job Scraper.ipynb", "Salesforce India Job Scraper",
     "salesforce.wd12.myworkdayjobs.com/External_Career_Site", "Salesforce",
     SALESFORCE_SCRAPER, "salesforce", "Salesforce"),

    ("Wells Fargo India Job Scraper.ipynb", "Wells Fargo India Job Scraper",
     "wf.wd1.myworkdayjobs.com/WellsFargoJobs", "Wells_Fargo",
     WELLS_FARGO_SCRAPER, "wells_fargo", "Wells Fargo"),

    ("Mastercard India Job Scraper.ipynb", "Mastercard India Job Scraper",
     "mastercard.wd1.myworkdayjobs.com/CorporateCareers", "Mastercard",
     MASTERCARD_SCRAPER, "mastercard", "Mastercard"),

    ("Eli Lilly India Job Scraper.ipynb", "Eli Lilly India Job Scraper",
     "lilly.wd5.myworkdayjobs.com/LLY", "Eli_Lilly",
     ELI_LILLY_SCRAPER, "eli_lilly", "Eli Lilly"),

    ("RTX India Job Scraper.ipynb", "RTX India Job Scraper",
     "globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway", "RTX",
     RTX_SCRAPER, "rtx", "RTX"),

    # ── NEW: SmartRecruiters companies ────────────────────────────────
    ("Continental India Job Scraper.ipynb", "Continental India Job Scraper",
     "api.smartrecruiters.com/continental", "Continental",
     CONTINENTAL_SCRAPER, "continental", "Continental"),

    ("ServiceNow India Job Scraper.ipynb", "ServiceNow India Job Scraper",
     "api.smartrecruiters.com/ServiceNow", "ServiceNow",
     SERVICENOW_SCRAPER, "servicenow", "ServiceNow"),

    # ── NEW: Eightfold company ────────────────────────────────────────
    ("American Express India Job Scraper.ipynb", "American Express India Job Scraper",
     "aexp.eightfold.ai/careers", "American_Express",
     AMEX_SCRAPER, "amex", "American Express"),

    # ── NEW: Greenhouse company ───────────────────────────────────────
    ("Stripe India Job Scraper.ipynb", "Stripe India Job Scraper",
     "boards-api.greenhouse.io/v1/boards/stripe/jobs", "Stripe",
     STRIPE_SCRAPER, "stripe", "Stripe"),

    # ── NEW: Avature company ──────────────────────────────────────────
    ("Synopsys India Job Scraper.ipynb", "Synopsys India Job Scraper",
     "synopsys.avature.net/careers", "Synopsys",
     SYNOPSYS_SCRAPER, "synopsys", "Synopsys"),

    # ── NEW: Custom portal companies ─────────────────────────────────
    ("Atlassian India Job Scraper.ipynb", "Atlassian India Job Scraper",
     "www.atlassian.com/company/careers/all-jobs", "Atlassian",
     ATLASSIAN_SCRAPER, "atlassian", "Atlassian"),

    ("MSCI India Job Scraper.ipynb", "MSCI India Job Scraper",
     "careers.msci.com", "MSCI",
     MSCI_SCRAPER, "msci", "MSCI"),
]

print("=" * 60)
print("GENERATING ALL SCRAPER NOTEBOOKS v2.2  (28 companies)")
print("=" * 60)

for fname, title, source, company_folder, scraper_code, var_name, company_name in SCRAPERS:
    cells = [
        m(f"# {title}\n## India Jobs Scraper (v2.1 - March 2026)\n**Source:** {source}\n\n"
          f"**ATS Detection:** Automatic API + Selenium fallback"),
        c(INSTALL),
        c(IMPORT_UTILS),
        c(path_cell(company_folder)),
        c(scraper_code),
        c(save_cell(var_name, company_name)),
    ]
    write(fname, cells)

print(f"\n{'=' * 60}")
print(f"Generated {len(SCRAPERS)} scraper notebooks")
print("=" * 60)
