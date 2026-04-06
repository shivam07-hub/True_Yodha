# Phase 1B — Database

> Start here only after Phase 1A is fully checked off.
> Full SQL schema is in `docs/SCHEMA.md`.

---

## Checklist

- [ ] `database/schema.sql` applied to Supabase (includes `candidate_skills_queue`)
- [ ] `database/seed_skills.sql` generated: `python3 backend/app/services/taxonomy_loader.py`
- [ ] Seed data applied to Supabase
- [ ] `csv_importer.py` run — job_postings populated, unknown skills logged to queue
- [ ] `candidate_skills_queue` reviewed — unknown skills mapped, added, or rejected
- [ ] Database connection tested from backend (`GET /health` returns `{"status": "ok"}`)

---

## Step-by-step: What to do before loading data into Supabase

### 1 — Apply schema to Supabase
```
Supabase Dashboard → SQL Editor → New query
Paste: database/schema.sql
Click: Run
```
Creates all 13 tables (including `candidate_skills_queue`) plus indexes and RLS policies.

> If you've applied a previous schema version, drop all tables first or run in a fresh project.

---

### 2 — Install Python dependencies
```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

---

### 3 — Generate and apply seed data
```bash
python3 backend/app/services/taxonomy_loader.py
```
This reads `skill_taxonomy mapping/taxonomy.json` and writes `database/seed_skills.sql`.

```
Supabase Dashboard → SQL Editor → New query
Paste: database/seed_skills.sql
Click: Run
```
Inserts all 63 skills with their L1–L5 level definitions.

> Verify: Supabase → Table Editor → `skills` should show 63 rows, `skill_levels` should show 315 rows.

---

### 4 — Check your `.env` file
Ensure `backend/.env` contains:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key   # NOT the anon key
GROQ_API_KEY=your-groq-key
```
The importer uses the **service role key** to bypass RLS during bulk insert.

---

### 5 — Run the CSV importer
```bash
cd backend
python3 -m app.services.csv_importer
```

This does four things in sequence:
1. Loads taxonomy aliases from `taxonomy.json`
2. Reads all master xlsx files from `Market Data/Job_Scrapers/All_CSV_Outputs/Master_Output/`
3. Calls Groq (llama3-70b) to contextually tag each job with required/preferred skills
   - Results cached in `database/skill_tag_cache.json` — re-runs skip already-tagged jobs
   - Skills not in the 63-skill taxonomy → logged to `candidate_skills_queue`
4. Upserts all rows into `job_postings` and unknown skills into `candidate_skills_queue`

Expected output (approximate):
```
Loading taxonomy...
  180 aliases
Reading 1 master file(s)...
  1240 unique jobs loaded
Tagging skills with Groq (cached)...
  1240 jobs need tagging (0 cached)
  Batch 1/414 (3 jobs)... done (3 tagged)
  ...
Connecting to Supabase...
  63 skills in DB
  18 unknown skills logged to candidate_skills_queue for weekly review
Upserting job_postings...
Done. 1240 job postings upserted to Supabase.
```

---

### 6 — Review the candidate skills queue
```
Supabase Dashboard → Table Editor → candidate_skills_queue
Filter: status = pending
```

For each unknown skill, decide:
| Decision | Action |
|---|---|
| It's an alias of an existing taxonomy skill | Set `mapped_to_skill_id`, `status = mapped` |
| Genuinely new skill worth tracking | Add to `taxonomy.json` + xlsx + `TAXONOMY_CHANGELOG.md` → re-run `taxonomy_loader.py` → set `status = added` |
| Noise / junk / too niche | Set `status = rejected` |

> Do NOT auto-add skills without writing L1–L5 descriptions. They're the CV matching benchmark.

---

### 7 — Test the backend connection
```bash
uvicorn app.main:app --reload --app-dir backend
curl localhost:8000/health
# Expected: {"status": "ok"}
```

---

## Weekly pipeline (post-MVP)

Each week the scraper runs → this is the full pipeline to refresh job data:

```
1. Scrapers run locally  →  Market Data/Job_Scrapers/All_CSV_Outputs/Master_Output/
2. python3 -m app.services.csv_importer
      ↓ tags new jobs (cached = skipped)
      ↓ upserts job_postings
      ↓ logs new unknown skills to candidate_skills_queue
3. Review candidate_skills_queue (takes ~10 min)
4. Supabase now has fresh, clean, tagged data
```

**Why weekly?** Scrapers refresh weekly. Taxonomy review batched weekly = lower overhead. Schema review + import is the last step — not the first.

---

## Data Strategy

Job data for MVP comes from **existing local CSVs — not from re-scraping the internet.**

```
Local machine
  Market Data/Job_Scrapers/All_CSV_Outputs/   ← stays local, gitignored
        ↓  run csv_importer.py once
  Supabase job_postings table                 ← Mirror API reads from here
```

- CSVs are gitignored — git is a code store, not a data store
- No job data stored on Railway — only in Supabase (free 500MB tier)
- To refresh job data: run scraper locally → re-run csv_importer.py
- Post-MVP: scraper runs on Railway on a schedule and pushes directly to Supabase (no CSV step)

---

## Taxonomy rules

- `seed_skills.sql` is always GENERATED — never edited manually
- To add/change a skill: update `skill_taxonomy_mapping/taxonomy.json` → update xlsx → log in `TAXONOMY_CHANGELOG.md` → re-run `taxonomy_loader.py`
- New skills added from `candidate_skills_queue` must have L1–L5 descriptions written before being used for CV matching
- RLS is enabled on all user-facing tables — no raw SQL updates on user data without policy check

---

## Tables (14 total)

| Table | Purpose |
|-------|---------|
| `skill_domains` | 10 domains (SD, DE, DSA, AML, CDO, CS, QAT, EA, PPM, UX) |
| `skill_families` | Sub-groupings within each domain |
| `skills` | 63 skills with taxonomy keys and tech aliases |
| `skill_levels` | L1–L5 definitions per skill (generated from xlsx) |
| `candidate_skills_queue` | Unknown skills from JDs — weekly human review queue |
| `user_profiles` | Core user record, linked to Supabase Auth |
| `user_skills` | One row per skill per user; matched_level from CV evidence |
| `mirror_scores` | Computed score: total + domain breakdown + gap skills |
| `mirror_score_history` | Score over time (for trend chart later) |
| `job_postings` | Scraped jobs, tagged with skill IDs |
| `user_job_matches` | Top 3 weekly job matches per user; batch_week tracks which Monday |
| `job_applications` | Full application lifecycle tracking |
| `skill_demand_snapshots` | Demand counts from scraper (drives gap scoring) |
| `daily_logs` | Free-text diary entries; Groq extracts skill XP in real-time |
