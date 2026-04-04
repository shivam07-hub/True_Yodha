#!/usr/bin/env python3
"""
Quick Test Script v2.1 - Run this on your Mac to validate each scraper.
Tests API-based scrapers first (fastest), then Selenium-based ones.

Usage:
    cd ~/Job_Scrapers/All_Scripts
    python test_scrapers_quick.py           # Test all API scrapers
    python test_scrapers_quick.py novartis  # Test one company
    python test_scrapers_quick.py --all     # Test ALL including Selenium (slower)
    python test_scrapers_quick.py apple     # Test one Selenium scraper
"""

import sys, time, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scraper_utils import *

def test_workday(name, tenant, instance, career_site, industry):
    """Test a Workday company scraper."""
    print(f"\n{'='*60}")
    print(f"TESTING: {name} (Workday: {tenant}.{instance}.myworkdayjobs.com)")
    print(f"{'='*60}")
    jobs = scrape_workday(tenant, instance, career_site, name, industry, max_jobs=5)
    if jobs:
        j = jobs[0]
        print(f"  Sample: {j['title']}")
        print(f"  City: {j['location_city']}")
        print(f"  Job ID: {j['job_id']}")
        print(f"  JD length: {len(j.get('raw_jd_text', '') or '')} chars")
        print(f"  Posted: {j['date_posted']}")
        has_jd = sum(1 for j in jobs if j.get('raw_jd_text') and len(j['raw_jd_text']) > 50)
        print(f"  Jobs with JD text: {has_jd}/{len(jobs)}")
    return len(jobs)

def test_smartrecruiters(name, company_id, industry):
    """Test a SmartRecruiters company scraper."""
    print(f"\n{'='*60}")
    print(f"TESTING: {name} (SmartRecruiters: {company_id})")
    print(f"{'='*60}")
    jobs = scrape_smartrecruiters(company_id, name, industry, max_jobs=5)
    if jobs:
        j = jobs[0]
        print(f"  Sample: {j['title']}")
        print(f"  City: {j['location_city']}")
        print(f"  JD length: {len(j.get('raw_jd_text', '') or '')} chars")
        has_jd = sum(1 for j in jobs if j.get('raw_jd_text') and len(j['raw_jd_text']) > 50)
        print(f"  Jobs with JD text: {has_jd}/{len(jobs)}")
    return len(jobs)

def test_eightfold(name, domain, industry):
    """Test an Eightfold company scraper."""
    print(f"\n{'='*60}")
    print(f"TESTING: {name} (Eightfold: {domain})")
    print(f"{'='*60}")
    jobs = scrape_eightfold(domain, name, industry, max_jobs=5)
    if jobs:
        j = jobs[0]
        print(f"  Sample: {j['title']}")
        print(f"  City: {j['location_city']}")
        print(f"  JD length: {len(j.get('raw_jd_text', '') or '')} chars")
        has_jd = sum(1 for j in jobs if j.get('raw_jd_text') and len(j['raw_jd_text']) > 50)
        print(f"  Jobs with JD text: {has_jd}/{len(jobs)}")
    return len(jobs)

def test_microsoft():
    """Test Microsoft GCS API."""
    print(f"\n{'='*60}")
    print(f"TESTING: Microsoft (GCS Services API)")
    print(f"{'='*60}")
    import requests
    session = get_session()
    session.headers.update({"Accept": "application/json"})

    api_url = "https://gcsservices.careers.microsoft.com/search/api/v1/search"
    params = {"l": "en_us", "pg": 1, "pgSz": 5, "o": "Relevance", "flt": "true", "loc": "India"}

    jobs = []
    for attempt in range(3):
        try:
            resp = session.get(api_url, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                result = data.get("operationResult", {}).get("result", {})
                jobs_list = result.get("jobs", [])
                total = result.get("totalJobs", 0)
                print(f"  API returned {len(jobs_list)} jobs (total: {total})")
                for job in jobs_list:
                    props = job.get("properties", job)
                    jobs.append({
                        "title": props.get("title", ""),
                        "location_city": props.get("primaryLocation", "India"),
                        "raw_jd_text": html_to_text(props.get("description", "")),
                        "job_id": str(props.get("jobId", "")),
                    })
                if jobs:
                    j = jobs[0]
                    print(f"  Sample: {j['title']}")
                    print(f"  City: {j['location_city']}")
                    print(f"  JD length: {len(j.get('raw_jd_text', '') or '')} chars")
                break
            elif resp.status_code == 502:
                print(f"  API returned 502 (attempt {attempt+1}), retrying...")
                time.sleep(5)
            else:
                print(f"  API returned {resp.status_code}")
                break
        except Exception as e:
            print(f"  Error (attempt {attempt+1}): {e}")
            time.sleep(3)

    return len(jobs)

def test_apple_selenium():
    """Test Apple with Selenium."""
    print(f"\n{'='*60}")
    print(f"TESTING: Apple (Selenium on jobs.apple.com)")
    print(f"{'='*60}")
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from bs4 import BeautifulSoup

    driver = setup_selenium()
    jobs = []
    try:
        driver.get("https://jobs.apple.com/en-in/search?location=india-INDC")
        time.sleep(8)
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.job-list-item"))
            )
        except:
            time.sleep(5)

        soup = BeautifulSoup(driver.page_source, "lxml")
        cards = soup.select("div.job-list-item")
        print(f"  Found {len(cards)} job cards")

        for card in cards[:5]:
            title_link = card.select_one("a.link-inline[href*='/details/'], a[href*='/details/']")
            if title_link:
                title = title_link.get_text(strip=True)
                team_el = card.select_one("span.team-name")
                date_el = card.select_one("span.job-posted-date")
                jobs.append({
                    "title": title,
                    "team": team_el.get_text(strip=True) if team_el else "",
                    "date": date_el.get_text(strip=True) if date_el else "",
                })
                print(f"  Sample: {title}")

        # Check total results
        total_el = soup.select_one("h2, [class*='result-count'], [class*='results']")
        if total_el:
            print(f"  Results text: {total_el.get_text(strip=True)[:50]}")

    except Exception as e:
        print(f"  Error: {e}")
        traceback.print_exc()
    finally:
        driver.quit()

    return len(jobs)

def test_generic_selenium(name, url, expected_selectors=None):
    """Test a Selenium-based scraper by visiting the URL and checking for job cards."""
    print(f"\n{'='*60}")
    print(f"TESTING: {name} (Selenium)")
    print(f"{'='*60}")
    from selenium.webdriver.common.by import By
    from bs4 import BeautifulSoup

    driver = setup_selenium()
    jobs_found = 0
    try:
        print(f"  Loading: {url}")
        driver.get(url)
        time.sleep(10)

        soup = BeautifulSoup(driver.page_source, "lxml")
        print(f"  Page title: {driver.title}")

        # Try various common job card selectors
        selectors = expected_selectors or [
            "[class*='job-card']", "[class*='job-listing']", "[class*='job-result']",
            "[class*='search-result']", "a[href*='/job/']", "a[href*='/details/']",
            "[class*='position']", "[class*='listing']", "[class*='result']",
            "[class*='role-card']", "[class*='opportunity']",
        ]

        for sel in selectors:
            cards = soup.select(sel)
            if cards:
                print(f"  Selector '{sel}': {len(cards)} elements found")
                jobs_found = max(jobs_found, len(cards))
                # Show first result
                first = cards[0]
                title_el = first.select_one("h2, h3, h4, [class*='title'], a")
                if title_el:
                    print(f"  Sample title: {title_el.get_text(strip=True)[:80]}")
                break

        if jobs_found == 0:
            # Debug: show page structure
            body = soup.select_one("body")
            if body:
                text = body.get_text(" ", strip=True)[:300]
                print(f"  Page text preview: {text}")

    except Exception as e:
        print(f"  Error: {e}")
        traceback.print_exc()
    finally:
        driver.quit()

    return jobs_found

# ============================================================
# Test definitions
# ============================================================
API_TESTS = {
    # API-based (fast, no browser needed)
    "novartis":  ("workday", "Novartis", "novartis", "wd3", "Novartis_Careers", "Pharmaceutical"),
    "sanofi":    ("workday", "Sanofi", "sanofi", "wd3", "SanofiCareers", "Pharmaceutical"),
    "fidelity":  ("workday", "Fidelity Investments", "fmr", "wd1", "FidelityCareers", "Financial Services"),
    "syngenta":  ("smartrecruiters", "Syngenta", "SyngentaGroup", "Agriculture"),
    "morganstanley": ("eightfold", "Morgan Stanley", "morganstanley.eightfold.ai", "Financial Services"),
    "microsoft": ("custom_api", "Microsoft"),
}

SELENIUM_TESTS = {
    # Selenium-based (slower, requires Chrome)
    "apple":     ("custom_selenium", "Apple", "https://jobs.apple.com/en-in/search?location=india-INDC"),
    "google":    ("selenium", "Google", "https://www.google.com/about/careers/applications/jobs/results/?location=India"),
    "tcs":       ("selenium", "TCS", "https://ibegin.tcs.com/iBegin/jobs/search"),
    "infosys":   ("selenium", "Infosys", "https://career.infosys.com/joblist"),
    "wipro":     ("selenium", "Wipro", "https://careers.wipro.com/careers?query=&location=India"),
    "cognizant": ("selenium", "Cognizant", "https://careers.cognizant.com/india-en/jobs/"),
    "goldman":   ("selenium", "Goldman Sachs", "https://higher.gs.com/roles?location=Bengaluru%2C+India"),
    "accenture": ("selenium", "Accenture", "https://www.accenture.com/in-en/careers/jobsearch?jk=&sb=0&vw=0&is_rj=0&ct=India"),
    "ibm":       ("selenium", "IBM", "https://www.ibm.com/careers/search?field_keyword_18[0]=India"),
    "loreal":    ("selenium", "L'Oreal", "https://careers.loreal.com/global/en/search-results?keywords=&location=India"),
    "capgemini": ("selenium", "Capgemini", "https://www.capgemini.com/in-en/careers/join-capgemini/job-search/?search_term=&country=in"),
    "hcl":       ("selenium", "HCL", "https://careers.hcltech.com/jobs?location=India"),
}

ALL_TESTS = {**API_TESTS, **SELENIUM_TESTS}

if __name__ == "__main__":
    target = sys.argv[1].lower() if len(sys.argv) > 1 else None
    test_all_selenium = target == "--all"

    results = {}

    # Determine which tests to run
    if target and target != "--all":
        tests_to_run = {target: ALL_TESTS.get(target)}
        if not tests_to_run[target]:
            print(f"Unknown company: {target}")
            print(f"Available: {', '.join(sorted(ALL_TESTS.keys()))}")
            sys.exit(1)
    elif test_all_selenium:
        tests_to_run = ALL_TESTS
    else:
        tests_to_run = API_TESTS
        print("Testing API-based scrapers only. Use --all to include Selenium tests.\n")

    for key, config in tests_to_run.items():
        try:
            if config[0] == "workday":
                _, name, tenant, instance, career_site, industry = config
                count = test_workday(name, tenant, instance, career_site, industry)
            elif config[0] == "smartrecruiters":
                _, name, company_id, industry = config
                count = test_smartrecruiters(name, company_id, industry)
            elif config[0] == "eightfold":
                _, name, domain, industry = config
                count = test_eightfold(name, domain, industry)
            elif config[0] == "custom_api":
                count = test_microsoft()
            elif config[0] == "custom_selenium":
                count = test_apple_selenium()
            elif config[0] == "selenium":
                _, name, url = config
                count = test_generic_selenium(name, url)
            results[key] = count
        except Exception as e:
            print(f"  [FAILED] {e}")
            traceback.print_exc()
            results[key] = -1

    # Summary
    print(f"\n\n{'='*60}")
    print("TEST SUMMARY")
    print(f"{'='*60}")
    for key, count in results.items():
        icon = "✅" if count > 0 else ("⚠️" if count == 0 else "❌")
        print(f"  {icon} {key:<20} {count} jobs")

    total = sum(c for c in results.values() if c > 0)
    working = sum(1 for c in results.values() if c > 0)
    print(f"\n  Total: {total} jobs from {working}/{len(results)} working scrapers")
    print(f"\n  NOTE: This test limits to 5 jobs per company for speed.")
    print(f"  Run the full scrapers for complete results.")

    if not test_all_selenium and not target:
        print(f"\n  To test Selenium scrapers too, run:")
        print(f"    python test_scrapers_quick.py --all")
