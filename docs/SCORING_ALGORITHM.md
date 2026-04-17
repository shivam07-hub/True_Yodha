# Mirror Score Algorithm

> Implemented in: `backend/app/services/scoring_engine.py`
> Taxonomy source: `lightcast_skills_taxonomy.json`

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
cluster_score(C) = cluster_coverage(C) × cluster_proficiency(C)
```

This is the primary unit. It rewards users who are **deep and broad** within a cluster,
not just users who mentioned many skill names.

| Scenario | Coverage | Proficiency | Cluster Score |
|----------|----------|-------------|---------------|
| 1 skill, Excavator (P3) evidence | 0.02 | 0.60 | 0.012 |
| 5 skills, Trailblazer (P2) evidence | 0.10 | 0.40 | 0.040 |
| All skills, Cartographer (P4) evidence | 1.00 | 0.80 | 0.800 |

---

### Step 4 — Domain Score (per Tax-L1 domain)

```
domain_score(D) = mean(cluster_score(C) for all C under D where user has ≥1 skill) × 100
```

Only clusters where the user has evidence contribute. Absent clusters do not penalise.
This prevents punishing a Data Engineer for having zero skills in "Hospitality and Food Services".

---

### Step 5 — Mirror Score

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

- Stored in `user_skill_scores.percentile`
- Used for display and peer comparison only
- Not fed back into Mirror Score (avoids circular dependency on user pool size)

---

## Rank Tiers (INTERNAL ONLY — never returned via API)

| Mirror Score | Tier |
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
# gap_analysis output per skill
{
  "skill_name": str,
  "taxonomy_l2_cluster": str,
  "current_proficiency": int,         # 0–5
  "target_proficiency": int,          # 0–5
  "days_to_close": int,               # contribution to the 7-day window
  "cluster_coverage_current": float,  # 0–1
  "cluster_coverage_required": float, # 0–1
  "market_demand_weight": float,      # 0–1, normalised job demand
  "action_this_week": str,            # specific task for the 7-day window
  "why_it_matters": str               # templated or LLM-generated
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
