# Intern Collaboration Contracts

> The intern is building `cv_parser.py` and `job_matcher.py`.
> Build stubs first. Write tests. Drop in intern's code when delivered — if tests pass, it ships.

---

## cv_parser.py — Expected Interface

```python
# backend/app/services/cv_parser.py

async def parse_cv(file_bytes: bytes, file_type: str) -> dict:
    """
    Parse a CV file and return detected skill signals.

    Args:
        file_bytes: Raw bytes of the uploaded file
        file_type: "pdf" or "docx"

    Returns:
        {
            "skills_detected": [
                {
                    "taxonomy_key": str,     # e.g. "javascript_typescript"
                    "xp_awarded": int,       # XP from signal table
                    "signal_type": str,      # "mention" | "project" | "impact" | "leadership"
                    "evidence": str          # raw text that triggered this signal
                }
            ],
            "raw_text": str                  # full extracted text (for LLM ranker)
        }
    """
```

---

## job_matcher.py — Expected Interface

```python
# backend/app/services/job_matcher.py

async def get_top_job_matches(user_skill_xp: dict, top_n: int = 10) -> list[dict]:
    """
    Find top N jobs by skill overlap with user's XP profile.

    Args:
        user_skill_xp: {taxonomy_key: inferred_level, ...}
                       e.g. {"javascript_typescript": 3, "react_angular_vue": 2}
        top_n: Number of jobs to return (default 10)

    Returns:
        [
            {"job_id": int, "overlap_score": float},  # 0–100
            ...
        ]
        Sorted by overlap_score descending.
    """
```

---

## Stub Implementations (use until intern delivers)

```python
# cv_parser.py stub
async def parse_cv(file_bytes: bytes, file_type: str) -> dict:
    return {
        "skills_detected": [
            {"taxonomy_key": "javascript_typescript", "xp_awarded": 150,
             "signal_type": "project", "evidence": "Built React dashboard"},
            {"taxonomy_key": "api_design_development", "xp_awarded": 50,
             "signal_type": "mention", "evidence": "REST APIs"},
        ],
        "raw_text": "Stub CV text for testing"
    }

# job_matcher.py stub
async def get_top_job_matches(user_skill_xp: dict, top_n: int = 10) -> list[dict]:
    return [
        {"job_id": i, "overlap_score": round(90 - i * 5, 1)}
        for i in range(1, min(top_n + 1, 11))
    ]
```

---

## Test Criteria (intern's code must pass all of these)

**cv_parser tests:**
- Accepts valid PDF bytes without raising
- Accepts valid DOCX bytes without raising
- Returns `skills_detected` as a list (can be empty)
- Each item in `skills_detected` has keys: `taxonomy_key`, `xp_awarded`, `signal_type`, `evidence`
- All `taxonomy_key` values exist in `skill_taxonomy_mapping/taxonomy.json`
- Returns `raw_text` as a non-empty string for non-trivial CVs

**job_matcher tests:**
- Returns a list of dicts with keys `job_id` and `overlap_score`
- `overlap_score` is between 0 and 100
- Results sorted by `overlap_score` descending
- Returns at most `top_n` results
- Empty `user_skill_xp` returns empty list (no crash)
