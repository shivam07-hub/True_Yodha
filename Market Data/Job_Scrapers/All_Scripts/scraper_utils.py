"""
Shared utilities for all job scrapers.
Common imports, schema definition, normalization, and save functions.
Version 2.1 - March 2026
"""

import os, re, time, json, random
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================
# 24-Column Canonical Schema (v2.1)
# Added: job_url, business_unit, source_platform, source_api_url
# source_api_url: the API endpoint / URL used to fetch this job record (for debugging broken job_urls)
# ============================================================
COLS = [
    "job_id", "title", "company_name", "job_url", "source_api_url", "business_unit",
    "raw_jd_text", "skills_required", "skills_preferred",
    "min_years_experience", "max_years_experience",
    "seniority_level", "location_city", "location_country",
    "work_mode", "employment_type",
    "degree_required", "degree_preferred_field",
    "industry", "salary_min", "salary_max", "salary_currency",
    "date_posted", "is_active", "source_platform"
]

# ============================================================
# Skills Database for extraction
# ============================================================
# ISO 3166-1 alpha-2 → full country name (used by SmartRecruiters API)
# ============================================================
ISO2_TO_COUNTRY = {
    "af":"Afghanistan","al":"Albania","dz":"Algeria","ar":"Argentina","au":"Australia",
    "at":"Austria","be":"Belgium","br":"Brazil","bg":"Bulgaria","ca":"Canada",
    "cl":"Chile","cn":"China","co":"Colombia","hr":"Croatia","cz":"Czech Republic",
    "dk":"Denmark","eg":"Egypt","fi":"Finland","fr":"France","de":"Germany",
    "gr":"Greece","hk":"Hong Kong","hu":"Hungary","in":"India","id":"Indonesia",
    "ie":"Ireland","il":"Israel","it":"Italy","jp":"Japan","jo":"Jordan",
    "ke":"Kenya","kr":"South Korea","kw":"Kuwait","lv":"Latvia","lt":"Lithuania",
    "lu":"Luxembourg","my":"Malaysia","mx":"Mexico","ma":"Morocco","nl":"Netherlands",
    "nz":"New Zealand","ng":"Nigeria","no":"Norway","pk":"Pakistan","pe":"Peru",
    "ph":"Philippines","pl":"Poland","pt":"Portugal","qa":"Qatar","ro":"Romania",
    "ru":"Russia","sa":"Saudi Arabia","rs":"Serbia","sg":"Singapore","sk":"Slovakia",
    "za":"South Africa","es":"Spain","se":"Sweden","ch":"Switzerland","tw":"Taiwan",
    "th":"Thailand","tn":"Tunisia","tr":"Turkey","ua":"Ukraine","ae":"UAE",
    "gb":"United Kingdom","us":"United States","uy":"Uruguay","vn":"Vietnam",
    "cr":"Costa Rica","do":"Dominican Republic","ec":"Ecuador","gt":"Guatemala",
    "hn":"Honduras","ni":"Nicaragua","pa":"Panama","py":"Paraguay","bo":"Bolivia",
    "ve":"Venezuela","mk":"North Macedonia","ba":"Bosnia and Herzegovina",
    "mt":"Malta","cy":"Cyprus","ee":"Estonia","is":"Iceland","li":"Liechtenstein",
    "md":"Moldova","me":"Montenegro","si":"Slovenia","mu":"Mauritius",
}

# ============================================================
SKILLS_DB = [
    "python", "java", "c++", "c#", "javascript", "typescript", "react", "angular",
    "vue", "node.js", "sql", "mysql", "postgresql", "mongodb", "oracle", "aws",
    "azure", "gcp", "docker", "kubernetes", "jenkins", "git", "agile", "scrum",
    "machine learning", "deep learning", "nlp", "tableau", "power bi", "excel",
    "sap", "salesforce", "servicenow", "hadoop", "spark", "kafka", "rest api",
    "microservices", "linux", "bash", "terraform", "ansible", "jira", "confluence",
    "spring boot", "django", "flask", "fastapi", "redis", "elasticsearch",
    "selenium", "r", "scala", "go", "swift", "kotlin", "flutter", "android",
    "ios", "figma", "matlab", "powerpoint", "snowflake", "databricks", "airflow",
    "dbt", "looker", "grafana", "prometheus", "ci/cd", "devops", "data engineering",
    "etl", "data pipeline", "api", "cloud", "saas", "erp", "crm"
]

# ============================================================
# Inference Functions
# ============================================================
def extract_skills(text):
    """Extract matching skills from job description text."""
    if not text:
        return []
    t = text.lower()
    return [s for s in SKILLS_DB if re.search(r"\b" + re.escape(s) + r"\b", t)]

def infer_exp(text):
    """Extract min/max years of experience from text."""
    if not text:
        return None, None
    t = text.lower()
    # Pattern: "5-10 years" or "5 to 10 years"
    r = re.findall(r"(\d+)\s*[-–to]+\s*(\d+)\s*year", t)
    if r:
        return min(int(x[0]) for x in r), max(int(x[1]) for x in r)
    # Pattern: "5+ years" or "5 years"
    r2 = re.findall(r"(\d+)\+?\s*year", t)
    if r2:
        n = int(r2[0])
        return n, None
    return None, None

def infer_seniority(title, jd=""):
    """Infer seniority level from title and job description."""
    t = (title + " " + jd).lower()
    if any(k in t for k in ["intern", "trainee", "fresher", "entry level", "graduate trainee"]):
        return "junior"
    if any(k in t for k in ["lead", "manager", "head", "director", "vp ", "principal", "architect", "chief"]):
        return "lead"
    if any(k in t for k in ["senior", "sr.", "sr ", "staff engineer", "expert"]):
        return "senior"
    if any(k in t for k in ["junior", "jr.", "associate", "entry"]):
        return "junior"
    return "mid"

def infer_work_mode(text):
    """Infer work mode from text."""
    t = text.lower()
    if "hybrid" in t:
        return "hybrid"
    if "remote" in t or "work from home" in t or "wfh" in t:
        return "remote"
    return "onsite"

def infer_emp_type(text):
    """Infer employment type from text."""
    t = text.lower()
    if "intern" in t:
        return "internship"
    if "contract" in t or "temporary" in t:
        return "contract"
    if "part-time" in t or "part time" in t:
        return "part-time"
    return "full-time"

def infer_degree(text):
    """Infer degree requirement from text."""
    t = text.lower()
    if "phd" in t or "doctorate" in t:
        return "PhD"
    if "master" in t or "m.tech" in t or "mba" in t or "m.s." in t:
        return "Masters"
    if any(k in t for k in ["bachelor", "b.tech", "b.e", "b.sc", "btech", "undergraduate", "b.s."]):
        return "Bachelors"
    if "diploma" in t:
        return "Diploma"
    return None

def infer_degree_field(text):
    """Infer preferred degree field from text."""
    t = text.lower()
    if any(k in t for k in ["computer science", "cse", "information technology", "software engineering"]):
        return "Computer Science / IT"
    if any(k in t for k in ["electrical", "electronics", "ece", "eee"]):
        return "Electrical / Electronics"
    if "mechanical" in t:
        return "Mechanical"
    if any(k in t for k in ["finance", "accounting", "commerce", "economics", "ca ", "chartered"]):
        return "Finance / Commerce"
    if any(k in t for k in ["life science", "biology", "biotech", "pharmacy", "pharmaceutical"]):
        return "Life Sciences"
    if "mba" in t or "management" in t or "business admin" in t:
        return "Business / Management"
    if any(k in t for k in ["data science", "statistics", "mathematics", "analytics"]):
        return "Data Science / Statistics"
    return None

# ============================================================
# Normalize a raw job dict into the canonical schema
# ============================================================
def normalize(job):
    """Normalize a raw job dictionary into the 24-column canonical schema."""
    jd = job.get("raw_jd_text", "") or ""
    title = job.get("title", "") or ""
    mn, mx = infer_exp(jd)
    skills_all = extract_skills(jd)
    half = max(1, len(skills_all) // 2)

    out = {k: None for k in COLS}
    out.update(job)

    # --- New v2.1 fields ---
    if not out.get("job_url"):
        out["job_url"] = ""
    if not out.get("source_api_url"):
        out["source_api_url"] = ""
    if not out.get("business_unit"):
        out["business_unit"] = ""
    if not out.get("source_platform"):
        out["source_platform"] = ""

    if not out["skills_required"]:
        out["skills_required"] = skills_all[:half]
    if not out["skills_preferred"]:
        out["skills_preferred"] = skills_all[half:]
    if out["min_years_experience"] is None:
        out["min_years_experience"] = mn
    if out["max_years_experience"] is None:
        out["max_years_experience"] = mx
    if not out["seniority_level"]:
        out["seniority_level"] = infer_seniority(title, jd)
    if not out["work_mode"]:
        out["work_mode"] = infer_work_mode(jd + " " + (out.get("location_city", "") or ""))
    if not out["employment_type"]:
        out["employment_type"] = infer_emp_type(jd + " " + title)
    if not out["degree_required"]:
        out["degree_required"] = infer_degree(jd)
    if not out["degree_preferred_field"]:
        out["degree_preferred_field"] = infer_degree_field(jd)

    out["location_country"] = "India"
    if not out["salary_currency"]:
        out["salary_currency"] = "INR"
    out["is_active"] = True

    for k in ["skills_required", "skills_preferred"]:
        v = out[k]
        if isinstance(v, str):
            out[k] = [x.strip() for x in v.split(",") if x.strip()]
        if not out[k]:
            out[k] = []

    return {k: out[k] for k in COLS}

# ============================================================
# Save results to CSV and Excel
# ============================================================
def save_results(jobs, company_name, output_dir):
    """Normalize jobs, deduplicate, and save to CSV + XLSX.

    Standardized output (13 columns — same across ALL companies):
      Company, Role, Location, Date Posted, Work Mode, Employment Type,
      Seniority, Business Unit, Industry,
      Job Description, Primary Skills Required, Secondary Skills Required, URL

    Also saves a full 24-column FULL_ version for orchestrator/internal use.
    """
    if not jobs:
        print(f"  [WARN] No jobs found for {company_name}")
        return None

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame([normalize(j) for j in jobs], columns=COLS)
    df = df.drop_duplicates(subset=["job_id", "title", "company_name"], keep="first")

    # Convert list columns to pipe-delimited strings for CSV
    for col in ["skills_required", "skills_preferred"]:
        df[col] = df[col].apply(lambda x: " | ".join(x) if isinstance(x, list) else (x or ""))

    date_tag = datetime.now().strftime("%Y-%m-%d")

    # --- Standardized output (user-facing, consistent 13-column schema) ---
    out_df = df.rename(columns={
        "company_name":    "Company",
        "title":           "Role",
        "location_city":   "Location",
        "date_posted":     "Date Posted",
        "work_mode":       "Work Mode",
        "employment_type": "Employment Type",
        "seniority_level": "Seniority",
        "business_unit":   "Business Unit",
        "industry":        "Industry",
        "raw_jd_text":     "Job Description",
        "skills_required": "Primary Skills Required",
        "skills_preferred":"Secondary Skills Required",
        "job_url":         "URL",
    })
    STD_COLS = [
        "Company", "Role", "Location", "Date Posted", "Work Mode", "Employment Type",
        "Seniority", "Business Unit", "Industry",
        "Job Description", "Primary Skills Required", "Secondary Skills Required", "URL",
    ]
    std_df = out_df[STD_COLS]

    csv_path = output_dir / f"{company_name}_jobs_{date_tag}.csv"
    xlsx_path = output_dir / f"{company_name}_jobs_{date_tag}.xlsx"
    std_df.to_csv(csv_path, index=False, encoding="utf-8")
    std_df.to_excel(xlsx_path, index=False, engine="openpyxl")

    # --- Full 24-column version (internal) ---
    full_csv = output_dir / f"{company_name}_jobs_FULL_{date_tag}.csv"
    df.to_csv(full_csv, index=False, encoding="utf-8")

    print(f"  [OK] Saved {len(df)} jobs -> {csv_path.name}")
    if len(df) > 0:
        print(f"       Seniority: {df['seniority_level'].value_counts().to_dict()}")
        print(f"       Work mode: {df['work_mode'].value_counts().to_dict()}")
        has_jd = df['raw_jd_text'].apply(lambda x: bool(x) and len(str(x)) > 50).sum()
        has_url = df['job_url'].apply(lambda x: bool(x) and str(x).startswith("http")).sum()
        has_bu = df['business_unit'].apply(lambda x: bool(x) and len(str(x)) > 1).sum()
        print(f"       Has JD text: {has_jd}/{len(df)}")
        print(f"       Has job URL: {has_url}/{len(df)}")
        print(f"       Has business unit: {has_bu}/{len(df)}")
    return df

# ============================================================
# Helper: Get output directory for a company
# ============================================================
def get_output_dir(company_name):
    """Return the standard output directory for a company.

    Resolves relative to this file so the path is correct regardless of
    where the script is invoked from or whether Job_Scrapers lives under
    the user home directory or inside the project repo.
    """
    # scraper_utils.py lives in …/Job_Scrapers/All_Scripts/
    # parents[0] = All_Scripts, parents[1] = Job_Scrapers
    base = Path(__file__).resolve().parents[1] / "All_CSV_Outputs" / company_name
    date_folder = datetime.now().strftime("%Y_%m_%d")
    out_dir = base / "Outputs" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir

# ============================================================
# Helper: Setup requests session with good defaults
# ============================================================
def get_session():
    """Create a requests session with anti-bot headers."""
    import requests
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-IN,en;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
    })
    return session

# ============================================================
# Helper: Setup Selenium driver
# ============================================================
def setup_selenium():
    """Create a headless Chrome driver via Selenium."""
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from webdriver_manager.chrome import ChromeDriverManager

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.execute_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
    return driver

# ============================================================
# Helper: Setup Playwright browser (async)
# ============================================================
async def setup_playwright():
    """Create a Playwright browser and context."""
    from playwright.async_api import async_playwright
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ]
    )
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
        locale="en-IN",
        timezone_id="Asia/Kolkata",
    )
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        window.chrome = {runtime: {}};
    """)
    return pw, browser, context

# ============================================================
# Helper: Clean HTML to plain text
# ============================================================
def html_to_text(html_str):
    """Convert HTML string to plain text."""
    if not html_str:
        return ""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_str, "html.parser")
    return soup.get_text(" ", strip=True)

# ============================================================
# WORKDAY SCRAPER - Generic for all Workday-based companies
# TESTED: Novartis (115 India jobs), Sanofi (same API pattern)
# Key: Uses locationCountry facet ID for precise India filtering
# ============================================================
def scrape_workday(tenant, instance, career_site, company_name, industry,
                   location_filter="", max_jobs=500):
    """
    Generic Workday scraper using the /wday/cxs/ JSON API.
    Works for: Novartis, Sanofi, Fidelity, Capgemini, HCL, etc.

    location_filter: Country name to narrow results (e.g. "India"), or "" for all jobs.
    When empty, all jobs are fetched and location_country is left as-is from the API.

    APPROACH (verified via browser testing March 2026):
    1. POST to /wday/cxs/{tenant}/{career_site}/jobs with limit=1 to get facets
    2. If location_filter set: find the locationCountry facet UUID and filter
       If location_filter empty: fetch all jobs without facet filter
    3. For each job, GET the detail page for full JD text

    Facet structure (Workday API):
    - facets[].facetParameter = "locationMainGroup"
    - facets[].values[0].facetParameter = "locationCountry"
    - facets[].values[0].values[] = {descriptor: "India", id: "<uuid>", count: N}

    Job posting keys: title, locationsText, externalPath, bulletFields[]
    Job detail keys (jobPostingInfo): title, jobDescription (HTML), location,
                    additionalLocations, postedOn, jobReqId, startDate, timeType
    """
    import requests

    base_url = f"https://{tenant}.{instance}.myworkdayjobs.com"
    api_url = f"{base_url}/wday/cxs/{tenant}/{career_site}/jobs"

    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    })

    broad_mode = not location_filter  # True when fetching all jobs globally
    print(f"  Scraping {company_name} via Workday API: {api_url}")
    if broad_mode:
        print(f"  Mode: BROAD (no location filter — fetching all global jobs)")
    else:
        print(f"  Mode: FILTERED (location_filter='{location_filter}')")

    # ---- STEP 1: Discover location facet ID (skip in broad mode) ----
    india_facet_id = None
    if not broad_mode:
        try:
            resp = session.post(api_url, json={
                "appliedFacets": {}, "limit": 1, "offset": 0, "searchText": ""
            }, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                print(f"  Total jobs on portal: {data.get('total', '?')}")

                # Navigate: facets -> locationMainGroup -> values[0] (locationCountry) -> values
                for facet in data.get("facets", []):
                    if facet.get("facetParameter") == "locationMainGroup":
                        for sub_group in facet.get("values", []):
                            if sub_group.get("facetParameter") == "locationCountry":
                                for country in sub_group.get("values", []):
                                    if country.get("descriptor", "").lower() == location_filter.lower():
                                        india_facet_id = country["id"]
                                        india_count = country.get("count", "?")
                                        print(f"  Found '{location_filter}' facet: id={india_facet_id}, count={india_count}")
                                        break
                        break
            else:
                print(f"  [ERROR] Initial request returned HTTP {resp.status_code}")
        except Exception as e:
            print(f"  [ERROR] Failed to discover facets: {e}")

    if not broad_mode and not india_facet_id:
        print(f"  [WARN] Could not find '{location_filter}' facet ID. Falling back to text-based filtering.")

    # ---- STEP 2: Fetch India jobs with facet filter ----
    jobs = []
    offset = 0
    limit = 20
    known_total = None  # Capture total from first page only

    while offset < max_jobs:
        # Use facet filter if available, otherwise fetch all and filter by text
        if india_facet_id:
            payload = {
                "appliedFacets": {"locationCountry": [india_facet_id]},
                "limit": limit,
                "offset": offset,
                "searchText": ""
            }
        else:
            payload = {
                "appliedFacets": {},
                "limit": limit,
                "offset": offset,
                "searchText": ""
            }

        try:
            resp = session.post(api_url, json=payload, timeout=30)
            if resp.status_code != 200:
                print(f"  [ERROR] HTTP {resp.status_code} at offset {offset}")
                break

            data = resp.json()
            job_postings = data.get("jobPostings", [])
            page_total = data.get("total", 0)

            # Lock in total from first successful response — Workday
            # sometimes returns total=0 on subsequent pages with facet
            # filters, which caused premature pagination exit.
            if known_total is None and page_total > 0:
                known_total = page_total
                print(f"  Total India jobs reported by API: {known_total}")

            if not job_postings:
                break

            print(f"  Page offset={offset}: {len(job_postings)} jobs (page_total={page_total}, known_total={known_total})")

            for jp in job_postings:
                loc_text = jp.get("locationsText", "")

                # Text-based location filter: only applies when a filter is set
                # and no facet was found (fallback mode). In broad mode, skip all location checks.
                if not broad_mode and not india_facet_id and location_filter:
                    if location_filter.lower() not in loc_text.lower():
                        continue

                # ---- STEP 3: Fetch full job details for JD text ----
                external_path = jp.get("externalPath", "")
                jd_text = ""
                posted_on = ""
                job_location = ""
                job_req_id = ""

                if external_path:
                    try:
                        detail_url = f"{base_url}/wday/cxs/{tenant}/{career_site}/{external_path}"
                        detail_resp = session.get(detail_url, timeout=20)
                        if detail_resp.status_code == 200:
                            detail = detail_resp.json()
                            job_info = detail.get("jobPostingInfo", {})
                            jd_html = job_info.get("jobDescription", "")
                            jd_text = html_to_text(jd_html)
                            posted_on = job_info.get("postedOn", "")
                            job_location = job_info.get("location", "")
                            job_req_id = job_info.get("jobReqId", "")
                            # Also grab additional description if present
                            additional = job_info.get("additionalDescription", "")
                            if additional:
                                jd_text += "\n" + html_to_text(additional)
                        time.sleep(random.uniform(0.3, 0.8))
                    except Exception as e:
                        print(f"    [WARN] Could not fetch details for {external_path}: {e}")

                # Extract city from location text (format: "Hyderabad (Office)" or "3 Locations")
                city = loc_text.split("(")[0].strip() if loc_text else "India"
                if city.endswith(" "):
                    city = city.strip()
                # If location is like "3 Locations", try the detail location
                if city and city[0].isdigit():
                    city = job_location.split(",")[0].strip() if job_location else "India"

                # Get job ID: prefer jobReqId from detail, then bulletFields, then path
                if job_req_id:
                    job_id = job_req_id
                else:
                    bullet_fields = jp.get("bulletFields", [])
                    job_id = bullet_fields[0] if bullet_fields else external_path.split("/")[-1]

                # Build the full job URL from externalPath
                # Workday canonical URLs use /en-US/ — /en/ returns 404 on most tenants
                job_url = f"{base_url}/en-US/{career_site}/{external_path}" if external_path else ""

                # Extract business unit from bulletFields or job category
                bullet_fields = jp.get("bulletFields", [])
                business_unit = bullet_fields[1] if len(bullet_fields) > 1 else ""

                # Derive country from location text when not filtering (broad mode)
                country_val = location_filter if location_filter else loc_text.split("(")[0].strip()

                jobs.append({
                    "job_id": str(job_id),
                    "title": jp.get("title", ""),
                    "company_name": company_name,
                    "job_url": job_url,
                    "source_api_url": api_url,
                    "business_unit": business_unit,
                    "raw_jd_text": jd_text,
                    "location_city": city,
                    "location_country": country_val,
                    "industry": industry,
                    "date_posted": posted_on or datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "salary_currency": "INR",
                    "source_platform": "Workday",
                })

            offset += limit
            if known_total and offset >= known_total:
                break
            time.sleep(random.uniform(0.5, 1.5))

        except Exception as e:
            print(f"  [ERROR] {e}")
            break

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs

# ============================================================
# SMARTRECRUITERS SCRAPER - Generic
# TESTED: Syngenta (39 India jobs via ?country=in)
# Key: Listing API does NOT include JD — must fetch each posting individually
# ============================================================
def scrape_smartrecruiters(company_id, company_name, industry, country="", max_jobs=500):
    """
    Generic SmartRecruiters scraper using public posting API.
    Works for: Syngenta, etc.

    country: ISO 2-letter country code to filter (e.g. "in" for India), or "" for all jobs.
    Pass country=COUNTRY_CODE from your scraper config to control this.

    APPROACH (verified via browser testing March 2026):
    1. GET /v1/companies/{id}/postings?country=in&limit=100 -> listing (no JD)
    2. For each posting, GET /v1/companies/{id}/postings/{postingId} -> full JD

    Listing keys: id, name, refNumber, location{city,country}, releasedDate, createdOn
    Detail keys: jobAd.sections.jobDescription.text (HTML), qualifications, etc.
    """
    import requests

    base_api = f"https://api.smartrecruiters.com/v1/companies/{company_id}/postings"
    session = requests.Session()
    session.headers.update({
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    })

    jobs = []
    offset = 0
    limit = 100

    print(f"  Scraping {company_name} via SmartRecruiters API "
          f"(country='{country}' — {'broad/global' if not country else country})")

    while offset < max_jobs:
        params = {
            "limit": limit,
            "offset": offset,
        }
        if country:
            params["country"] = country  # Only add if set (empty = all countries)

        try:
            resp = session.get(base_api, params=params, timeout=30)
            if resp.status_code != 200:
                print(f"  [ERROR] HTTP {resp.status_code}")
                break

            data = resp.json()
            content = data.get("content", [])

            if not content:
                break

            print(f"  Page offset={offset}: {len(content)} jobs")

            for posting in content:
                loc = posting.get("location", {})
                city = loc.get("city", "") or ""
                iso2 = (loc.get("country", "") or "").lower()
                country_val = ISO2_TO_COUNTRY.get(iso2, iso2.upper()) if iso2 else ""
                posting_id = posting.get("id", "")

                # Fetch individual posting for full JD
                jd_text = ""
                if posting_id:
                    try:
                        detail_resp = session.get(f"{base_api}/{posting_id}", timeout=20)
                        if detail_resp.status_code == 200:
                            detail = detail_resp.json()
                            jd_sections = detail.get("jobAd", {}).get("sections", {})
                            jd_parts = []
                            for section_key in ["jobDescription", "qualifications", "additionalInformation"]:
                                section = jd_sections.get(section_key, {})
                                text = section.get("text", "")
                                if text:
                                    jd_parts.append(html_to_text(text))
                            jd_text = "\n".join(jd_parts)
                        time.sleep(random.uniform(0.3, 0.8))
                    except Exception as e:
                        print(f"    [WARN] Could not fetch details for posting {posting_id}: {e}")

                # If individual fetch failed, try listing-level JD (sometimes present)
                if not jd_text:
                    jd_sections = posting.get("jobAd", {}).get("sections", {})
                    for section_key in ["jobDescription", "qualifications"]:
                        section = jd_sections.get(section_key, {})
                        text = section.get("text", "")
                        if text:
                            jd_text += html_to_text(text) + "\n"

                # Get posted date
                created = posting.get("releasedDate", posting.get("createdOn", ""))
                if created:
                    posted_date = created[:10]
                else:
                    posted_date = datetime.now().strftime("%Y-%m-%d")

                # Build job URL
                company_slug = posting.get("company", {}).get("identifier", company_id)
                job_url = f"https://jobs.smartrecruiters.com/{company_slug}/{posting_id}"

                # Business unit / department
                department = posting.get("department", {})
                business_unit = department.get("label", department.get("id", "")) if isinstance(department, dict) else str(department)

                jobs.append({
                    "job_id": str(posting.get("refNumber", posting_id)),
                    "title": posting.get("name", ""),
                    "company_name": company_name,
                    "job_url": job_url,
                    "source_api_url": base_api,
                    "business_unit": business_unit,
                    "raw_jd_text": jd_text.strip(),
                    "location_city": city,
                    "location_country": country_val,
                    "industry": industry,
                    "date_posted": posted_date,
                    "is_active": True,
                    "salary_currency": "INR",
                    "source_platform": "SmartRecruiters",
                })

            if len(content) < limit:
                break
            offset += limit
            time.sleep(random.uniform(0.5, 1.0))

        except Exception as e:
            print(f"  [ERROR] {e}")
            break

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs

# ============================================================
# EIGHTFOLD SCRAPER - Generic
# ============================================================
def scrape_eightfold(domain, company_name, industry, location_filter="", max_jobs=500):
    """
    Generic Eightfold AI scraper.
    Works for: Morgan Stanley, etc.

    location_filter: Pass a location string to filter API results (e.g. "India"),
                     or "" to fetch all jobs globally.

    Args:
        domain: Eightfold domain (e.g., 'morganstanley.eightfold.ai')
        company_name: Display name
        industry: Industry string
    """
    import requests

    api_url = f"https://{domain}/api/apply/v2/jobs"
    broad_mode = not location_filter
    session = requests.Session()
    session.headers.update({
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    })

    jobs = []
    page = 1
    page_size = 50

    print(f"  Scraping {company_name} via Eightfold API: {domain} "
          f"({'global' if broad_mode else location_filter})")

    while len(jobs) < max_jobs:
        params = {
            "num": page_size,
            "start": (page - 1) * page_size,
            "domain": domain.split(".")[0],
        }
        if location_filter:
            params["location"] = location_filter  # Only add if filtering

        try:
            resp = session.get(api_url, params=params, timeout=30)
            if resp.status_code != 200:
                print(f"  [ERROR] HTTP {resp.status_code}")
                break

            data = resp.json()
            positions = data.get("positions", data.get("results", []))

            if not positions:
                break

            print(f"  Page {page}: {len(positions)} jobs")

            for pos in positions:
                loc = pos.get("location", "")
                # Skip location check in broad mode; apply text filter otherwise
                if not broad_mode and location_filter and location_filter.lower() not in loc.lower():
                    continue

                city = loc.split(",")[0].strip() if loc else ""
                jd_text = html_to_text(pos.get("description", ""))

                job_id = str(pos.get("id", pos.get("requisition_id", "")))
                job_url = f"https://{domain}/careers?pid={job_id}" if job_id else ""
                business_unit = pos.get("team", pos.get("department", pos.get("category", "")))

                # Country: use filter name if set, otherwise derive from location string
                country_parts = loc.split(",") if loc else []
                country_val = location_filter if location_filter else (country_parts[-1].strip() if len(country_parts) > 1 else loc)

                jobs.append({
                    "job_id": job_id,
                    "title": pos.get("name", pos.get("title", "")),
                    "company_name": company_name,
                    "job_url": job_url,
                    "source_api_url": api_url,
                    "business_unit": business_unit if isinstance(business_unit, str) else str(business_unit),
                    "raw_jd_text": jd_text,
                    "location_city": city,
                    "location_country": country_val,
                    "industry": industry,
                    "date_posted": pos.get("t_update", pos.get("date_created", datetime.now().strftime("%Y-%m-%d")))[:10],
                    "is_active": True,
                    "salary_currency": "INR",
                    "source_platform": "Eightfold",
                })

            if len(positions) < page_size:
                break
            page += 1
            time.sleep(random.uniform(0.5, 1.5))

        except Exception as e:
            print(f"  [ERROR] {e}")
            break

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs

# ============================================================
# SELENIUM GENERIC SCRAPER (for JS-heavy custom portals)
# ============================================================
def scrape_with_selenium(url, company_name, industry,
                         job_card_selector, title_selector, location_selector,
                         next_button_selector=None, max_pages=20,
                         wait_selector=None, extract_jd_link=None):
    """
    Generic Selenium scraper for custom career portals.

    Args:
        url: Starting URL
        company_name: Display name
        industry: Industry string
        job_card_selector: CSS selector for job cards
        title_selector: CSS selector for title within card
        location_selector: CSS selector for location within card
        next_button_selector: CSS selector for next/load-more button
        max_pages: Max pages to scrape
        wait_selector: CSS selector to wait for before scraping
        extract_jd_link: Function(card_element) -> url for job details
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from bs4 import BeautifulSoup

    driver = setup_selenium()
    jobs = []

    try:
        print(f"  Scraping {company_name} via Selenium: {url}")
        driver.get(url)
        time.sleep(5)

        if wait_selector:
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector))
                )
            except:
                print(f"  [WARN] Timeout waiting for {wait_selector}")

        for page_num in range(max_pages):
            soup = BeautifulSoup(driver.page_source, "lxml")
            cards = soup.select(job_card_selector)

            if not cards:
                print(f"  Page {page_num + 1}: No job cards found with selector '{job_card_selector}'")
                # Try to debug: print first 500 chars of page
                if page_num == 0:
                    body = soup.select_one("body")
                    if body:
                        text = body.get_text(" ", strip=True)[:300]
                        print(f"  Page text preview: {text}")
                break

            print(f"  Page {page_num + 1}: {len(cards)} job cards")

            for card in cards:
                title_el = card.select_one(title_selector)
                title = title_el.get_text(strip=True) if title_el else ""

                loc_el = card.select_one(location_selector)
                loc = loc_el.get_text(strip=True) if loc_el else "India"
                city = loc.split(",")[0].strip()

                # Get job ID from link or data attribute
                link_el = card.select_one("a[href]")
                href = link_el.get("href", "") if link_el else ""
                job_id = href.split("/")[-1] if href else str(len(jobs))

                jd_text = card.get_text(" ", strip=True)

                if title:
                    # Build full URL
                    if href and not href.startswith("http"):
                        from urllib.parse import urljoin
                        full_url = urljoin(url, href)
                    else:
                        full_url = href

                    jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company_name": company_name,
                        "job_url": full_url,
                        "source_api_url": url,
                        "business_unit": "",
                        "raw_jd_text": jd_text,
                        "location_city": city,
                        "location_country": "India",
                        "industry": industry,
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True,
                        "salary_currency": "INR",
                        "source_platform": "Selenium",
                    })

            # Try to go to next page
            if next_button_selector:
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, next_button_selector)
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(3)
                except:
                    break
            else:
                break

    finally:
        driver.quit()

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs

# ============================================================
# Title validation — rejects garbage from Selenium scrapes
# ============================================================
GARBAGE_KEYWORDS = [
    "sort by", "clear all", "filter", "show more", "load more",
    "next page", "previous", "sign in", "log in", "submit",
    "press tab", "cookie", "accept", "privacy", "subscribe",
    "showing", "page", "results", "search", "menu", "navigation",
    "javascript:", "support", "employment statement",
]

def is_valid_job_title(title):
    """Return True if title looks like a real job title, not UI garbage."""
    if not title:
        return False
    t = title.strip()
    # Too short or too long
    if len(t) < 4 or len(t) > 200:
        return False
    # Contains garbage keywords
    tl = t.lower()
    if any(g in tl for g in GARBAGE_KEYWORDS):
        return False
    # Mostly digits or special chars
    alpha_ratio = sum(c.isalpha() for c in t) / max(len(t), 1)
    if alpha_ratio < 0.4:
        return False
    return True

# ============================================================
# GREENHOUSE SCRAPER - Generic for all Greenhouse-based companies
# TESTED: Stripe (confirmed public API - no auth required)
# Key: Two-step — list all jobs, then fetch each for full JD text
# ============================================================
def scrape_greenhouse(board_token, company_name, industry,
                      location_filter="", max_jobs=500):
    """
    Generic Greenhouse scraper using the public job board API.
    Works for: Stripe, and any company on boards.greenhouse.io.

    APPROACH (verified via API testing March 2026):
    1. GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
       -> Returns all jobs with basic info; content=true includes the job HTML body
    2. Filter by location for India jobs
    3. For each job, optionally GET individual endpoint for richer JD (already in content)

    Job keys: id, title, location.name, absolute_url, departments[], offices[],
              content (HTML JD), updated_at, metadata[]
    """
    import requests

    base_api = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs"
    session = requests.Session()
    session.headers.update({
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    })

    print(f"  Scraping {company_name} via Greenhouse API (board: {board_token})")

    # Fetch all jobs with full content in one request (Greenhouse supports this)
    jobs = []
    try:
        resp = session.get(base_api, params={"content": "true"}, timeout=30)
        if resp.status_code != 200:
            print(f"  [ERROR] Greenhouse API returned HTTP {resp.status_code}")
            return jobs

        data = resp.json()
        all_postings = data.get("jobs", [])
        print(f"  Total jobs on Greenhouse board: {len(all_postings)}")

        # Apply location filter (skip in broad mode)
        if location_filter:
            filtered_postings = []
            for posting in all_postings:
                loc = posting.get("location", {}).get("name", "")
                offices = posting.get("offices", [])
                office_locations = [o.get("location", "") + " " + o.get("name", "") for o in offices]
                all_locs = loc + " " + " ".join(office_locations)
                if location_filter.lower() in all_locs.lower():
                    filtered_postings.append(posting)
            print(f"  Jobs after location filter ('{location_filter}'): {len(filtered_postings)}")
        else:
            filtered_postings = all_postings
            print(f"  Mode: BROAD — using all {len(filtered_postings)} jobs (no location filter)")

        india_postings = filtered_postings  # keep old variable name for compatibility

        for posting in india_postings[:max_jobs]:
            loc = posting.get("location", {}).get("name", "India")
            city = loc.split(",")[0].strip() if loc else "India"

            # Department / business unit
            departments = posting.get("departments", [])
            dept = departments[0].get("name", "") if departments else ""

            # JD text from content field (HTML)
            jd_html = posting.get("content", "")
            jd_text = html_to_text(jd_html) if jd_html else ""

            # Date
            updated = posting.get("updated_at", posting.get("created_at", ""))
            date_posted = updated[:10] if updated else datetime.now().strftime("%Y-%m-%d")

            job_id = str(posting.get("id", ""))
            job_url = posting.get("absolute_url", "")
            if not job_url and job_id:
                job_url = f"https://boards.greenhouse.io/{board_token}/jobs/{job_id}"

            jobs.append({
                "job_id": job_id,
                "title": posting.get("title", ""),
                "company_name": company_name,
                "job_url": job_url,
                "source_api_url": base_api,
                "business_unit": dept,
                "raw_jd_text": jd_text,
                "location_city": city,
                "location_country": "India",
                "industry": industry,
                "date_posted": date_posted,
                "is_active": True,
                "salary_currency": "INR",
                "source_platform": "Greenhouse",
            })

    except Exception as e:
        print(f"  [ERROR] Greenhouse scraper failed: {e}")

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs


# ============================================================
# AVATURE SCRAPER - Selenium-based (no public API)
# Used by: Synopsys
# Key: Avature renders via JS; must use Selenium to navigate filters
# ============================================================
def scrape_avature(base_url, company_name, industry,
                   location_filter="", max_pages=15):
    """
    Generic Avature career site scraper using Selenium.
    Used by companies that host on .avature.net/careers.

    APPROACH:
    1. Load the careers search page filtered for India
    2. Paginate through results via Selenium
    3. For each card, extract title, location, link
    4. Optionally fetch JD detail pages

    Common Avature selectors (verified March 2026):
    - Job cards: .paginationData li, [class*='job-link'], tr.job-row
    - Title: .jobTitle, h3 a, td.jobTitle a
    - Location: .jobLocation, td.location
    - Next: a[aria-label='Next'], .nextPage
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from bs4 import BeautifulSoup

    driver = setup_selenium()
    jobs = []

    try:
        print(f"  Scraping {company_name} via Avature Selenium: {base_url}")
        driver.get(base_url)
        time.sleep(8)

        # Wait for results
        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, ".paginationData li, .job-item, tr.data-row, [class*='job-link'], [class*='jobTitle']")
                )
            )
        except:
            print("  [WARN] Timed out waiting for Avature to load — continuing anyway")
            time.sleep(5)

        for page_num in range(max_pages):
            soup = BeautifulSoup(driver.page_source, "lxml")

            # Avature layouts vary — try multiple selectors in priority order
            cards = (
                soup.select(".paginationData li") or
                soup.select("tr.data-row") or
                soup.select("[class*='job-item']") or
                soup.select("[class*='jobTitle']")
            )

            if not cards:
                print(f"  Page {page_num+1}: No cards found")
                if page_num == 0:
                    body = soup.select_one("body")
                    print(f"  Page preview: {body.get_text(' ', strip=True)[:200] if body else '(empty)'}")
                break

            new_jobs = 0
            for card in cards:
                title_el = (card.select_one(".jobTitle a") or
                            card.select_one("h3 a") or
                            card.select_one("a.job-link") or
                            card.select_one("td.title a") or
                            card.select_one("a[href]"))
                title = title_el.get_text(strip=True) if title_el else ""
                href  = title_el.get("href", "") if title_el else ""

                loc_el = (card.select_one(".jobLocation") or
                          card.select_one("td.location") or
                          card.select_one("[class*='location']"))
                loc = loc_el.get_text(strip=True) if loc_el else "India"

                if not is_valid_job_title(title):
                    continue
                # Skip location check in broad mode
                if location_filter and location_filter.lower() not in loc.lower():
                    continue

                full_url = href if href.startswith("http") else base_url.split("/careers")[0] + href if href else ""
                job_id = href.split("/")[-1] if href else str(len(jobs))

                jobs.append({
                    "job_id": job_id,
                    "title": title,
                    "company_name": company_name,
                    "job_url": full_url,
                    "source_api_url": base_url,
                    "business_unit": "",
                    "raw_jd_text": card.get_text(" ", strip=True),
                    "location_city": loc.split(",")[0].strip(),
                    "location_country": "India",
                    "industry": industry,
                    "date_posted": datetime.now().strftime("%Y-%m-%d"),
                    "is_active": True,
                    "salary_currency": "INR",
                    "source_platform": "Avature",
                })
                new_jobs += 1

            print(f"  Page {page_num+1}: {new_jobs} new jobs (total: {len(jobs)})")

            if new_jobs == 0 and page_num > 0:
                break

            # Try to click Next
            try:
                next_btn = driver.find_element(
                    By.CSS_SELECTOR,
                    "a[aria-label='Next'], .nextPage a, [class*='next'] a, "
                    "a[title='Next'], button[aria-label*='next' i]"
                )
                driver.execute_script("arguments[0].click();", next_btn)
                time.sleep(4)
            except:
                break

    finally:
        driver.quit()

    print(f"  Total {company_name} India jobs: {len(jobs)}")
    return jobs


print("scraper_utils.py loaded successfully")
print(f"Schema: {len(COLS)} columns")
print(f"Skills DB: {len(SKILLS_DB)} skills")
