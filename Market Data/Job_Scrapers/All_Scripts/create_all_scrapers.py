import json
from pathlib import Path

K = {"display_name":"Python [conda env:JobAnalyser]","language":"python","name":"conda-env-JobAnalyser-py"}
S = Path.home() / "Job_Scrapers" / "All_Scripts"

def nb(cells):
    return {"nbformat":4,"nbformat_minor":5,
            "metadata":{"kernelspec":K,"language_info":{"name":"python","version":"3.10.0"}},
            "cells":cells}
def c(src): return {"cell_type":"code","execution_count":None,"metadata":{},"outputs":[],"source":src}
def m(src): return {"cell_type":"markdown","metadata":{},"source":src}
def write(fname, cells):
    with open(S/fname,"w") as f: json.dump(nb(cells),f,indent=1)
    print("Written:",fname)

INSTALL = "!pip install selenium webdriver-manager pandas openpyxl requests beautifulsoup4 lxml -q"

SETUP = '''
import os, re, time, json
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

COLS = ["job_id","title","company_name","raw_jd_text","skills_required","skills_preferred",
    "min_years_experience","max_years_experience","seniority_level","location_city",
    "location_country","work_mode","employment_type","degree_required",
    "degree_preferred_field","industry","salary_min","salary_max",
    "salary_currency","date_posted","is_active"]

SKILLS_DB = ["python","java","c++","c#","javascript","typescript","react","angular","vue","node.js",
    "sql","mysql","postgresql","mongodb","oracle","aws","azure","gcp","docker","kubernetes",
    "jenkins","git","agile","scrum","machine learning","deep learning","nlp","tableau",
    "power bi","excel","sap","salesforce","servicenow","hadoop","spark","kafka",
    "rest api","microservices","linux","bash","terraform","ansible","jira","confluence",
    "spring boot","django","flask","fastapi","redis","elasticsearch","selenium",
    "r","scala","go","swift","kotlin","flutter","android","ios","figma","matlab"]

def extract_skills(text):
    if not text: return []
    t = text.lower()
    return [s for s in SKILLS_DB if re.search(r"\\b"+re.escape(s)+r"\\b", t)]

def infer_exp(text):
    if not text: return None, None
    r = re.findall(r"(\\d+)\\s*[-to]+\\s*(\\d+)\\s*year", text.lower())
    if r: return min(int(x[0]) for x in r), max(int(x[1]) for x in r)
    r2 = re.findall(r"(\\d+)\\+?\\s*year", text.lower())
    if r2: n=int(r2[0]); return n, None
    return None, None

def infer_seniority(title, jd=""):
    t=(title+" "+jd).lower()
    if any(k in t for k in ["intern","trainee","fresher","entry level","graduate trainee"]): return "junior"
    if any(k in t for k in ["lead","manager","head","director","vp ","principal","architect","chief"]): return "lead"
    if any(k in t for k in ["senior","sr.","sr ","staff engineer","expert"]): return "senior"
    if any(k in t for k in ["junior","jr.","associate","entry"]): return "junior"
    return "mid"

def infer_work_mode(text):
    t=text.lower()
    if "hybrid" in t: return "hybrid"
    if "remote" in t or "work from home" in t or "wfh" in t: return "remote"
    return "onsite"

def infer_emp_type(text):
    t=text.lower()
    if "intern" in t: return "internship"
    if "contract" in t or "temporary" in t: return "contract"
    if "part-time" in t or "part time" in t: return "part-time"
    return "full-time"

def infer_degree(text):
    t=text.lower()
    if "phd" in t or "doctorate" in t: return "PhD"
    if "master" in t or "m.tech" in t or "mba" in t: return "Masters"
    if any(k in t for k in ["bachelor","b.tech","b.e","b.sc","btech","undergraduate"]): return "Bachelors"
    if "diploma" in t: return "Diploma"
    return None

def infer_degree_field(text):
    t=text.lower()
    if any(k in t for k in ["computer science","cse","information technology","software engineering"]): return "Computer Science / IT"
    if any(k in t for k in ["electrical","electronics","ece","eee"]): return "Electrical / Electronics"
    if "mechanical" in t: return "Mechanical"
    if any(k in t for k in ["finance","accounting","commerce","economics"]): return "Finance / Commerce"
    if any(k in t for k in ["life science","biology","biotech","pharmacy"]): return "Life Sciences"
    if "mba" in t or "management" in t: return "Business / Management"
    return None

def normalize(job):
    jd=job.get("raw_jd_text",""or"")
    title=job.get("title","")or""
    mn,mx=infer_exp(jd)
    skills_all=extract_skills(jd)
    half=max(1,len(skills_all)//2)
    out={k:None for k in COLS}
    out.update(job)
    if not out["skills_required"]: out["skills_required"]=skills_all[:half]
    if not out["skills_preferred"]: out["skills_preferred"]=skills_all[half:]
    if out["min_years_experience"] is None: out["min_years_experience"]=mn
    if out["max_years_experience"] is None: out["max_years_experience"]=mx
    if not out["seniority_level"]: out["seniority_level"]=infer_seniority(title,jd)
    if not out["work_mode"]: out["work_mode"]=infer_work_mode(jd+" "+(out.get("location_city","")or""))
    if not out["employment_type"]: out["employment_type"]=infer_emp_type(jd)
    if not out["degree_required"]: out["degree_required"]=infer_degree(jd)
    if not out["degree_preferred_field"]: out["degree_preferred_field"]=infer_degree_field(jd)
    out["location_country"]="India"
    if not out["salary_currency"]: out["salary_currency"]="INR"
    out["is_active"]=True
    for k in ["skills_required","skills_preferred"]:
        v=out[k]
        if isinstance(v,str): out[k]=[x.strip() for x in v.split(",") if x.strip()]
        if not out[k]: out[k]=[]
    return {k:out[k] for k in COLS}

def save_results(jobs, company_name, output_dir):
    if not jobs: print(f"No jobs for {company_name}"); return None
    df=pd.DataFrame([normalize(j) for j in jobs],columns=COLS)
    df=df.drop_duplicates(subset=["job_id","title","company_name"],keep="first")
    for col in ["skills_required","skills_preferred"]:
        df[col]=df[col].apply(lambda x:"|".join(x) if isinstance(x,list) else (x or ""))
    date_tag=datetime.now().strftime("%Y-%m-%d")
    csv_path=output_dir/f"{company_name}_jobs_{date_tag}.csv"
    xlsx_path=output_dir/f"{company_name}_jobs_{date_tag}.xlsx"
    df.to_csv(csv_path,index=False,encoding="utf-8")
    df.to_excel(xlsx_path,index=False,engine="openpyxl")
    print(f"Saved {len(df)} jobs -> {csv_path}")
    print(df[["title","location_city","seniority_level","work_mode","employment_type","date_posted"]].head(10).to_string())
    return df

def setup_driver():
    opts=Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches",["enable-automation"])
    opts.add_experimental_option("useAutomationExtension",False)
    opts.add_argument("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
    service=Service(ChromeDriverManager().install())
    driver=webdriver.Chrome(service=service,options=opts)
    driver.execute_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
    return driver

print("Setup complete. Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
'''

PATH_CELL = '''
COMPANY = "{company}"
BASE_DIR = Path.home() / "Job_Scrapers" / COMPANY
MONTH_TAG = datetime.now().strftime("%Y_%m")
OUTPUT_DIR = BASE_DIR / "Outputs" / MONTH_TAG
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
print(f"Output directory: {{OUTPUT_DIR}}")
'''

# ============================================================
# TCS NOTEBOOK
# ============================================================
TCS_SCRAPER = '''
# TCS India Job Scraper - Entry & Lateral
# Source: https://www.tcs.com/careers/india
IMPORT_DATE = datetime.now()
CUTOFF_DATE = IMPORT_DATE - timedelta(days=30)
COMPANY_NAME = "Tata Consultancy Services"
INDUSTRY = "IT Services"

def scrape_tcs_jobs():
    """Scrape TCS India careers page for entry and lateral jobs posted in last 30 days."""
    import requests
    from bs4 import BeautifulSoup
    jobs = []
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.tcs.com/careers/india"
    })

    # TCS uses a backend API for job listings
    categories = [
        {"type": "entry",   "url": "https://www.tcs.com/careers/india/entry-level"},
        {"type": "lateral", "url": "https://www.tcs.com/careers/india/experienced"}
    ]

    for cat in categories:
        try:
            print(f"Scraping TCS {cat[\"type\"]} jobs...")
            # TCS API endpoint discovered via network inspection
            api_url = "https://www.tcs.com/content/global/en-in/home/careers/job-search/jcr:content/root/responsivegrid/column_control/par_0/tcs_career_job_sea.model.json"
            params = {
                "searchText": "",
                "category": cat["type"],
                "location": "India",
                "pageNo": 1,
                "pageSize": 100
            }
            resp = session.get(api_url, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                job_list = data.get("jobList", data.get("jobs", data.get("data", [])))
                for job in job_list:
                    date_str = job.get("postedDate", job.get("postingDate", ""))
                    try:
                        if date_str:
                            post_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
                        else:
                            post_date = datetime.now()
                    except: post_date = datetime.now()
                    if post_date >= CUTOFF_DATE:
                        loc = job.get("location", job.get("jobLocation", ""))
                        city = loc.split(",")[0].strip() if loc else "India"
                        jobs.append({
                            "job_id": str(job.get("jobId", job.get("id", ""))),
                            "title": job.get("jobTitle", job.get("title", "")),
                            "company_name": COMPANY_NAME,
                            "raw_jd_text": job.get("jobDescription", job.get("description", "")),
                            "location_city": city,
                            "location_country": "India",
                            "industry": INDUSTRY,
                            "date_posted": post_date.strftime("%Y-%m-%d"),
                            "is_active": True,
                            "salary_currency": "INR"
                        })
        except Exception as e:
            print(f"Error scraping TCS {cat[\"type\"]}: {e}")

    # Fallback: Selenium scrape if API fails
    if not jobs:
        print("API failed, trying Selenium...")
        driver = setup_driver()
        try:
            for cat in categories:
                driver.get(cat["url"])
                time.sleep(3)
                WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.TAG_NAME, "body")))
                soup = BeautifulSoup(driver.page_source, "lxml")
                # Try common job card patterns
                cards = soup.select(".job-listing, .career-listing, [class*=job-card], article.job")
                for card in cards:
                    title_el = card.select_one("h2,h3,h4,.job-title,.title")
                    title = title_el.get_text(strip=True) if title_el else ""
                    loc_el = card.select_one(".location,.job-location,[class*=location]")
                    loc = loc_el.get_text(strip=True) if loc_el else "India"
                    link_el = card.select_one("a")
                    jid = link_el.get("href","").split("/")[-1] if link_el else str(len(jobs))
                    if title:
                        jobs.append({
                            "job_id": jid,
                            "title": title,
                            "company_name": COMPANY_NAME,
                            "raw_jd_text": card.get_text(" ", strip=True),
                            "location_city": loc.split(",")[0].strip(),
                            "location_country": "India",
                            "industry": INDUSTRY,
                            "date_posted": datetime.now().strftime("%Y-%m-%d"),
                            "is_active": True,
                            "salary_currency": "INR"
                        })
        finally: driver.quit()

    print(f"Total TCS jobs found (last 30 days): {len(jobs)}")
    return jobs

tcs_jobs = scrape_tcs_jobs()
'''

TCS_SAVE = '''
df_tcs = save_results(tcs_jobs, "TCS", OUTPUT_DIR)
if df_tcs is not None:
    print(f"\\nColumn summary:")
    print(df_tcs.dtypes)
    print(f"\\nSeniority distribution:\\n{df_tcs.seniority_level.value_counts()}")
    print(f"\\nWork mode:\\n{df_tcs.work_mode.value_counts()}")
'''

write("TCS India Job Scraper.ipynb", [
    m("# TCS India Job Scraper\n## Weekly scraper - Entry & Lateral Jobs (Last 30 Days)\n**Source:** https://www.tcs.com/careers/india"),
    c(INSTALL),
    c(PATH_CELL.format(company="TCS")),
    c(SETUP),
    c(TCS_SCRAPER),
    c(TCS_SAVE),
])

# ============================================================
# ACCENTURE NOTEBOOK
# ============================================================
ACCENTURE_SCRAPER = '''
IMPORT_DATE = datetime.now()
CUTOFF_DATE = IMPORT_DATE - timedelta(days=30)
COMPANY_NAME = "Accenture"
INDUSTRY = "Consulting & IT Services"

def scrape_accenture_jobs():
    """Scrape Accenture India jobs from https://www.accenture.com/in-en/careers/jobsearch"""
    import requests
    from bs4 import BeautifulSoup
    jobs = []
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, */*"
    })
    # Accenture job search API
    base_url = "https://www.accenture.com/api/accenture/jobsearch"
    page = 0
    while True:
        try:
            params = {
                "cl": "in-en", "jk": "", "sb": "0", "pg": page,
                "cr": "India", "jt": "", "ws": "10", "je": ""
            }
            resp = session.get(base_url, params=params, timeout=30)
            if resp.status_code != 200: break
            data = resp.json()
            job_list = data.get("jobs", data.get("data", data.get("results", [])))
            if not job_list: break
            for job in job_list:
                date_str = job.get("postDate", job.get("postedDate", job.get("datePosted", "")))
                try:
                    if date_str: post_date = datetime.strptime(str(date_str)[:10], "%Y-%m-%d")
                    else: post_date = datetime.now()
                except: post_date = datetime.now()
                if post_date < CUTOFF_DATE: continue
                loc = job.get("location", job.get("city", ""))
                city = str(loc).split(",")[0].strip() if loc else "India"
                jobs.append({
                    "job_id": str(job.get("id", job.get("jobId", len(jobs)))),
                    "title": job.get("title", job.get("jobTitle", "")),
                    "company_name": COMPANY_NAME,
                    "raw_jd_text": job.get("description", job.get("jobDescription", "")),
                    "location_city": city,
                    "location_country": "India",
                    "industry": INDUSTRY,
                    "date_posted": post_date.strftime("%Y-%m-%d"),
                    "is_active": True,
                    "salary_currency": "INR"
                })
            if len(job_list) < 10: break
            page += 1
            time.sleep(1)
        except Exception as e:
            print(f"Error page {page}: {e}"); break

    if not jobs:
        print("API failed, using Selenium fallback...")
        driver = setup_driver()
        try:
            driver.get("https://www.accenture.com/in-en/careers/jobsearch?jk=&sb=0&vw=0&is_rj=0&cr=India")
            time.sleep(4)
            for _ in range(5):
                soup = BeautifulSoup(driver.page_source, "lxml")
                cards = soup.select("li.cmp-job-listing__item, .job-listing__item, [class*=job-result]")
                for card in cards:
                    title_el = card.select_one("h2,h3,h4,a.cmp-button")
                    title = title_el.get_text(strip=True) if title_el else ""
                    loc_el = card.select_one(".cmp-job-listing__location,[class*=location]")
                    loc = loc_el.get_text(strip=True) if loc_el else "India"
                    jid_el = card.select_one("a")
                    jid = jid_el.get("href","").split("/")[-1] if jid_el else str(len(jobs))
                    if title and title not in [j["title"] for j in jobs]:
                        jobs.append({
                            "job_id": jid,
                            "title": title,
                            "company_name": COMPANY_NAME,
                            "raw_jd_text": card.get_text(" ", strip=True),
                            "location_city": loc.split(",")[0].strip(),
                            "location_country": "India",
                            "industry": INDUSTRY,
                            "date_posted": datetime.now().strftime("%Y-%m-%d"),
                            "is_active": True,
                            "salary_currency": "INR"
                        })
                # Scroll and load more
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, "button[class*=load-more],button[class*=more-jobs]")
                    btn.click(); time.sleep(3)
                except: break
        finally: driver.quit()

    print(f"Total Accenture jobs (last 30 days): {len(jobs)}")
    return jobs

accenture_jobs = scrape_accenture_jobs()
'''

write("Accenture India Job Scraper.ipynb", [
    m("# Accenture India Job Scraper\n## Weekly scraper - All India Jobs (Last 30 Days)\n**Source:** https://www.accenture.com/in-en/careers/jobsearch"),
    c(INSTALL),
    c(PATH_CELL.format(company="Accenture")),
    c(SETUP),
    c(ACCENTURE_SCRAPER),
    c('df_accenture = save_results(accenture_jobs, "Accenture", OUTPUT_DIR)'),
])

# ============================================================
# INFOSYS NOTEBOOK
# ============================================================
INFOSYS_SCRAPER = '''
IMPORT_DATE = datetime.now()
CUTOFF_DATE = IMPORT_DATE - timedelta(days=30)
COMPANY_NAME = "Infosys"
INDUSTRY = "IT Services"

def scrape_infosys_jobs():
    """Scrape Infosys India careers: https://www.infosys.com/careers.html"""
    import requests
    from bs4 import BeautifulSoup
    jobs = []
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0","Accept": "application/json,*/*"})

    # Infosys uses iCIMS ATS. Try API endpoint
    api_urls = [
        "https://careers.infosys.com/restapi/jobs?location=India&postedDate=30",
        "https://job.infosys.com/jobs?q=&l=India&start=0"
    ]
    for api_url in api_urls:
        try:
            resp = session.get(api_url, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                job_list = data.get("jobs", data.get("data", []))
                for job in job_list:
                    date_str = str(job.get("postedDate", job.get("datePosted", "")))
                    try: post_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
                    except: post_date = datetime.now()
                    if post_date >= CUTOFF_DATE:
                        loc = str(job.get("location", job.get("city", "India")))
                        jobs.append({
                            "job_id": str(job.get("id", job.get("jobId", len(jobs)))),
                            "title": job.get("title", job.get("jobTitle", "")),
                            "company_name": COMPANY_NAME,
                            "raw_jd_text": job.get("description", ""),
                            "location_city": loc.split(",")[0].strip(),
                            "location_country": "India",
                            "industry": INDUSTRY,
                            "date_posted": post_date.strftime("%Y-%m-%d"),
                            "is_active": True, "salary_currency": "INR"
                        })
                if jobs: break
        except Exception as e: print(f"API {api_url}: {e}")

    if not jobs:
        print("Trying Selenium for Infosys...")
        driver = setup_driver()
        try:
            driver.get("https://www.infosys.com/careers.html")
            time.sleep(4)
            soup = BeautifulSoup(driver.page_source, "lxml")
            for card in soup.select(".career-list__item,[class*=job-card],[class*=job-listing]"):
                title_el = card.select_one("h2,h3,h4,.job-title")
                title = title_el.get_text(strip=True) if title_el else ""
                loc_el = card.select_one(".location,[class*=location]")
                loc = loc_el.get_text(strip=True) if loc_el else "India"
                if title:
                    jobs.append({
                        "job_id": str(len(jobs)),
                        "title": title, "company_name": COMPANY_NAME,
                        "raw_jd_text": card.get_text(" ", strip=True),
                        "location_city": loc.split(",")[0].strip(),
                        "location_country": "India", "industry": INDUSTRY,
                        "date_posted": datetime.now().strftime("%Y-%m-%d"),
                        "is_active": True, "salary_currency": "INR"
                    })
        finally: driver.quit()

    print(f"Total Infosys jobs (last 30 days): {len(jobs)}")
    return jobs

infosys_jobs = scrape_infosys_jobs()
'''

write("Infosys India Job Scraper.ipynb", [
    m("# Infosys India Job Scraper\n## Weekly scraper - All India Jobs (Last 30 Days)\n**Source:** https://www.infosys.com/careers.html"),
    c(INSTALL),
    c(PATH_CELL.format(company="Infosys")),
    c(SETUP),
    c(INFOSYS_SCRAPER),
    c('df_infosys = save_results(infosys_jobs, "Infosys", OUTPUT_DIR)'),
])
