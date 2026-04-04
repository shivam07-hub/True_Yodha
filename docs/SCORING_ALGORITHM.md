# Mirror Score Algorithm

> Implemented in: `backend/app/services/scoring_engine.py`

---

## Mirror Score Formula

```
Mirror Score = (Σ normalised_skill_score across all 63 skills) / 63 × 100

normalised_skill_score(i) = min(inferred_level(i), 5) / 5 × 100

Domain Score = average of normalised_skill_score for all skills in that domain
```

---

## XP Computation from CV

| Signal | Detection Method | XP Added | Inferred Level |
|--------|-----------------|----------|----------------|
| Tech mention in skills section only | NER + keyword match vs technology_aliases | +50 | L1 |
| Tech with project context | NER + sentence context analysis | +150 | L2 |
| Tech with scale/impact metrics | Regex for numbers + context | +350 | L3 |
| Leadership/architecture + technology | Role title analysis + verb patterns | +500 | L4 |
| Verified certification | Third-party cert proof | +200–400 | Boosted |
| Years of experience | Extracted, applied as multiplier | — | Weight modifier |

---

## Proficiency Levels

| Level | Label | XP Range |
|-------|-------|---------|
| L1 | Foundation | 0–999 |
| L2 | Practitioner | 1,000–4,999 |
| L3 | Professional | 5,000–14,999 |
| L4 | Expert | 15,000–34,999 |
| L5 | Authority | 35,000+ |

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
gap_score(skill) = (5 - inferred_level) × market_demand_weight
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

```python
SYSTEM = """You are a career expert. Given a candidate's profile and job descriptions,
rank the jobs by true fit and explain each briefly."""

USER = f"""
Candidate skills (taxonomy_key: inferred_level):
{json.dumps(user_skill_xp)}

Top 10 jobs by skill overlap:
{json.dumps(job_list)}

Return a JSON array ranked 1-10. Each item:
{{ "job_id": int, "rank": int, "explanation": "max 2 sentences" }}
"""
```
