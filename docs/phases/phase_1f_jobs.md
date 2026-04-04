# Phase 1F — Job Matching Pipeline

> Start here only after Phase 1E is fully checked off.
> Intern contracts: `docs/INTERN_CONTRACTS.md`

---

## Checklist

- [ ] Job postings in DB tagged with taxonomy skill IDs (scraper batch job or manual tag run)
- [ ] `job_matcher.py` skill-overlap scoring implemented (or intern version passes tests)
- [ ] Top 10 jobs retrieved by overlap score
- [ ] `llm_ranker.py` implemented — sends top 10 + user CV to GPT-4o mini
- [ ] LLM returns ranked list with per-job explanation (2 sentences max)
- [ ] Explanations stored in `user_job_matches` table
- [ ] `GET /jobs/matches` endpoint returns ranked jobs with explanations
- [ ] LLM results cached — do not re-call LLM if user hasn't updated CV

---

## LLM Ranker Prompt Structure

```python
SYSTEM = """You are a career expert. Given a candidate profile and job descriptions,
rank the jobs by true fit and explain each briefly."""

USER = f"""
Candidate skills (taxonomy_key: level):
{json.dumps(user_skill_xp)}

Job descriptions (top 10 by skill overlap):
{json.dumps(job_list)}

Return a JSON array, ranked 1-10. Each item:
{{ "job_id": int, "rank": int, "explanation": "2 sentences max" }}
"""
```

---

## Cost Control

- Model: `gpt-4o-mini` only (not gpt-4o or gpt-4-turbo)
- Call once per user per CV version — cache result in `user_job_matches`
- Invalidate cache only when user uploads a new CV or changes target role
