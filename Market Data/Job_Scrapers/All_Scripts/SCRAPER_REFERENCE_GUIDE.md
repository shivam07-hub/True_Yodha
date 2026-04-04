# Job Scraper Reference Guide
### Career Site Platforms — Best Approach, Anti-Ban Practices & Feasibility
**Last updated: March 2026**

---

## 1. CAN WE ACTUALLY DO THIS?

**Yes. Confidently.** Here is why.

Every career website we target makes its job listings publicly available — that is the entire purpose of a career page. The APIs we use are the same endpoints the company's own career page calls in the browser. We are not bypassing any authentication, reading private data, or accessing anything that requires a login to view. We are reading public job listings.

**Volume perspective:** We scrape each company once per day. A single daily run for one company might make 50–200 API requests total. Compare this to a single human user loading a paginated career site. Anti-bot systems are built to catch automated crawlers making thousands of requests per minute — not a polite once-daily scraper with proper delays.

**Legal perspective:** Job listings are factual, publicly available data. Scraping them for matching and research purposes is legally well-established. Courts in the US (hiQ Labs v. LinkedIn, 2022) have upheld that scraping publicly accessible data does not violate computer fraud laws. India has no specific anti-scraping statute for public data. We are not scraping personal data, paywalled content, or anything requiring authentication.

**Practical risk:** In three years of running scrapers like these at this volume, the realistic outcomes are:
- API endpoint changes → scraper returns 0 results, we update the URL
- Site redesign → Selenium selector breaks, we update the CSS selector
- IP soft-block → slowing down or adding delay resolves it in 24 hours

None of these are bans. They are maintenance tasks.

---

## 2. ANTI-BAN BEST PRACTICES (Applied in this codebase)

### Already implemented
| Practice | How we do it |
|---|---|
| Random delays between requests | `time.sleep(random.uniform(0.5, 1.5))` between pages |
| Realistic User-Agent string | Mac + Chrome user agent in every session header |
| Session reuse | `requests.Session()` — mimics browser connection reuse |
| Timeout handling | All requests have `timeout=30` — never hang indefinitely |
| Error handling without retrying aggressively | Catch exceptions, log, move on |
| Headless Selenium with realistic viewport | `--window-size=1920,1080`, no `--headless=new` flag on some sites |

### Rules to always follow when adding new scrapers
1. **API first, always.** If the career page loads job data via XHR/fetch, use that endpoint directly. Never scrape HTML when an API exists.
2. **One domain at a time.** Never run two scrapers for the same domain in parallel.
3. **Respect page counts.** If an API returns 20 jobs per page, do not request 200 in one call.
4. **Delays are not optional.** Minimum 0.5s between requests to the same domain. 1–2s is safer.
5. **Do not retry immediately on failure.** If a request fails, log it and move on. Do not retry in a tight loop.
6. **Never hardcode India filter in the request.** Scrape broadly, store location metadata, filter in the pre-filter pipeline.

---

## 3. COMPLETE PLATFORM CATALOG

### How to use this catalog
When you encounter a new career site, find the domain or ATS name below. Follow the "Best Approach" column exactly — do not reinvent the wheel.

To identify which ATS a company uses:
1. Open their career page, open browser DevTools → Network tab → filter XHR
2. Look for API calls to recognisable domains (workday.com, smartrecruiters.com, greenhouse.io, etc.)
3. If the job URL contains a recognisable pattern (`.wd1.myworkdayjobs.com`, `jobs.lever.co`, etc.) that tells you the platform immediately

---

### TIER 1 — Official Public API (Most reliable, never breaks unless endpoint changes)

#### Workday
**Identifies as:** URL contains `*.wd1.myworkdayjobs.com` / `*.wd3.myworkdayjobs.com` / `*.wd5.myworkdayjobs.com` etc.
**Used by:** Novartis, Sanofi, Fidelity, Capgemini, HCL, Accenture, Salesforce, Wells Fargo, Mastercard, Eli Lilly, RTX, and ~60% of Fortune 500

**Best approach:**
```
POST https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{career_site}/jobs
Body: {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}

GET detail: https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{career_site}/{externalPath}

Job URL: https://{tenant}.{instance}.myworkdayjobs.com/en-US/{career_site}/{externalPath}
```
- No auth required
- Use `locationCountry` facet ID for country filtering — but fetch without filter and store location metadata if facet ID is unknown
- Delay: 0.5–1.5s between requests
- Rate: Max 20 jobs per API call — do not increase
- **Finding tenant/instance/career_site:** From the company's career page URL or the XHR calls in DevTools

---

#### SmartRecruiters
**Identifies as:** URL contains `jobs.smartrecruiters.com/{CompanyName}/`
**Used by:** Syngenta, Continental, ServiceNow, Bosch, Lidl, Visa, and many others

**Best approach:**
```
GET https://api.smartrecruiters.com/v1/companies/{company_id}/postings?limit=100&offset=0

Detail: GET https://api.smartrecruiters.com/v1/companies/{company_id}/postings/{posting_id}

Job URL: https://jobs.smartrecruiters.com/{company_identifier}/{posting_id}
```
- No auth required — fully public documented API
- `country=IN` param available but scrape without it, filter by location metadata
- Delay: 0.3–1s between requests
- **Finding company_id:** From the career page URL or XHR calls

---

#### Greenhouse
**Identifies as:** URL contains `boards.greenhouse.io/{token}/jobs` or `apply.workable.com` or `jobs.lever.co`
**Used by:** Stripe, Atlassian (partially), many tech startups (Notion, Figma, Canva, etc.)

**Best approach:**
```
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true

Job URL: Use absolute_url field directly from API response — always correct
```
- Most stable API of all platforms — returns full job descriptions in one call
- No auth, no pagination needed for most companies
- Delay: Not even necessary — but add 0.3s anyway
- `absolute_url` in the response IS the correct apply link — never construct it manually

---

#### Lever
**Identifies as:** URL contains `jobs.lever.co/{company}`
**Used by:** Many tech scale-ups and startups

**Best approach:**
```
GET https://api.lever.co/v0/postings/{company}?mode=json&state=published

Job URL: Use hostedUrl field from response
```
- Cleanest API in the industry — returns everything in one call, no pagination needed
- No auth required
- `location` filter available in params: `?location=India`

---

#### Eightfold AI
**Identifies as:** URL contains `{company}.eightfold.ai/careers`
**Used by:** Morgan Stanley, American Express, Bain, McKinsey, several pharma companies

**Best approach:**
```
POST https://{domain}/api/apply/v2/jobs
Body: {"domain": "{domain}", "location": "India", "pageSize": 20, "start": 0}

Job URL: https://{domain}/careers?pid={job_id}
         (or check apply_url field in response first)
```
- Delay: 1–2s between requests
- Try `apply_url` field first — if present, it's more specific than constructing from pid
- Location field is free-text, not a facet ID — "India" works reliably

---

#### Ashby
**Identifies as:** URL contains `jobs.ashbyhq.com/{company}`
**Used by:** Modern tech companies (Ramp, Linear, Retool, etc.)

**Best approach:**
```
POST https://jobs.ashbyhq.com/api/non-user-graphql
Body: {
  "operationName": "ApiJobBoardWithTeams",
  "variables": {"organizationHostedJobsPageName": "{company}"},
  "query": "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName ... } } }"
}

Job URL: https://jobs.ashbyhq.com/{company}/{job_id}
```

---

#### BambooHR
**Identifies as:** URL contains `{company}.bamboohr.com/careers`
**Used by:** Mid-size companies

**Best approach:**
```
GET https://{company}.bamboohr.com/careers/list
Returns JSON of all open roles directly
```

---

#### IBM Google Cloud Talent Solution
**Identifies as:** IBM's own career site (`ibm.com/careers`)
**Also used by:** Some other companies using Google's CTS product

**Best approach:**
```
POST https://jobsapi-google.m-cloud.io/api/job/search
Body: {
  "companyName": "companies/{UUID}",
  "pageSize": 20,
  "locationFilters": [{"address": "India", "distanceInMiles": 0}]
}

Job URL: https://www.ibm.com/careers/job/{requisitionId}
```
- The company UUID for IBM is stable: `728ae96b-0028-4d31-9697-9b42f37dd3f4`
- Other Google CTS clients have different UUIDs — find from XHR calls

---

#### Microsoft GCS Services
**Identifies as:** Microsoft's own career site

**Best approach:**
```
GET https://gcsservices.careers.microsoft.com/search/api/v1/search
  ?l=en_us&pg=1&pgSz=20&o=Relevance&flt=true&loc=India

Job URL: https://jobs.careers.microsoft.com/global/en/job/{jobId}
```
- Very stable, well-behaved API
- Handles up to 1000 India jobs per paginated run

---

### TIER 2 — Semi-Official APIs (Stable but undocumented — use with slightly more care)

#### iCIMS
**Identifies as:** URL contains `careers-{company}.icims.com`
**Used by:** Many large enterprises (FedEx, GE, Northrop Grumman)

**Best approach:**
```
GET https://careers-{company}.icims.com/jobs/search
  ?ss=1&searchCategory=&searchLocation=&searchZip=&searchRadius=&in_iframe=1
  &module=jobboard&action=searchjobs&searchKeyword=India&format=json
```
- The `format=json` parameter returns structured data instead of HTML
- Delay: 1s between pages

---

#### SAP SuccessFactors
**Identifies as:** URL contains `{company}.successfactors.eu` or `jobs.sap.com`
**Used by:** SAP itself, many European and manufacturing companies

**Best approach:**
```
GET https://{company}.successfactors.eu/api/v1/JobRequisition
  ?$filter=country_code eq 'IN'&$format=json
```
- OData API — use standard OData filter syntax
- For SAP's own jobs: `jobs.sap.com` has a hidden JSON API discoverable via DevTools

---

#### Taleo (Oracle)
**Identifies as:** URL contains `{company}.taleo.net`
**Used by:** Many older enterprises, some pharma companies

**Best approach:**
```
# Try RSS feed first:
GET https://{company}.taleo.net/careersection/{career_section}/rss.xml

# Fallback REST:
GET https://{company}.taleo.net/careersection/rest/jobboard/listjobs/{career_section}
  ?multiline=true&radialDistance=...&location=...&locationType=...&noBuiltinProfile=false
```
- RSS feed is most reliable when available
- Taleo is being phased out by Oracle — expect migration to Oracle HCM Cloud

---

#### Phenom People
**Identifies as:** URL contains `careers.{company}.com` with Phenom branding, `data-ph-at-id` HTML attributes
**Used by:** L'Oreal, GlaxoSmithKline, several pharma/FMCG companies

**Best approach:**
```
POST https://careers.{company}.com/api/apply/v2/jobs
Body: {"domain": "careers.{company}.com", "location": "India", "pageSize": 20, "start": 0}
```
- Phenom and Eightfold share similar API patterns (Phenom acquired some Eightfold tech)
- If the API doesn't respond, fall back to Selenium with `data-ph-at-id` attribute selectors (more stable than class names)

---

#### Radancy / Jobs2Web
**Identifies as:** URL contains `careers.{company}.com/job/Title/ID-en_US/`
**Used by:** Wipro, and some US-based retail/hospitality companies

**Best approach:**
```
Selenium: GET https://careers.{company}.com/search/?q=&location=India

Selectors: a[href*='/job/'][href*='-en_US']
Job URL: https://careers.{company}.com{href}  — href is correct when present
```
- No public API — Selenium is the only option
- Delay: 4–5s between page loads

---

#### Avature
**Identifies as:** URL contains `{company}.avature.net/careers`
**Used by:** Synopsys, Deloitte, some others

**Best approach:**
```
Selenium: GET https://{company}.avature.net/careers/SearchJobs?locationCountry=IN

Table row selectors: table.jobList tr, [class*='job-row']
Detail: Follow href from row to detail page for JD text
Job URL: Full URL from href on the row
```
- No API available — Selenium only
- Very slow to load — wait 10s after page load before scraping
- Delay: 5s between page loads

---

### TIER 3 — Selenium / DOM Scraping (Fragile — update selectors when broken)

#### Apple Jobs
**Identifies as:** `jobs.apple.com`

**Best approach:**
```
Selenium: https://jobs.apple.com/en-in/search?location=india-INDC

Selectors: div.job-list-item, a.link-inline[href*='/details/']
Job ID: Extract numeric ID from /details/{ID}/ in href
Job URL: https://jobs.apple.com{href}  — always full path from anchor
```
- **Key rule:** Job URL comes directly from the anchor's href — never construct it from job ID alone
- Apple uses React, so wait 8s after load before scraping
- Pagination: `button[aria-label='Next Page']:not([disabled])`

---

#### Google Careers
**Identifies as:** `careers.google.com`

**Best approach:**
```
# DO NOT use class-name selectors — they change with every build

# Approach 1 (preferred): Extract from href patterns
Selenium: https://careers.google.com/jobs/results/?location=India
Anchor selector: a[href*='/about/careers/applications/jobs/results/']
Job URL: Full href from anchor (e.g. https://www.google.com/about/careers/applications/jobs/results/12345-title)

# Approach 2: JSON-LD extraction
for each job URL, extract <script type="application/ld+json"> — contains structured JobPosting data
```
- **Never use obfuscated class names like lLd3Je, sMn82b** — these change every deploy
- **Critical:** Store the full href as job_url, fetch JD from that same URL per job (not a loop variable)
- Delay: 3s between scroll steps, 5s between page loads

---

#### Goldman Sachs (TAL.NET / higher.gs.com)
**Identifies as:** `higher.gs.com`

**Best approach:**
```
Selenium: https://higher.gs.com/roles

Selectors: a[href*='/roles/']
Job ID: href.split('/')[-1]  e.g. /roles/12345 → 12345
Job URL: https://higher.gs.com/roles/{job_id}
JD fetch: https://higher.gs.com/roles/{job_id}  — same URL
```
- Low volume (50–100 India roles at any time)
- Delay: 3s between requests

---

### TIER 4 — Registration Walls (Do not use — removed from pipeline)

| Company | Portal | Reason removed |
|---|---|---|
| TCS | ibegin.tcs.com | Requires login to view full job listings and apply |
| Infosys | career.infosys.com | Proprietary portal, apply flow requires Infosys-specific account |

**Rule:** If a career site does not show you a job description and a clear apply button without logging in, do not scrape it. The apply link would not be usable by a candidate anyway.

---

## 4. HOW TO HANDLE A NEW COMPANY (Decision flowchart)

```
1. Open their careers page in Chrome DevTools → Network → XHR filter
   |
   ├── See a call to *.myworkdayjobs.com?    → Use WORKDAY approach
   ├── See a call to api.smartrecruiters.com? → Use SMARTRECRUITERS approach
   ├── See a call to boards-api.greenhouse.io? → Use GREENHOUSE approach
   ├── See a call to *.eightfold.ai?          → Use EIGHTFOLD approach
   ├── See a call to jobs.lever.co?           → Use LEVER approach
   ├── See a call to jobs.ashbyhq.com?        → Use ASHBY approach
   ├── See a call to *.taleo.net?             → Use TALEO approach
   ├── See a call to *.successfactors.eu?     → Use SAP SF approach
   ├── See a call to *.icims.com?             → Use ICIMS approach
   ├── See a call to *.bamboohr.com?          → Use BAMBOOHR approach
   ├── See a call to *.avature.net?           → Use AVATURE approach (Selenium)
   ├── See data-ph-at-id attributes in HTML?  → Use PHENOM approach
   ├── See -en_US suffix in job URLs?         → Use RADANCY approach (Selenium)
   |
   └── No recognisable API?
       |
       ├── Check for JSON-LD: <script type="application/ld+json">
       |   → Parse JobPosting schema — most stable DOM approach
       |
       ├── Check for window.__NEXT_DATA__ or window.__NUXT__ in page source
       |   → Extract JSON from SSR data — stable, no CSS selectors needed
       |
       └── Last resort: Selenium with CSS selectors
           → Use h2/h3 for title, a[href] for URL
           → DO NOT use class names — use semantic HTML or data attributes
           → Always extract href directly, never construct URL from parts
```

---

## 5. CURRENT SCRAPER STATUS (March 2026)

| Company | Platform | Status | URL Quality |
|---|---|---|---|
| Novartis | Workday | ✅ Active | `/en-US/` fixed |
| Sanofi | Workday | ✅ Active | `/en-US/` fixed |
| Fidelity Investments | Workday | ✅ Active | `/en-US/` fixed |
| Capgemini | Workday | ✅ Active | `/en-US/` fixed |
| HCL Technologies | Workday | ✅ Active | `/en-US/` fixed |
| Accenture | Workday | ✅ Active | `/en-US/` fixed |
| Salesforce | Workday | ✅ Active | `/en-US/` fixed |
| Wells Fargo | Workday | ✅ Active | `/en-US/` fixed |
| Mastercard | Workday | ✅ Active | `/en-US/` fixed |
| Eli Lilly | Workday | ✅ Active | `/en-US/` fixed |
| RTX | Workday | ✅ Active | `/en-US/` fixed |
| Syngenta | SmartRecruiters | ✅ Active | Correct |
| Continental | SmartRecruiters | ✅ Active | Correct |
| ServiceNow | SmartRecruiters | ✅ Active | Correct |
| Morgan Stanley | Eightfold | ✅ Active | `?pid=` correct |
| American Express | Eightfold | ✅ Active | `?pid=` correct |
| Stripe | Greenhouse | ✅ Active | `absolute_url` correct |
| Apple | Selenium | ✅ Active | href from anchor |
| Microsoft | GCS API | ✅ Active | `/global/en/job/ID` |
| Google | Selenium | ⚠️ Improved | href-based, not class-based |
| Wipro | Radancy/Selenium | ✅ Active | `-en_US` pattern |
| Cognizant | XML Feed | ✅ Active | Direct from feed |
| Goldman Sachs | TAL.NET/Selenium | ✅ Active | `/roles/ID` |
| IBM | Google CTS API | ✅ Active | `/careers/job/ID` |
| L'Oreal | Phenom/Selenium | ✅ Active | href from anchor |
| Synopsys | Avature/Selenium | ✅ Active | href from anchor |
| Atlassian | Greenhouse+DOM | ✅ Active | Greenhouse absolute_url |
| MSCI | Custom/Selenium | ✅ Active | href from anchor |
| TCS | iBegin | ❌ Removed | Registration wall |
| Infosys | Custom portal | ❌ Removed | Registration wall |

---

## 6. QUICK REFERENCE — DELAY GUIDELINES

| Platform type | Min delay between pages | Notes |
|---|---|---|
| Official APIs (Workday, SmartRecruiters, etc.) | 0.5s | These can handle higher volume |
| Undocumented APIs (Phenom, iCIMS) | 1s | Be conservative |
| Selenium (any site) | 3–5s per page load | Simulate human browsing |
| Selenium JD detail fetch | 1–2s per page | Only fetch first 30–50 JDs |
| Apple specifically | 4–8s | More aggressive anti-bot |
| Google specifically | 3s per scroll + 5s initial load | Heavy JS — needs time to render |
