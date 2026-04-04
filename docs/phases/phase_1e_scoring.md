# Phase 1E — Mirror Score Engine

> Start here only after Phase 1D is fully checked off.
> Full algorithm detail: `docs/SCORING_ALGORITHM.md`

---

## Checklist

- [ ] `backend/app/services/scoring_engine.py` implemented
- [ ] XP computation from CV signals (all 6 signal types handled)
- [ ] Domain score breakdown computed across all 10 domains
- [ ] Rank tier computed — stored in DB but NEVER returned via API
- [ ] Top 5 gap skills identified (gap_score formula applied)
- [ ] Score stored in `mirror_scores` table
- [ ] Score history appended to `mirror_score_history`
- [ ] Tested with 5 synthetic user profiles (see test file below)
- [ ] 100% test coverage on `scoring_engine.py` — no exceptions

---

## XP Signal Table

| Signal | Detection | XP | Inferred Level |
|--------|-----------|-----|----------------|
| Tech mention in skills section only | NER + keyword match | +50 | L1 |
| Tech with project context | NER + sentence context | +150 | L2 |
| Tech with scale/impact metrics | Regex + context | +350 | L3 |
| Leadership/architecture signals + tech | Role title + verb patterns | +500 | L4 |
| Verified certification | Third-party cert proof | +200–400 | Boosted |
| Years of experience | Extracted, applied as weight | — | Multiplier |

---

## Score Formula

```
Mirror Score = (Σ normalised_skill_score across all 63 skills) / 63 × 100

normalised_skill_score(i) = min(inferred_level(i), 5) / 5 × 100

Domain Score = average of normalised_skill_score for all skills in that domain
```

---

## Gap Analysis Formula

```python
gap_score(skill) = (5 - inferred_level) × market_demand_weight
# market_demand_weight = job_count_30d normalised to 0–1 across all skills
# Sort all skills by gap_score desc → return top 5
```

---

## Test File: `backend/tests/test_scoring.py`

Must cover:
- Zero XP profile → Mirror Score = 0
- Full L5 profile → Mirror Score = 100
- Mixed profile → correct domain scores
- Gap skills ordered correctly by gap_score
- Rank tier computed correctly for each score band
- Rank tier is NOT present in the API response object
