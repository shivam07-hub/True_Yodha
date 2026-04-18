# Mirror — Database Schema Reference

> Last updated: 2026-04-18
> Supabase project · PostgreSQL

---

## Skill Taxonomy Design

Single-table flat structure. Lightcast taxonomy has 3 levels — all stored in one `skills` table:

| Level | Column | Example | Count |
|---|---|---|---|
| L1 | `l1_domain` | "Information Technology" | 31 |
| L2 | `l2_cluster` | "Software Development" | 442 |
| L3 | `taxonomy_key` | "Python (Programming Language)" | 35,108 |

**Key rule:** Users always match at L3 (`user_skills.skill_id` → `skills.id`).
L2 scoring and L1 domain scores are computed at query time via `GROUP BY l2_cluster` / `GROUP BY l1_domain`.

**Migration history:**
- `20260418_skill_hierarchy.sql` — created `skill_domains` (L1) + `skill_clusters` (L2) + added `cluster_id` FK to `skills`
- `20260418_flatten_skills_table.sql` — **APPLIED 2026-04-18** — dropped `skill_domains` + `skill_clusters`; added `l1_domain` + `l2_cluster` directly on `skills`; dropped `cluster_id` FK

---

## Tables

### `skills`
Single source of truth for the Lightcast skill taxonomy.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `taxonomy_key` | VARCHAR(200) UNIQUE | Canonical L3 skill name |
| `display_name` | VARCHAR(200) | Human-readable label |
| `lightcast_id` | VARCHAR(50) | Lightcast hex ID (e.g. `KS126XS6CQCFGC3NG79X`) |
| `l1_domain` | VARCHAR(200) | Lightcast L1 domain |
| `l2_cluster` | VARCHAR(200) | Lightcast L2 cluster |
| `is_active` | BOOLEAN | Default TRUE |
| `created_at` | TIMESTAMPTZ | |

Populated by: `python database/backfill_skills.py`

---

### `user_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | References `auth.users` |
| `email` | VARCHAR(255) UNIQUE | |
| `full_name` | VARCHAR(255) | |
| `linkedin_url` | VARCHAR(500) | |
| `target_roles` | TEXT[] | |
| `target_location` | VARCHAR(200) | |
| `cv_url` | VARCHAR(500) | |
| `cv_raw_text` | TEXT | Raw text from latest CV upload |
| `cv_parsed_at` | TIMESTAMPTZ | |
| `onboarding_complete` | BOOLEAN | Default FALSE |
| `created_at` / `last_active_at` | TIMESTAMPTZ | |

---

### `user_skills`
One row per (user, skill) pair. Skill is always L3.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID FK → `user_profiles` | |
| `skill_id` | INTEGER FK → `skills` | L3 skill |
| `matched_level` | INTEGER 0–5 | 0=None … 5=Legend |
| `proficiency_title` | VARCHAR(30) | Scout / Trailblazer / Excavator / Cartographer / Legend |
| `source` | VARCHAR(30) | `cv` \| `diary` \| `manual` |
| `evidence_text` | TEXT | |
| `last_updated` | TIMESTAMPTZ | |

UNIQUE on `(user_id, skill_id)`.

**Scoring logic:**
- L2 cluster score = `COUNT(DISTINCT skill_id WHERE l2_cluster = X)` / total L3 children of X × max proficiency / 5
- L1 domain score = mean of cluster scores under that domain × 100
- L3 percentile = fraction of all users who have this specific `skill_id`

---

### `mirror_scores`
One row per user (upserted on each compute).

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID FK | |
| `total_score` | DECIMAL(5,2) | Mirror Score 0–100 |
| `domain_scores` | JSONB | `{l1_domain_name: 0–100}` |
| `skill_scores` | JSONB | Per-skill scores |
| `gap_skills` | JSONB | Top 5 upgrade priorities |
| `rank_tier` | VARCHAR(30) | INTERNAL — never expose via API |
| `percentile` | DECIMAL(5,2) | INTERNAL |
| `skills_assessed` | INTEGER | |
| `version` | INTEGER | |
| `computed_at` | TIMESTAMPTZ | |

---

### `cv_history`
One row per CV upload. Tracks score trajectory.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID FK | |
| `skills_count` | INTEGER | |
| `mirror_score` | DECIMAL(5,2) | |
| `uploaded_at` | TIMESTAMPTZ | |

---

### `jobs`

| Column | Type | Notes |
|---|---|---|
| `job_id` | TEXT PK | Stable external ID |
| `job_title` | VARCHAR(300) | |
| `company_name` | VARCHAR(200) | |
| `industry` | VARCHAR(200) | |
| `location` | VARCHAR(200) | |
| `apply_url` | VARCHAR(500) | |
| `job_description` | TEXT | |
| `main_skills` | TEXT[] | Required skills (weighted ×2 in demand calc) |
| `side_skills` | TEXT[] | Nice-to-have skills (weighted ×1) |
| `batch_date` | DATE | |

---

### `user_job_matches`
Top matches per user per week.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID FK | |
| `job_id` | TEXT FK | |
| `batch_week` | DATE | Monday of the generation week |
| `overlap_score` | DECIMAL(5,2) | |
| `llm_rank` | INTEGER | |
| `llm_explanation` | TEXT | |
| `is_recommended` | BOOLEAN | TRUE = top 3 surfaced to user |
| `action_plan` | JSONB | 7-day plan array |
| `computed_at` | TIMESTAMPTZ | |

UNIQUE on `(user_id, job_id, batch_week)`.

---

### `job_applications`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID FK | |
| `job_id` | TEXT FK | |
| `match_id` | INTEGER FK → `user_job_matches` | |
| `status` | VARCHAR(30) | `pending` \| `applied` \| `no_response` \| `responded` \| `interviewing` \| `rejected` \| `offer` |
| `applied_at` | TIMESTAMPTZ | |
| `company_response` / `response_at` | TEXT / TIMESTAMPTZ | |
| `checkin_sent_at` | TIMESTAMPTZ | |
| `notes` | TEXT | |

UNIQUE on `(user_id, job_id)`.

---

### `daily_logs`
One entry per user per day.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `log_date` | DATE | |
| `entry_text` | TEXT | |
| `skills_delta` | JSONB | `[{taxonomy_key, xp_added, evidence}]` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

UNIQUE on `(user_id, log_date)`.

---

### `user_feedback`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | UUID nullable FK | Can submit without login |
| `type` | VARCHAR(20) | `feedback` \| `company` \| `bug` |
| `payload` | JSONB | Free-form field map |
| `created_at` | TIMESTAMPTZ | |

---

## Row Level Security

All user tables have RLS enabled. Policies:
- `user_profiles`, `user_skills`, `user_job_matches`, `job_applications`, `daily_logs`, `cv_history` — users see/modify only their own rows
- `mirror_scores` — SELECT only (computed by backend service role)
- `skills`, `jobs` — public SELECT
- `user_feedback` — INSERT for own user_id or anonymous; SELECT own rows only
