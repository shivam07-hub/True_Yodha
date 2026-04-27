# Myro Score Algorithm

> Canonical scoring entry point: `backend/app/services/scoring/persistence.py::compute_and_persist_score()`
> Back-compat shim: `backend/app/services/scoring_engine.py` (re-export only)
> Taxonomy source: `lightcast_skills_taxonomy.json`

---

## Canonical Scoring Flow (Phase 7)

`compute_and_persist_score()` is the single scoring orchestrator for all paths:

- CV upload / text submit (`/cv/upload`, `/cv/text`)
- Score recompute (`/scores/compute`)
- Diary-triggered recompute (`/diary/entry`)
- Operational scripts:
  - `database/backfill_scores.py`
  - `database/restore_skills_from_cv_text.py`

No route or script should call lower-level persistence helpers directly for full score recomputation.

### Phase 7 hardening ops commands

Run against staging with a small sample first:

```bash
source .venv/bin/activate
python database/backfill_scores.py --limit 5 --dry-run
python database/restore_skills_from_cv_text.py --limit 3 --dry-run
```

Then execute write mode on the approved sample:

```bash
python database/backfill_scores.py --limit 5
python database/restore_skills_from_cv_text.py --limit 3
```

### Input modes

1. CV ingestion mode (`skills_detected`)
   - infer levels from signals
   - persist `user_skills`
   - persist `mirror_scores` + `mirror_score_history`

2. Recompute mode (`skill_level_map`)
   - reuse already persisted levels
   - recompute and persist score artifacts without rewriting skill evidence

### CV safety invariant

CV ingestion paths enforce at least one persisted skill row (`require_skills_assessed=True`).
If zero skills can be written to `user_skills`, request fails with HTTP 422 and CV state is not advanced.

---

## Taxonomy Structure (Lightcast)

The taxonomy has **3 hierarchy levels** — distinct from the 5 proficiency levels below.

| Taxonomy Level | Name | Count | Role in Scoring |
|---|---|---|---|
| **Tax-L1** | Domain | 31 | Domain Score unit |
| **Tax-L2** | Sub-skill Cluster | 442 | Cluster Score unit |
| **Tax-L3** | Individual Skill (leaf) | 35,108 | Matched against CV evidence |

```
Tax-L1: "Information Technology"
  └─ Tax-L2: "Microsoft Development Tools"
       ├─ Tax-L3: ".NET Framework"
       ├─ Tax-L3: "ASP.NET"
       └─ Tax-L3: ... (125 skills in this cluster)
```

---

## Proficiency Levels (Evidence-Based, CV-Derived)

These 5 levels describe **mastery depth**, not taxonomy position.
Named after the treasure-hunter arc — each level is a step deeper into the vault.

| Level | Title | Evidence Required |
|-------|-------|------------------|
| **P1** | **Scout** | Awareness, basic usage, self-study, side projects with no revenue — you found the map |
| **P2** | **Trailblazer** | Applied in real projects; project earned some revenue — you're on the path |
| **P3** | **Excavator** | Measurable impact at scale — project fully implemented in a company's operating lifecycle — you found the chest |
| **P4** | **Cartographer** | Architect-level — working knowledge of **all Tax-L3 skills** within a Tax-L2 cluster — you own the full map |
| **P5** | **Legend** | Industry-recognised + has achieved P4 (Cartographer) in **3 or more Tax-L2 clusters** — others follow your map |

> P4 (Cartographer) and P5 (Legend) are cluster-level achievements, not single-skill achievements.
> They cannot be inferred from a single CV mention — they require cluster coverage evidence (see below).

---

## Scoring Model

### Step 1 — Cluster Coverage Score (per Tax-L2 cluster)

For each Tax-L2 cluster C the user has at least one matched skill in:

```
cluster_coverage(C) = |skills user has in C| / |total Tax-L3 skills in C|
```

This measures **how broad** the user's knowledge is within a sub-skill cluster.
A user with 10/125 skills in "Microsoft Development Tools" scores 0.08 coverage.

---

### Step 2 — Cluster Proficiency Score (per Tax-L2 cluster)

The proficiency assigned to a cluster = the **highest proficiency level** evidenced
across any skill the user has in that cluster.

```
cluster_proficiency(C) = max(proficiency_level of each matched skill in C) / 5
```

---

### Step 3 — Cluster Score (per Tax-L2 cluster)

```
log_coverage(C)  = log1p(|user skills in C|) / log1p(|total skills in C|)
cluster_score(C) = cluster_proficiency(C) × (0.3 + 0.7 × log_coverage(C))
```

Log-scaling fixes a critical flaw: Lightcast clusters have 50–362 skills. Linear coverage
would give 1/362 = 0.003 for a single AI/ML skill — making any real CV score near-zero.
Log-scaling gives 1-skill-in-362 a coverage of ~0.14 instead. The 0.3 floor means having
any evidence in a domain contributes to the score even without breadth.

| Scenario | Log Coverage | Proficiency | Cluster Score |
|----------|----------|-------------|---------------|
| 1 skill in 362-cluster, P3 | 0.14 | 0.60 | 0.23 |
| 2 skills in 237-cluster, P4 | 0.20 | 0.80 | 0.35 |
| 5 skills in 50-cluster, P2 | 0.47 | 0.40 | 0.25 |
| All skills, P4 | 1.00 | 0.80 | 0.80 |

---

### Step 4 — Domain Score (per Tax-L1 domain)

```
domain_score(D) = mean(cluster_score(C) for all C under D where user has ≥1 skill) × 100
```

Only clusters where the user has evidence contribute. Absent clusters do not penalise.
This prevents punishing a Data Engineer for having zero skills in "Hospitality and Food Services".

---

### Step 5 — Myro Score

```
mirror_score = mean(domain_score(D) for all D where user has ≥1 skill)
```

Score is 0–100. No artificial inflation. No penalty for domains the user has no evidence in.

---

### Step 6 — Normalised Skill Score (Percentile)

After computing `cluster_score(C)` for a user, the **normalised_skill_score** is the
**percentile rank** of that user's cluster score among all users who have been tracked on cluster C.

```
normalised_skill_score(C) = percentile_rank(cluster_score(C), all_users_scored_on_C)
```

- Used for display and peer comparison only
- Not fed back into Myro Score (avoids circular dependency on user pool size)
- Percentile computation deferred — not yet stored in DB

---

## Rank Tiers (INTERNAL ONLY — never returned via API)

| Myro Score | Tier |
|---|---|
| 89–100 | Expert |
| 76–88 | Professional |
| 61–75 | Specialist |
| 41–60 | Practitioner |
| 21–40 | Explorer |
| 0–20 | Newcomer |

Tiers are stored in `user_profiles.rank_tier`. Not exposed to the user directly.
Used for internal cohort analytics and percentile bucketing.

---

## Gap Analysis — Aspiration-Driven, 7-Day Plan

### Design Principle

The gap is measured against **what the user wants to become** (target role, target skills,
target company), not against an abstract maximum. The output is always a **7-day action plan**
so the user has one achievable week of work, not an overwhelming list.

---

### Step 1 — Load Aspiration

From `user_profiles`:
- `target_roles[]` — job titles or role categories
- `target_skills[]` — specific Tax-L3 or Tax-L2 skills the user wants
- `target_companies[]` — companies whose job postings define the required skill set

The required skill set for the aspiration = union of skills demanded by matched job postings
for the target role/company, weighted by frequency.

---

### Step 2 — Compute Skill Gap

For each required skill S in the aspiration skill set:

```python
proficiency_gap(S) = target_proficiency(S) - current_proficiency(S)
# target_proficiency = median proficiency demanded in job postings for that role
# current_proficiency = user's current level (0 if not present)

coverage_gap(C) = required_coverage(C) - cluster_coverage(C)
# required_coverage = fraction of cluster skills demanded by target role postings
```

---

### Step 3 — Convert Gap to Days

Each proficiency level step has an estimated effort in days:

| Transition | Days |
|---|---|
| 0 → Scout P1 (learn the skill) | 1 day |
| Scout P1 → Trailblazer P2 (apply in a project) | 2 days |
| Trailblazer P2 → Excavator P3 (scale impact) | 5 days |
| Excavator P3 → Cartographer P4 (full cluster coverage) | 14 days |
| Cartographer P4 → Legend P5 (industry recognition) | 30+ days |

```python
days_to_close(S) = days_table[current_proficiency(S) → target_proficiency(S)]
```

---

### Step 4 — Build the 7-Day Plan

1. Sort all skill gaps by `market_demand_weight × proficiency_gap` descending
2. Greedily pick skills until the cumulative `days_to_close` reaches **7 days**
3. If a single skill requires >7 days (P3→P4 or above), split into a week-1 sub-task
   (e.g. "close 4/10 missing cluster skills this week")
4. Remaining gaps carry over to week 2 (surfaced as "coming next week" — not shown yet)

```python
# gap_analysis output per skill (field names match compute_gap_skills() return value)
{
  "taxonomy_key": str,
  "skill": str,
  "taxonomy_l2_cluster": str,
  "current_level": int,               # 0–5
  "target_level": int,                # 0–5
  "gap_score": float,                 # (5 - current_level) × market_demand_weight
  "current_title": str,               # e.g. "Scout"
  "target_title": str,                # e.g. "Excavator"
  "days_to_close": int,               # days for next single proficiency step
  "days_allocated": int,              # days actually allocated within 7-day budget
  "market_demand_weight": float,      # 0–1, normalised job demand
  "job_count_30d": int,               # raw demand count from jobs table
  "why_it_matters": str               # templated explanation
}
```

The 7-day plan in `user_job_matches.action_plan` maps these skills to days 1–7.

---

## LLM Job Re-Ranking Prompt

Pool: top 5 jobs by skill overlap. Top 3 surfaced to user.

```python
SYSTEM = """You are a career expert. Given a candidate's profile and job descriptions,
rank the jobs by true fit and explain each briefly."""

USER = f"""
Candidate skills (taxonomy_key: proficiency_level, cluster_coverage):
{json.dumps(user_skills)}

User aspirations:
{json.dumps({"target_roles": target_roles, "target_companies": target_companies})}

Top 5 jobs by skill overlap:
{json.dumps(job_list)}

Return a JSON array ranked 1–5. Each item:
{{ "job_id": str, "rank": int, "explanation": "max 2 sentences" }}
"""
```

---

## 7-Day Action Plan (stored per job match)

```python
# user_job_matches.action_plan
[
  {
    "day": 1,
    "focus_skill": "skill display name",
    "taxonomy_cluster": "Tax-L2 cluster name",
    "tasks": ["concrete task 1", "concrete task 2"],
    "proficiency_move": "Scout → Trailblazer"
  },
  ...
]
```

Days are assigned by gap priority. High-demand, low-effort skills go to days 1–2.
High-demand, higher-effort skills anchor days 3–5. Review/consolidation on days 6–7.
