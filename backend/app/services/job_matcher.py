"""
job_matcher.py
STUB — returns synthetic job matches for testing.

Replace with intern's implementation when delivered.
Contract: get_top_job_matches(user_skill_xp, top_n) → list[dict]

Tests the intern's code must pass: backend/tests/test_job_matcher.py
"""


async def get_top_job_matches(user_skill_xp: dict, top_n: int = 10) -> list[dict]:
    """
    Find top N jobs by skill overlap with user's skill profile.

    Args:
        user_skill_xp: {taxonomy_key: matched_level, ...}
        top_n: number of jobs to return

    Returns:
        [{"job_id": int, "overlap_score": float}, ...] sorted by overlap_score desc
    """
    # STUB — replace with real overlap computation against job_postings
    return [
        {"job_id": i, "overlap_score": round(90 - i * 5, 1)}
        for i in range(1, min(top_n + 1, 11))
    ]
