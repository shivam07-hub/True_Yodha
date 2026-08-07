"""
job_matcher.py
Skill-overlap scoring via the normalised job_skills join table.

get_top_matches() is DB-agnostic: it accepts pre-fetched job_skill_rows
and a callable for job metadata. DB queries are owned by JobsRepository
(repositories/jobs.py), keeping schema knowledge in one place.

Overlap formula (0–100):
  sum(required_level * credit) / sum(required_level) * 100

  A job's skill is weighted by the DEPTH it asks for, and each match earns
  partial credit for how close the candidate's level is. `is_primary` used to
  carry this and cannot: it is TRUE on 94.2% of prod rows, so the old
  main/side split was a constant dressed as a signal. `required_level` is
  genuinely graded (1: 12.7% · 2: 41.5% · 3: 33.8% · 4: 12.0%) and
  `user_skills.matched_level` is the same 1-4 scale, which is what makes
  "Python at L4 required, you are at L2" expressible end to end.

  Soft skills are excluded from both sides. They are captured and shown, but
  we cannot teach Resilience — scoring it would move a fit percentage on
  something the user can never act on.

Aspiration reranking:
  +30% when any target_role token appears in job_title (case-insensitive)

Anti-bias cap:
  No single company exceeds 30% of top_n results.
"""
from typing import Callable

# Retained only for the level fallback below. The main/side split itself is
# gone: `is_primary` was TRUE on 94.2% of rows.
DEFAULT_REQUIRED_LEVEL = 2
MAX_LEVEL = 4
ROLE_BOOST = 1.3
COMPANY_CAP_RATIO = 0.30
MAX_MISSING_SKILLS = 8  # cap the persisted gap list; the card shows far fewer


def wanted_skills(job_skill_rows: list[dict]) -> dict[str, int]:
    """{taxonomy_key: required_level} for ONE job's rows, hard skills only.

    Deepest ask wins a duplicate key. Soft skills are dropped here rather than
    at every call site: they are shown elsewhere, but we cannot teach
    Resilience, so letting one move a fit percentage prices something the user
    can never act on.
    """
    wanted: dict[str, int] = {}
    for row in job_skill_rows:
        skill = row.get("skills") or {}
        key = (skill.get("taxonomy_key") or "").strip()
        if not key or skill.get("skill_kind") == "soft":
            continue
        try:
            level = int(row.get("required_level") or DEFAULT_REQUIRED_LEVEL)
        except (TypeError, ValueError):
            level = DEFAULT_REQUIRED_LEVEL
        wanted[key] = max(wanted.get(key, 0), min(max(level, 1), MAX_LEVEL))
    return wanted


def score_wanted(
    wanted: dict[str, int], user_lower: dict[str, int]
) -> tuple[float, list[str], list[str]]:
    """(score 0-100, matched, missing-deepest-first) for one job.

    THE overlap formula — not a copy of it. on_demand and feed_warm used to
    mirror this with the same weight constants and a comment hoping the numbers
    would not drift; a shared function is what actually guarantees that.
    """
    if not wanted:
        return 0.0, [], []
    max_possible = sum(wanted.values())
    earned = 0.0
    matched: list[str] = []
    ranked_missing: list[tuple[int, str]] = []
    for key, level in wanted.items():
        held = user_lower.get(key.lower())
        if held is None:
            ranked_missing.append((level, key))
            continue
        matched.append(key)
        earned += level * min(held / level, 1.0)
    ranked_missing.sort(key=lambda item: (-item[0], item[1]))
    score = round(earned / max_possible * 100, 1) if max_possible else 0.0
    return score, matched, [key for _level, key in ranked_missing]


def get_top_matches(
    job_skill_rows: list[dict],
    user_skill_map: dict[str, int],
    job_meta_fetcher: Callable[[list[str]], list[dict]],
    target_roles: list[str] | None = None,
    top_n: int = 10,
    min_skill_overlap: int = 3,
    fallback_min_skill_overlap: int = 2,
    debug: dict[str, int] | None = None,
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

    by_job: dict[str, list[dict]] = {}
    for row in job_skill_rows:
        jid = row.get("job_id")
        if jid:
            by_job.setdefault(str(jid), []).append(row)

    job_skill_map = {jid: wanted_skills(rows) for jid, rows in by_job.items()}
    if not job_skill_map:
        return []

    scored: list[dict] = []
    for jid, wanted in job_skill_map.items():
        if not wanted:
            continue
        score, matched, missing = score_wanted(wanted, user_lower)
        if not matched:
            continue
        match_count = len(matched)
        scored.append({
            "job_id": jid,
            "overlap_score": score,
            "matched_skills": matched,
            "missing_skills": missing[:MAX_MISSING_SKILLS],
            "_match_count": match_count,
        })

    if not scored:
        return []

    selected_floor = min_skill_overlap
    qualified = [job for job in scored if job["_match_count"] >= min_skill_overlap]
    min_viable_pool = max(1, top_n // 2)
    if len(qualified) < min_viable_pool and fallback_min_skill_overlap < min_skill_overlap:
        fallback_qualified = [
            job for job in scored
            if job["_match_count"] >= fallback_min_skill_overlap
        ]
        if len(fallback_qualified) > len(qualified):
            selected_floor = fallback_min_skill_overlap
            qualified = fallback_qualified

    if debug is not None:
        debug["min_skill_overlap"] = selected_floor
        debug["qualified_jobs_count"] = len(qualified)

    if not qualified:
        return []

    qualified.sort(key=lambda x: x["overlap_score"], reverse=True)

    # Generous candidate window to survive boosts + company cap
    candidates = qualified[:min(len(qualified), top_n * 10)]
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
            "location_city": meta.get("location_city"),
            "location_country": meta.get("location_country"),
            "location_mode": meta.get("location_mode"),
            "industry": meta.get("industry"),
            "apply_url": meta.get("apply_url"),
            "description": (meta.get("job_description") or "")[:800],
            "overlap_score": job["overlap_score"],
            "boosted_score": boosted,
            "matched_skills": job["matched_skills"],
            "missing_skills": job["missing_skills"],
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
