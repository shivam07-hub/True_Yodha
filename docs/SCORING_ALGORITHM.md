# Mirror Score Algorithm

> Implemented in: `backend/app/services/scoring_engine.py`

---

## Mirror Score Formula

```
Mirror Score = (Σ normalised_skill_score across all 63 skills) / 63 × 100

normalised_skill_score(i) = min(matched_level(i), 5) / 5 × 100

Domain Score = average of normalised_skill_score for all skills in that domain
```

---

## How Skill Level Is Determined (CV → Taxonomy Matching)

The user's CV is **not self-assessed**. The CV parser extracts evidence text and matches it
against the `skill_levels` taxonomy definitions. The level assigned is the highest level
whose benchmark description the evidence satisfies.

| Signal in CV | Taxonomy Match | Matched Level |
|---|---|---|
| Skill name mention only (no context) | L1 description match | L1 — Foundation |
| Used in a project or task context | L2 description match | L2 — Practitioner |
| Applied with measurable impact or scale | L3 description match | L3 — Professional |
| Led design, architecture, or team with this skill | L4 description match | L4 — Expert |
| Published, taught, or industry-recognised for this skill | L5 description match | L5 — Authority |

**Source of truth for level definitions:** `skill_levels` table. Definitions are updated when
market evidence shows the benchmark has shifted — never edited manually without updating
`skill_taxonomy_mapping/taxonomy.json` and logging in `TAXONOMY_CHANGELOG.md`.

---

## Proficiency Levels

| Level | Label | What it means |
|-------|-------|--------------|
| L1 | Foundation | Awareness / basic usage |
| L2 | Practitioner | Applied in real projects |
| L3 | Professional | Measurable impact at scale |
| L4 | Expert | Leads / architects with this skill |
| L5 | Authority | Industry-recognised, teaches or publishes |

---

## Rank Tiers (INTERNAL ONLY — never returned via API)

| Score | Tier |
|-------|------|
| 89–100 | Expert |
| 76–88 | Professional |
| 61–75 | Specialist |
| 41–60 | Practitioner |
| 21–40 | Explorer |
| 0–20 | Newcomer |

---

## Gap Analysis — Top 5 Upgrade Priorities

```python
gap_score(skill) = (5 - matched_level) × market_demand_weight
# market_demand_weight = skill.job_count_30d normalised to 0–1 across all 63 skills
# Sort all skills by gap_score descending
# Return top 5 as:
{
  "skill": str,
  "current_level": int,
  "target_level": int,        # current_level + 1
  "gap_score": float,
  "job_count_30d": int,
  "why_it_matters": str       # LLM-generated or template string
}
```

---

## LLM Job Re-Ranking Prompt

Pool: top 5 jobs by skill overlap. Top 3 are surfaced to the user as recommended.

```python
SYSTEM = """You are a career expert. Given a candidate's profile and job descriptions,
rank the jobs by true fit and explain each briefly."""

USER = f"""
Candidate skills (taxonomy_key: matched_level):
{json.dumps(user_skills)}

Top 5 jobs by skill overlap:
{json.dumps(job_list)}

Return a JSON array ranked 1-5. Each item:
{{ "job_id": int, "rank": int, "explanation": "max 2 sentences" }}
"""
```

---

## 7-Day Action Plan

For each of the top 3 recommended jobs, generate a day-by-day plan to close the gap
between the user's current skill levels and the job's required levels.

```python
# action_plan format stored in user_job_matches.action_plan
[
  {
    "day": 1,
    "focus": "skill display name",
    "tasks": ["task 1", "task 2"]
  },
  ...
]
```
