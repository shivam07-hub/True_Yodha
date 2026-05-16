"""
job_matcher.py
Skill-overlap scoring via the normalised job_skills join table.

get_top_matches() is DB-agnostic: it accepts pre-fetched job_skill_rows
and a callable for job metadata. DB queries are owned by JobsRepository
(repositories/jobs.py), keeping schema knowledge in one place.

Overlap formula (0–100):
  weighted_matches / max_possible * 100
  where main_skill match = weight 2, side_skill match = weight 1.

Aspiration reranking:
  +30% when any target_role token appears in job_title (case-insensitive)

Anti-bias cap:
  No single company exceeds 30% of top_n results.
"""
from typing import Callable

PRIMARY_WEIGHT = 2.0
SECONDARY_WEIGHT = 1.0
ROLE_BOOST = 1.3
COMPANY_CAP_RATIO = 0.30


def get_top_matches(
    job_skill_rows: list[dict],
    user_skill_map: dict[str, int],
    job_meta_fetcher: Callable[[list[str]], list[dict]],
    target_roles: list[str] | None = None,
    top_n: int = 10,
) -> list[dict]:
    """
    Returns top N jobs sorted by boosted overlap_score descending.

    job_skill_rows: raw rows from job_skills JOIN skills
      [{job_id, is_primary, skills: {taxonomy_key}}]
    user_skill_map: {taxonomy_key: matched_level}
    job_meta_fetcher: callable(job_ids) -> list of job metadata dicts
    """
    if not user_skill_map:
        return []

    user_lower = {k.lower(): v for k, v in user_skill_map.items()}

    job_skill_map: dict[str, dict[str, list[str]]] = {}
    for row in job_skill_rows:
        key = ((row.get("skills") or {}).get("taxonomy_key") or "").strip()
        if not key:
            continue
        jid = row["job_id"]
        if jid not in job_skill_map:
            job_skill_map[jid] = {"main": [], "side": []}
        if row.get("is_primary"):
            job_skill_map[jid]["main"].append(key)
        else:
            job_skill_map[jid]["side"].append(key)

    if not job_skill_map:
        return []

    scored: list[dict] = []
    for jid, skills in job_skill_map.items():
        main = skills["main"]
        side = skills["side"]
        if not main and not side:
            continue

        main_hits = [s for s in main if s.lower() in user_lower]
        side_hits = [s for s in side if s.lower() in user_lower]

        if len(main_hits) + len(side_hits) < 3:
            continue

        max_possible = PRIMARY_WEIGHT * len(main) + SECONDARY_WEIGHT * len(side)
        raw = (PRIMARY_WEIGHT * len(main_hits) + SECONDARY_WEIGHT * len(side_hits)) / max_possible
        score = round(raw * 100, 1)

        scored.append({
            "job_id": jid,
            "overlap_score": score,
            "matched_skills": list({s for s in main_hits + side_hits}),
        })

    if not scored:
        return []

    scored.sort(key=lambda x: x["overlap_score"], reverse=True)

    # Generous candidate window to survive boosts + company cap
    candidates = scored[:min(len(scored), top_n * 10)]
    candidate_ids = [j["job_id"] for j in candidates]

    jobs_data = job_meta_fetcher(candidate_ids)
    job_meta: dict[str, dict] = {row["job_id"]: row for row in jobs_data}

    role_tokens = [r.lower() for r in (target_roles or []) if r]

    full_scored: list[dict] = []
    for job in candidates:
        meta = job_meta.get(job["job_id"])
        if not meta:
            continue

        boosted = job["overlap_score"]
        title_lower = (meta.get("job_title") or "").lower()
        if role_tokens and any(tok in title_lower for tok in role_tokens):
            boosted = round(boosted * ROLE_BOOST, 1)

        full_scored.append({
            "job_id": job["job_id"],
            "title": meta.get("job_title") or "",
            "company": meta.get("company_name"),
            "location": meta.get("location"),
            "industry": meta.get("industry"),
            "apply_url": meta.get("apply_url"),
            "description": (meta.get("job_description") or "")[:800],
            "overlap_score": job["overlap_score"],
            "boosted_score": boosted,
            "matched_skills": job["matched_skills"],
        })

    full_scored.sort(key=lambda x: x["boosted_score"], reverse=True)

    cap = max(1, int(top_n * COMPANY_CAP_RATIO))
    company_count: dict[str, int] = {}
    result: list[dict] = []
    for job in full_scored:
        co = (job.get("company") or "").lower()
        if co and company_count.get(co, 0) >= cap:
            continue
        company_count[co] = company_count.get(co, 0) + 1
        result.append(job)
        if len(result) >= top_n:
            break

    for job in result:
        del job["boosted_score"]

    return result
