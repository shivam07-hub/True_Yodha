"""
job_matcher.py
Skill-overlap scoring against public.jobs (Lightcast main_skills / side_skills arrays).

Overlap formula (0–100):
  weighted_matches / max_possible * 100
  where main_skill match = weight 2, side_skill match = weight 1.

Aspiration reranking:
  +30% when any target_role token appears in job_title (case-insensitive)
  +20% when target_location appears in location OR location contains Remote/Hybrid

Anti-bias cap:
  No single company exceeds 30% of top_n results.
"""

from supabase import Client

PRIMARY_WEIGHT = 2.0
SECONDARY_WEIGHT = 1.0
ROLE_BOOST = 1.3
LOCATION_BOOST = 1.2
COMPANY_CAP_RATIO = 0.30


def get_top_matches(
    db: Client,
    user_skill_map: dict[str, int],
    target_roles: list[str] | None = None,
    target_location: str | None = None,
    top_n: int = 10,
) -> list[dict]:
    """
    Returns top N jobs sorted by boosted overlap_score descending.
    Empty user_skill_map returns [].
    """
    if not user_skill_map:
        return []

    page1 = db.table("jobs").select(
        "job_id, job_title, job_description, company_name, industry, location, apply_url, main_skills, side_skills"
    ).range(0, 999).execute().data
    page2 = db.table("jobs").select(
        "job_id, job_title, job_description, company_name, industry, location, apply_url, main_skills, side_skills"
    ).range(1000, 9999).execute().data

    user_lower = {k.lower(): v for k, v in user_skill_map.items()}
    role_tokens = [r.lower() for r in (target_roles or []) if r]
    loc_lower = (target_location or "").lower()

    scored: list[dict] = []
    for row in page1 + page2:
        main = [s.strip() for s in (row.get("main_skills") or []) if s and s.strip()]
        side = [s.strip() for s in (row.get("side_skills") or []) if s and s.strip()]
        if not main and not side:
            continue

        main_hits = [s for s in main if s.lower() in user_lower]
        side_hits = [s for s in side if s.lower() in user_lower]

        max_possible = PRIMARY_WEIGHT * max(len(main), 1) + SECONDARY_WEIGHT * len(side)
        raw = (PRIMARY_WEIGHT * len(main_hits) + SECONDARY_WEIGHT * len(side_hits)) / max_possible
        score = round(raw * 100, 1)

        boosted = score
        title_lower = (row.get("job_title") or "").lower()
        if role_tokens and any(tok in title_lower for tok in role_tokens):
            boosted = round(boosted * ROLE_BOOST, 1)

        job_loc = (row.get("location") or "").lower()
        if loc_lower and (loc_lower in job_loc or "remote" in job_loc or "hybrid" in job_loc):
            boosted = round(boosted * LOCATION_BOOST, 1)

        desc = (row.get("job_description") or "")[:800]
        scored.append({
            "job_id": row["job_id"],
            "title": row.get("job_title") or "",
            "company": row.get("company_name"),
            "location": row.get("location"),
            "industry": row.get("industry"),
            "apply_url": row.get("apply_url"),
            "description": desc,
            "overlap_score": score,
            "boosted_score": boosted,
            "matched_skills": list({s for s in main_hits + side_hits}),
        })

    scored.sort(key=lambda x: x["boosted_score"], reverse=True)

    # Anti-bias cap: no company > 30% of top_n
    cap = max(1, int(top_n * COMPANY_CAP_RATIO))
    company_count: dict[str, int] = {}
    result: list[dict] = []
    for job in scored:
        co = (job.get("company") or "").lower()
        if co and company_count.get(co, 0) >= cap:
            continue
        company_count[co] = company_count.get(co, 0) + 1
        result.append(job)
        if len(result) >= top_n:
            break

    # Strip internal boosted_score before returning
    for job in result:
        del job["boosted_score"]

    return result
