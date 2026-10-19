"""Job Document facts for overlap and the judge.

Overlap unions the paper's skills line for that job. The judge receives the
coverage panel's verdicts as sentences, not a grade — the panel decided what
proves what (ARCHITECTURE_JD_REFLECTION.md §0); nothing here judges again.
"""
from __future__ import annotations

from typing import Any

from app.repositories.cv import CVVersionsRepository
from app.services import jd_coverage, jd_reflection, job_matcher


def readable_client(repo: Any) -> Any | None:
    client = getattr(repo, "client", None)
    if client is None or not callable(getattr(client, "table", None)):
        return None
    return client


def requirement_strings(raw: str | None) -> list[str]:
    hit = jd_coverage.payload_to_result(raw)
    if hit is None:
        return []
    return [item.requirement for item in hit[0].requirements if item.requirement.strip()]


def proof_sets(raw: str | None) -> list[list[str]]:
    """Per requirement, the CV lines the panel ruled proving."""
    hit = jd_coverage.payload_to_result(raw)
    if hit is None:
        return []
    return [list(item.proof_lines) for item in hit[0].requirements]


def reflection_text(raw: str | None) -> str:
    """The panel's verdicts as facts: each requirement with its proving line,
    or as a gap."""
    hit = jd_coverage.payload_to_result(raw)
    if hit is None:
        return ""
    return jd_reflection.format_block([
        (item.requirement, item.story_pointer if item.status != "gap" and item.story_pointer else None)
        for item in hit[0].requirements
    ])


def skills_lines_for(repo: Any, user_id: str, job_ids: list[str]) -> dict[str, str]:
    client = readable_client(repo)
    if client is None or not job_ids:
        return {}
    papers = CVVersionsRepository(client).structured_for_jobs(user_id, job_ids)
    out: dict[str, str] = {}
    for job_id, structured in papers.items():
        line = str(structured.get("skills_line") or "").strip()
        if line:
            out[job_id] = line
    return out


def stamp_shortlist(
    repo: Any,
    user_id: str,
    jobs: list[dict[str, Any]],
    job_skill_rows: list[dict[str, Any]],
    user_skill_map: dict[str, int],
) -> None:
    """Recompute overlap from the paper's skills line and attach the reflection.

    Jobs with no Job Document are left as the deterministic overlap computed them.
    """
    client = readable_client(repo)
    if client is None or not jobs:
        return
    ids = [str(job["job_id"]) for job in jobs if job.get("job_id")]
    papers = CVVersionsRepository(client).structured_for_jobs(user_id, ids)
    if not papers:
        return
    deepenings: dict[str, dict[str, str]] = {}
    if hasattr(repo, "get_deepenings_for_jobs"):
        deepenings = repo.get_deepenings_for_jobs(
            user_id, list(papers), (jd_coverage.CACHE_PROMPT_KEY,),
        )
    rows_by_job: dict[str, list[dict[str, Any]]] = {}
    for row in job_skill_rows:
        job_id = str(row.get("job_id") or "")
        if job_id in papers:
            rows_by_job.setdefault(job_id, []).append(row)
    user_lower = {key.lower(): level for key, level in user_skill_map.items()}
    for job in jobs:
        job_id = str(job.get("job_id") or "")
        structured = papers.get(job_id)
        if not structured:
            continue
        line = str(structured.get("skills_line") or "").strip()
        rows = rows_by_job.get(job_id)
        if line and rows:
            score, matched, missing = job_matcher.overlap(rows, user_lower, paper_skills=line)
            job["overlap_score"] = score
            job["matched_skills"] = list(dict.fromkeys(matched))
            job["missing_skills"] = missing[: job_matcher.MAX_MISSING_SKILLS]
        raw = (deepenings.get(job_id) or {}).get(jd_coverage.CACHE_PROMPT_KEY)
        block = reflection_text(raw)
        if block:
            job["jd_reflection"] = block
