# Phase 1C — Backend API (FastAPI)

> Start here only after Phase 1B is fully checked off.
> Scoring algorithm detail: `docs/SCORING_ALGORITHM.md`
> Intern contracts: `docs/INTERN_CONTRACTS.md`

---

## Checklist

### Setup
- [ ] FastAPI project initialised in `backend/`
- [ ] Supabase client dependency wired into FastAPI (see `database.py`)
- [ ] Pydantic response schemas created in `app/schemas/` for all endpoints
- [ ] `SUPABASE_ANON_KEY` added to `backend/.env` and `.env.example`

### Endpoints
- [ ] `POST /auth/signup` and `POST /auth/login` (Supabase Auth)
- [ ] `GET /users/me` and `PUT /users/me/profile`
- [ ] `GET /skills` and `GET /skills/domains`
- [ ] `POST /cv/upload` (parse → XP computation)
- [ ] `POST /scores/compute` and `GET /scores/me`
- [ ] `GET /jobs/matches` (overlap → LLM ranked)
- [ ] `GET /health`

### Intern Stubs (build these first, replace when intern delivers)
- [ ] `cv_parser.py` stub returns synthetic skill signals
- [ ] `job_matcher.py` stub returns synthetic top 10 matches
- [ ] Tests written for both (intern's code must pass these to ship)

### Deployment
- [ ] Backend deployed to Railway
- [ ] `GET /health` returns `{"status": "ok"}` from Railway URL

---

## API Response Rules

`GET /scores/me` response shape — **never include `rank_tier` or `percentile`:**
```json
{
  "total_score": 67.4,
  "domain_scores": { "SD": 72, "DE": 45, "AML": 81 },
  "gap_skills": [
    { "skill": "MLOps & Model Deployment", "current_level": 2, "target_level": 3,
      "gap_score": 48.2, "job_count_30d": 1240, "why_it_matters": "..." }
  ]
}
```

`GET /jobs/matches` response shape:
```json
{
  "jobs": [
    { "id": 1, "title": "...", "company": "...", "overlap_score": 82.1,
      "llm_rank": 1, "llm_explanation": "..." }
  ]
}
```

---

## Intern Contracts

```python
# cv_parser.py
async def parse_cv(file_bytes: bytes, file_type: str) -> dict:
    """
    Returns: {
        "skills_detected": [
            {"taxonomy_key": str, "xp_awarded": int, "signal_type": str, "evidence": str}
        ],
        "raw_text": str
    }
    """

# job_matcher.py
async def get_top_job_matches(user_skill_xp: dict, top_n: int = 10) -> list[dict]:
    """
    user_skill_xp: {taxonomy_key: inferred_level, ...}
    Returns: [{"job_id": int, "overlap_score": float}, ...] sorted by overlap_score desc
    """
```
