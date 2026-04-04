# Job Scraper Suite v2.1 - Quick Start Guide

## What Changed (v2.1 vs v2.0)
- **Apple scraper** rewritten with browser-verified DOM selectors (div.job-list-item, a.link-inline)
- **Microsoft scraper** uses confirmed GCS Services API with retry logic for 502 errors
- **All Selenium scrapers** now fetch individual JD pages (not just card text)
- **Better pagination** handling across all scrapers
- **JD quality improved** - each scraper now fetches full job descriptions from detail pages
- **Test script enhanced** - can test API scrapers (fast) or all scrapers including Selenium

## What Changed (v2.0 vs v1)
- **Correct career portal URLs** for all 18 companies (v1 used fake/guessed API endpoints)
- **Workday API scraper** for Novartis, Sanofi, Fidelity, Capgemini, HCL (JSON API, no browser needed)
- **SmartRecruiters API** for Syngenta (direct JSON API)
- **Eightfold API** for Morgan Stanley
- **Selenium with correct selectors** for Apple, Microsoft, Google, TCS, Infosys, Wipro, Cognizant, Goldman Sachs, Accenture, IBM, L'Oreal
- **Fixed consolidation** - picks up ALL output CSVs, not just current month
- **Shared utilities** (`scraper_utils.py`) - no more duplicated code across 18 notebooks

## File Structure
```
All_Scripts/
├── scraper_utils.py                      # Shared utilities (normalize, save, Workday/SmartRecruiters scrapers)
├── create_all_scrapers_v2.py             # Generates all 18 notebooks
├── MASTER_Job_Scraper_Orchestrator_v2.py # Full pipeline: generate → scrape → consolidate
├── RUN_ALL_AND_CONSOLIDATE.py            # Just consolidation (after you've run scrapers)
├── test_scrapers_quick.py                # Quick validation script
├── [18 scraper notebooks]                # Individual company scrapers
└── HOW_TO_RUN.md                         # This file
```

## How to Run

### Step 1: Validate scrapers work (RECOMMENDED FIRST)
```bash
cd ~/Job_Scrapers/All_Scripts

# Test API-based scrapers only (fast, ~2 minutes)
python test_scrapers_quick.py

# Test a specific company
python test_scrapers_quick.py novartis
python test_scrapers_quick.py apple

# Test ALL scrapers including Selenium (slower, ~15 minutes)
python test_scrapers_quick.py --all
```

### Step 2: Run everything automatically
```bash
python MASTER_Job_Scraper_Orchestrator_v2.py
```
This will: regenerate notebooks → run all 18 scrapers → consolidate into master Excel.

### Step 3: Or run individual scrapers in Jupyter
1. Open Jupyter: `jupyter notebook`
2. Navigate to `All_Scripts/`
3. Open any scraper notebook (e.g., `Microsoft India Job Scrapper.ipynb`)
4. Run All Cells
5. Check output in `~/Job_Scrapers/{Company}/Outputs/{YYYY_MM}/`

### Step 4: Just consolidate existing data
```bash
python MASTER_Job_Scraper_Orchestrator_v2.py --skip-scrape --skip-generate
```

## Dependencies
```bash
pip install selenium webdriver-manager pandas openpyxl requests beautifulsoup4 lxml playwright
playwright install chromium
```

## Troubleshooting

**Scraper returns 0 jobs:**
- The career portal may have changed its HTML structure. Open the URL in Chrome, inspect the page, and update the CSS selectors in the notebook.
- For Workday companies: check the tenant/instance/career_site values haven't changed.

**Selenium timeout:**
- Increase `time.sleep()` values - some sites load slowly.
- Try running without `--headless` to debug visually.

**Microsoft API returns 502:**
- The GCS Services API can be intermittent. The scraper has retry logic built in.
- Wait a few minutes and try again.

**Consolidation missing a company:**
- Check that the scraper output is a `.csv` file in `~/Job_Scrapers/{Company}/Outputs/` or `~/Job_Scrapers/{Company}/Output/`.

## Companies by ATS Platform

| Platform | Companies | Scraping Method |
|----------|-----------|----------------|
| Workday JSON API | Novartis, Sanofi, Fidelity, Capgemini*, HCL* | `scrape_workday()` - no browser needed |
| SmartRecruiters API | Syngenta | `scrape_smartrecruiters()` - no browser needed |
| Eightfold API | Morgan Stanley | `scrape_eightfold()` - no browser needed |
| Microsoft GCS API | Microsoft | Direct JSON API with Selenium fallback |
| Selenium + JD fetch | Apple, Google, TCS, Infosys, Wipro, Cognizant, Goldman Sachs, Accenture, IBM, L'Oreal | Selenium headless Chrome |

*Capgemini and HCL try Workday first, fall back to Selenium if Workday endpoint doesn't match.

## Data Quality: What Each Scraper Extracts

| Field | API Scrapers | Selenium Scrapers |
|-------|-------------|-------------------|
| title | ✅ Always | ✅ Always |
| job_id | ✅ From API | ✅ From URL |
| location_city | ✅ From API | ✅ From card |
| raw_jd_text | ✅ Full JD from detail endpoint | ✅ Fetched from detail page |
| skills_required | ✅ Extracted from JD | ✅ Extracted from JD |
| seniority_level | ✅ Inferred from title/JD | ✅ Inferred from title/JD |
| work_mode | ✅ Inferred from JD | ✅ Inferred from JD |
| date_posted | ✅ From API | ⚠️ From card if available |
