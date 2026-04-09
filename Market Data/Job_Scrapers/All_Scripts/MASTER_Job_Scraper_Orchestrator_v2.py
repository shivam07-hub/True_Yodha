"""


MASTER Job Scraper Orchestrator v2.2
=====================================
1. Regenerates all 30 scraper notebooks from create_all_scrapers_v2.py
   (TCS + Infosys removed — registration walls)
2. Runs all scraper notebooks via nbconvert
3. Collects ALL output CSVs (not just current month) and merges into master Excel
4. Produces schema validation report
5. Validates job URLs (3 random per company; marks is_active=False if all fail)

Run this script, or convert to notebook cells and run in Jupyter.

Usage:
    python MASTER_Job_Scraper_Orchestrator_v2.py [--skip-scrape] [--skip-generate]
"""

import os, sys, glob, time, json, ast
import pandas as pd
from pathlib import Path
from datetime import datetime

# Resolve paths relative to this file so they work regardless of cwd or
# whether Job_Scrapers lives under home or inside the project repo.
# parents[0] = All_Scripts, parents[1] = Job_Scrapers
SCRIPTS_DIR = Path(__file__).resolve().parent
BASE_DIR    = SCRIPTS_DIR.parent
MASTER_OUT  = BASE_DIR / "All_CSV_Outputs" / "Master_Output"
MASTER_OUT.mkdir(parents=True, exist_ok=True)

# ============================================================
# STEP 1: Regenerate all scraper notebooks
# ============================================================
def step1_generate_notebooks():
    print("=" * 60)
    print("STEP 1: Regenerating scraper notebooks from v2 template")
    print("=" * 60)
    gen_script = SCRIPTS_DIR / "create_all_scrapers_v2.py"
    if gen_script.exists():
        exec(open(gen_script).read(), {"__file__": str(gen_script), "__name__": "__main__"})
        print("Done.\n")
    else:
        print(f"[WARN] {gen_script} not found. Skipping generation.\n")

# ============================================================
# STEP 2: Run all scraper notebooks / companion scripts
# ============================================================
# Selenium-heavy scrapers time out under nbconvert.
# For those we ship a companion run_*.py that is invoked via subprocess
# with no timeout limit.  The mapping below lists the notebook stem (lower-
# cased, spaces→underscores) → companion script filename.
COMPANION_SCRIPTS = {
    "alstom_india_job_scraper":           "run_alstom.py",
    "cma_cgm_india_job_scraper":          "run_cmacgm.py",
    "solvay_india_job_scraper":           "run_solvay.py",
    "engie_india_job_scraper":            "run_engie.py",
    # Phenom/iCIMS REST API — India + Digital Innovation & Technology (~132 jobs, no Selenium).
    "schneider_electric_india_job_scraper": "run_schneider.py",
    # Workday broad-mode scrapers: fetch 500 global jobs with per-job detail
    # calls, which exceeds nbconvert's 600s timeout.
    "novartis_india_job_scrapper":        "run_novartis.py",
    "sanofi_india_job_scrapper":          "run_sanofi.py",
    # Workday filtered scraper: India + Digital/IT facets only (~76 jobs, fast).
    "airbus_india_job_scraper":           "run_airbus.py",
    # Workday — India cities (Pune/Chennai/Bengaluru) + ICT/Software job families (~19 jobs).
    "stellantis_india_job_scraper":       "run_stellantis.py",
    # SAP SuccessFactors Jobs2Web — India + Digital and Information Technology filter.
    "cnhi_india_job_scraper":             "run_cnhi.py",
    # Workday filtered scrapers: India + IT job family (~18 and ~48 jobs, fast).
    "shell_india_job_scraper":            "run_shell.py",
    "philips_india_job_scraper":          "run_philips.py",
    # TalentBrew HTML scraper — all ~65 India jobs (no combined IT+India URL).
    "astrazeneca_india_job_scraper":      "run_astrazeneca.py",
    # Jobs2Web HTML scrapers — India + IT filter.
    # NOTE: Volkswagen currently has 0 India postings; scraper returns 0 until they appear.
    "volkswagen_india_job_scraper":       "run_volkswagen.py",
    "volvo_group_india_job_scraper":      "run_volvo.py",
    # Oracle HCM REST API — India locationId filter (21 total India jobs, ~10 tech roles).
    "wesco_india_job_scraper":            "run_wesco.py",
    # TalentBrew HTML scraper — India IT jobs (~19 server-rendered, 129 total w/ JS).
    "dell_india_job_scraper":             "run_dell.py",
    # Phenom People + Incapsula WAF — Selenium required; sitemap fallback for 3 India jobs.
    "baker_hughes_india_job_scraper":     "run_bakerhughes.py",
    # Astro/CXF HTML scraper — India region criteria filter; ~17 India jobs, 3 pages.
    "michelin_india_job_scraper":         "run_michelin.py",
}

def _nb_key(nb_path):
    """Normalise notebook filename to a lookup key."""
    return nb_path.stem.lower().replace(" ", "_")

def step2_run_scrapers():
    print("=" * 60)
    print("STEP 2: Running all scraper notebooks")
    print("=" * 60)

    try:
        import nbformat
        from nbconvert.preprocessors import ExecutePreprocessor
    except ImportError:
        os.system("pip install nbformat nbconvert ipykernel -q")
        import nbformat
        from nbconvert.preprocessors import ExecutePreprocessor

    import subprocess

    KERNEL = "python3"
    NOTEBOOKS = sorted([
        nb for nb in SCRIPTS_DIR.glob("*.ipynb")
        if "MASTER" not in nb.name and "checkpoint" not in str(nb)
        and "_OLD_" not in nb.name
    ])

    print(f"Found {len(NOTEBOOKS)} scraper notebooks\n")

    run_log = []
    for nb_path in NOTEBOOKS:
        start = time.time()
        key = _nb_key(nb_path)
        companion = COMPANION_SCRIPTS.get(key)

        if companion:
            # Run as standalone Python script — no timeout
            script_path = SCRIPTS_DIR / companion
            print(f"[SCRIPT ] {companion} ...", end=" ", flush=True)
            try:
                result = subprocess.run(
                    [sys.executable, str(script_path)],
                    cwd=str(SCRIPTS_DIR),
                    capture_output=True, text=True,
                )
                elapsed = round(time.time() - start, 1)
                if result.returncode == 0:
                    print(f"DONE ({elapsed}s)")
                    run_log.append({"notebook": companion, "status": "SUCCESS", "elapsed_s": elapsed})
                else:
                    err = (result.stderr or result.stdout or "")[-200:]
                    print(f"FAILED ({elapsed}s) - {err[:100]}")
                    run_log.append({"notebook": companion, "status": "FAILED", "elapsed_s": elapsed})
            except Exception as e:
                elapsed = round(time.time() - start, 1)
                print(f"FAILED ({elapsed}s) - {str(e)[:100]}")
                run_log.append({"notebook": companion, "status": "FAILED", "elapsed_s": elapsed})
        else:
            # Run via nbconvert (API-based scrapers complete within timeout)
            print(f"[RUNNING] {nb_path.name} ...", end=" ", flush=True)
            try:
                with open(nb_path, encoding="utf-8") as f:
                    nb = nbformat.read(f, as_version=4)

                ep = ExecutePreprocessor(
                    timeout=600,   # 10 min; API scrapers are fast
                    kernel_name=KERNEL,
                    allow_errors=True,
                )
                ep.preprocess(nb, {"metadata": {"path": str(SCRIPTS_DIR)}})

                with open(nb_path, "w", encoding="utf-8") as f:
                    nbformat.write(nb, f)

                elapsed = round(time.time() - start, 1)
                print(f"DONE ({elapsed}s)")
                run_log.append({"notebook": nb_path.name, "status": "SUCCESS", "elapsed_s": elapsed})

            except Exception as e:
                elapsed = round(time.time() - start, 1)
                print(f"FAILED ({elapsed}s) - {str(e)[:100]}")
                run_log.append({"notebook": nb_path.name, "status": "FAILED", "elapsed_s": elapsed})

    # Summary
    print(f"\n{'=' * 60}")
    print("EXECUTION SUMMARY")
    print("=" * 60)
    for log in run_log:
        icon = "✅" if log["status"] == "SUCCESS" else "❌"
        print(f"{icon} {log['notebook']:<55} {log['status']:<10} {log['elapsed_s']}s")
    success = sum(1 for l in run_log if l["status"] == "SUCCESS")
    print(f"\nTotal: {success}/{len(run_log)} completed successfully\n")
    return run_log

# ============================================================
# STEP 3: Consolidate all outputs into master Excel
# ============================================================
# Canonical 25-column schema — must stay in sync with scraper_utils.py COLS.
# source_api_url: internal debugging field (API endpoint that returned this job)
# business_unit: division/team within the company (e.g. "Apple Retail")
# source_platform: ATS platform name (e.g. "Workday", "SuccessFactors", "SmartRecruiters")
COLS = [
    "job_id", "title", "company_name", "job_url", "source_api_url", "business_unit",
    "raw_jd_text", "skills_required", "skills_preferred",
    "min_years_experience", "max_years_experience",
    "seniority_level", "location_city", "location_country",
    "work_mode", "employment_type",
    "degree_required", "degree_preferred_field",
    "industry", "salary_min", "salary_max", "salary_currency",
    "date_posted", "is_active", "source_platform",
]

VALID_SENIORITY = {"junior", "mid", "senior", "lead"}
VALID_WORK_MODE = {"onsite", "hybrid", "remote"}
VALID_EMP_TYPE = {"full-time", "part-time", "contract", "internship"}

# Company name inference from filename
COMPANY_MAP = {
    # Original 18
    "apple": "Apple",
    "accenture": "Accenture",
    "capgemini": "Capgemini",
    "cognizant": "Cognizant",
    "fidelity": "Fidelity Investments",
    "goldman": "Goldman Sachs",
    "google": "Google",
    "hcl": "HCL Technologies",
    "ibm": "IBM",
    # "infosys": removed — registration wall (career.infosys.com)
    "loreal": "L'Oreal",
    "l'oreal": "L'Oreal",
    "microsoft": "Microsoft",
    "morgan": "Morgan Stanley",
    "novartis": "Novartis",
    "sanofi": "Sanofi",
    "syngenta": "Syngenta",
    # "tcs": removed — registration wall (ibegin.tcs.com)
    "wipro": "Wipro",
    # New Workday companies
    "salesforce": "Salesforce",
    "wells": "Wells Fargo",
    "mastercard": "Mastercard",
    "lilly": "Eli Lilly",
    "eli_lilly": "Eli Lilly",
    "rtx": "RTX",
    # New SmartRecruiters companies
    "continental": "Continental",
    "servicenow": "ServiceNow",
    # New Eightfold company
    "amex": "American Express",
    "american_express": "American Express",
    # New Greenhouse company
    "stripe": "Stripe",
    # New Avature company
    "synopsys": "Synopsys",
    # New custom portal companies
    "atlassian": "Atlassian",
    "msci": "MSCI",
    # SAP SuccessFactors / Jobs2Web companies
    "alstom": "Alstom",
    "cma_cgm": "CMA CGM",
    "cmacgm": "CMA CGM",
    "cma cgm": "CMA CGM",
    "solvay": "Solvay",
    "engie": "Engie",
    # Workday companies
    "airbus": "Airbus",
    "chanel": "Chanel",
    # SmartRecruiters companies
    "ldc": "LDC",
    "louis_dreyfus": "LDC",
    "louis dreyfus": "LDC",
    # Eightfold companies
    "stmicroelectronics": "STMicroelectronics",
    "st_micro": "STMicroelectronics",
    "stmicro": "STMicroelectronics",
    # Phenom People
    "schneider_electric": "Schneider Electric",
    "schneider electric": "Schneider Electric",
    # Google Cloud Talent Solution
    "stellantis": "Stellantis",
    # Avature
    "totalenergies": "TotalEnergies",
    "total_energies": "TotalEnergies",
    # Oracle Cloud HCM
    "technip_energies": "Technip Energies",
    "technip energies": "Technip Energies",
    "technip": "Technip Energies",
    # Custom ASP.NET
    "air_france": "Air France",
    "airfrance": "Air France",
    "air france": "Air France",
}

def infer_company(filename):
    fname = filename.lower()
    for key, company in COMPANY_MAP.items():
        if key in fname:
            return company
    return None

def step3_consolidate():
    print("=" * 60)
    print("STEP 3: Consolidating all outputs into master Excel")
    print("=" * 60)

    # Find ALL CSVs in company output folders (not just current month!)
    csv_files = []

    # Search pattern: ~/Job_Scrapers/{Company}/Outputs/**/*.csv
    for company_dir in (BASE_DIR / "All_CSV_Outputs").iterdir():
        if not company_dir.is_dir():
            continue
        if company_dir.name in ("Master_Output", "Output", ".DS_Store"):
            continue

        # Find CSVs in Outputs subfolders
        outputs_dir = company_dir / "Outputs"
        if outputs_dir.exists():
            for csv_file in outputs_dir.rglob("*.csv"):
                if "checkpoint" not in str(csv_file):
                    csv_files.append(csv_file)

        # Also check for Output (singular) folder (Microsoft uses this)
        output_dir = company_dir / "Output"
        if output_dir.exists():
            for csv_file in output_dir.rglob("*.csv"):
                if "checkpoint" not in str(csv_file):
                    csv_files.append(csv_file)

    # Also check root Output folder
    root_output = BASE_DIR / "All_CSV_Outputs" / "Output"
    if root_output.exists():
        for csv_file in root_output.rglob("*.csv"):
            if "checkpoint" not in str(csv_file):
                csv_files.append(csv_file)

    print(f"\nFound {len(csv_files)} CSV files to process:")

    # For each company, only take the MOST RECENT FULL_ CSV.
    # FULL_ files have all 24 canonical columns; the standardized _jobs_ files
    # have the 13-column user-facing schema — we always prefer FULL_ here.
    company_csvs = {}  # company -> (path, mtime)
    for csv_path in csv_files:
        # Skip standardized files that are not FULL_ versions
        is_full = "FULL" in csv_path.name
        company = infer_company(csv_path.name)
        if not company:
            # Try parent folder name
            for parent in csv_path.parents:
                company = infer_company(parent.name)
                if company:
                    break

        if company:
            mtime = csv_path.stat().st_mtime
            existing = company_csvs.get(company)
            if existing is None:
                company_csvs[company] = (csv_path, mtime, is_full)
            else:
                existing_path, existing_mtime, existing_is_full = existing
                # Prefer FULL_ over non-FULL; within same type, prefer most recent
                if (is_full and not existing_is_full) or \
                   (is_full == existing_is_full and mtime > existing_mtime):
                    company_csvs[company] = (csv_path, mtime, is_full)

    print(f"\nMost recent FULL CSV per company:")
    for company, (path, mtime, is_full) in sorted(company_csvs.items()):
        mod_date = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
        tag = "FULL" if is_full else "std"
        print(f"  {company:<25} {path.name:<55} ({mod_date}) [{tag}]")

    # Load and merge
    frames = []
    for company, (csv_path, _, _is_full) in company_csvs.items():
        try:
            df = pd.read_csv(csv_path, dtype=str)
            df["_source_company"] = company
            df["_source_file"] = csv_path.name
            frames.append(df)
            print(f"  Loaded {len(df):>5} rows <- {company}")
        except Exception as e:
            print(f"  SKIP {csv_path.name}: {e}")

    if not frames:
        print("\nNO CSV DATA FOUND. Run the scrapers first (Step 2).")
        return None

    # Merge
    raw = pd.concat(frames, ignore_index=True)
    print(f"\nRaw merged rows: {len(raw)}")

    # Enforce schema
    for col in COLS:
        if col not in raw.columns:
            raw[col] = None
    master = raw[COLS + ["_source_company"]].copy()

    # Backfill company_name from source
    mask = master["company_name"].isna() | (master["company_name"] == "") | (master["company_name"] == "nan")
    master.loc[mask, "company_name"] = master.loc[mask, "_source_company"]
    master = master.drop(columns=["_source_company"])

    # Normalize controlled vocab
    for col, valid_set in [
        ("seniority_level", VALID_SENIORITY),
        ("work_mode", VALID_WORK_MODE),
        ("employment_type", VALID_EMP_TYPE),
    ]:
        master[col] = (
            master[col].astype(str).str.lower().str.strip()
            .where(master[col].astype(str).str.lower().str.strip().isin(valid_set), other=None)
        )

    # Normalize list fields
    def safe_list(val):
        if pd.isna(val) or val in ("", "None", "nan", "[]"):
            return []
        if isinstance(val, list):
            return val
        try:
            return ast.literal_eval(str(val))
        except:
            return [s.strip() for s in str(val).split("|") if s.strip()]

    master["skills_required"] = master["skills_required"].apply(safe_list)
    master["skills_preferred"] = master["skills_preferred"].apply(safe_list)

    # Normalize numeric fields
    for col in ["min_years_experience", "max_years_experience", "salary_min", "salary_max"]:
        master[col] = pd.to_numeric(master[col], errors="coerce")

    # Normalize boolean
    master["is_active"] = master["is_active"].map(
        lambda v: True if str(v).lower() in ("true", "1", "yes") else
                  (False if str(v).lower() in ("false", "0", "no") else True)
    )

    # Fill defaults
    master["location_country"] = master["location_country"].fillna("India")
    master["salary_currency"] = master["salary_currency"].fillna("INR")
    master["date_posted"] = master["date_posted"].fillna(datetime.now().strftime("%Y-%m-%d"))

    # Deduplicate
    before = len(master)
    master = master.drop_duplicates(subset=["job_id", "title", "company_name"], keep="first")
    print(f"After dedup: {len(master)} rows (removed {before - len(master)} dupes)")

    # Save
    month = datetime.now().strftime("%Y_%m")

    # CSV
    csv_out = MASTER_OUT / f"ALL_JOBS_NORMALIZED_{month}.csv"
    master_csv = master.copy()
    master_csv["skills_required"] = master_csv["skills_required"].apply(str)
    master_csv["skills_preferred"] = master_csv["skills_preferred"].apply(str)
    master_csv.to_csv(csv_out, index=False)
    print(f"\nSaved CSV  -> {csv_out}")

    # Excel
    xl_out = MASTER_OUT / f"ALL_JOBS_NORMALIZED_{month}.xlsx"
    master_xl = master.copy()
    master_xl["skills_required"] = master_xl["skills_required"].apply(
        lambda x: ", ".join(x) if isinstance(x, list) else str(x))
    master_xl["skills_preferred"] = master_xl["skills_preferred"].apply(
        lambda x: ", ".join(x) if isinstance(x, list) else str(x))
    with pd.ExcelWriter(xl_out, engine="openpyxl") as writer:
        master_xl.to_excel(writer, sheet_name="Jobs", index=False)
        ws = writer.sheets["Jobs"]
        for col_cells in ws.columns:
            max_len = max((len(str(c.value)) if c.value else 0) for c in col_cells)
            ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 2, 60)
    print(f"Saved XLSX -> {xl_out}")

    return master

# ============================================================
# STEP 4: Schema Validation Report
# ============================================================
def step4_validate(master):
    if master is None:
        print("No data to validate.")
        return

    print(f"\n{'=' * 60}")
    print("SCHEMA VALIDATION REPORT")
    print("=" * 60)

    print(f"\n{'COLUMN':<30} {'NON-NULL':>10} {'NULL%':>8}")
    print("-" * 50)
    for col in COLS:
        non_null = master[col].notna().sum()
        null_pct = round((1 - non_null / len(master)) * 100, 1) if len(master) > 0 else 0
        flag = " <-- SPARSE" if null_pct > 80 else ""
        print(f"{col:<30} {non_null:>10} {null_pct:>7}%{flag}")

    print(f"\n{'=' * 60}")
    print("JOBS PER COMPANY")
    print("=" * 60)
    print(master["company_name"].value_counts().to_string())

    print(f"\n{'=' * 60}")
    print("SENIORITY DISTRIBUTION")
    print("=" * 60)
    print(master["seniority_level"].value_counts(dropna=False).to_string())

    print(f"\n{'=' * 60}")
    print(f"TOTAL: {len(master)} unique jobs across {master['company_name'].nunique()} companies")
    print(f"Output: {MASTER_OUT}")
    print("=" * 60)

# ============================================================
# STEP 5: URL Validation Pass
# For each company, test 3 random job_urls via HEAD request.
# If ALL 3 fail (non-200), mark every job from that company
# is_active=False in the master DataFrame and re-save.
# This is a lightweight health check — not a full crawl.
# ============================================================
def step5_validate_urls(master):
    """
    Quick URL health check: 3 random job_urls per company.
    Marks is_active=False for companies where all 3 fail.
    Returns the (possibly updated) DataFrame.
    """
    if master is None or len(master) == 0:
        print("No master data to validate URLs for.")
        return master

    import requests

    print(f"\n{'=' * 60}")
    print("STEP 5: URL VALIDATION (3 random URLs per company)")
    print("=" * 60)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })

    companies = master["company_name"].unique()
    failed_companies = []

    for company in companies:
        company_jobs = master[
            (master["company_name"] == company) &
            (master["job_url"].notna()) &
            (master["job_url"] != "")
        ]

        if len(company_jobs) == 0:
            print(f"  {company:<30} — no URLs to test, skipping")
            continue

        # Pick up to 3 random jobs to test
        sample = company_jobs.sample(min(3, len(company_jobs)), random_state=42)
        results = []

        for _, row in sample.iterrows():
            url = row["job_url"]
            try:
                resp = session.head(url, timeout=10, allow_redirects=True)
                ok = resp.status_code < 400
                results.append((url, resp.status_code, ok))
            except Exception as e:
                results.append((url, str(e), False))
            time.sleep(0.5)

        all_failed = all(not ok for _, _, ok in results)
        status_summary = ", ".join(f"{code}" for _, code, _ in results)

        if all_failed:
            failed_companies.append(company)
            master.loc[master["company_name"] == company, "is_active"] = False
            print(f"  {company:<30} — ❌ ALL FAILED ({status_summary}) → marked is_active=False")
        else:
            pass_count = sum(ok for _, _, ok in results)
            print(f"  {company:<30} — ✓ {pass_count}/{len(results)} OK ({status_summary})")

    print(f"\n  Summary: {len(failed_companies)} companies with broken URLs: "
          f"{', '.join(failed_companies) if failed_companies else 'none'}")

    # Re-save the master if any companies were marked inactive
    if failed_companies:
        print(f"  Re-saving master with updated is_active flags...")
        try:
            master.to_excel(MASTER_OUT, index=False, engine="openpyxl")
            print(f"  Master re-saved: {MASTER_OUT}")
        except Exception as e:
            print(f"  [WARN] Could not re-save master: {e}")

    print("=" * 60)
    return master


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    skip_scrape = "--skip-scrape" in sys.argv
    skip_generate = "--skip-generate" in sys.argv
    skip_url_check = "--skip-url-check" in sys.argv

    if not skip_generate:
        step1_generate_notebooks()

    if not skip_scrape:
        step2_run_scrapers()

    master = step3_consolidate()
    step4_validate(master)

    if not skip_url_check:
        step5_validate_urls(master)
