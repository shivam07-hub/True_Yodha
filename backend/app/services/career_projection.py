"""career_projection — a per-job 1-page CV projected from the Story Reservoir.

The tailoring half of the reservoir: given a target job, select the stories that
fit (skill overlap with the JD, metric-carrying stories preferred), compose a
cv_structured from the user's career_roles + each selected story's canonical
pointer, and write it through the CV Version Writer Seam as a normal
`deterministic` version — so the playground, export, and apply-snapshot flows
all work on it unchanged.

Transparent, never silent: the response reports included vs parked story counts
(the "included N / parked M" trust move) — nothing is dropped invisibly, the
user can curate the reservoir and re-project.

Deterministic ranking (no LLM): the JD's skill names are already extracted at
scrape time (`jobs.main_skills` / `side_skills`); story selection is overlap +
metric bonus. Pure helpers are DB-free and unit-tested.
"""
from __future__ import annotations

from typing import Any

TOTAL_POINTER_CAP = 12   # ~one page of achievement bullets
PER_ROLE_CAP = 4


# ── pure ranking + composition ───────────────────────────────────────────────

def _norm_set(values: list[str] | None) -> set[str]:
    return {v.strip().lower() for v in (values or []) if v and v.strip()}


def rank_stories(
    stories: list[dict[str, Any]],
    primary_skills: list[str],
    secondary_skills: list[str],
) -> list[tuple[dict[str, Any], float]]:
    """Score each active story against the JD: +2 per primary-skill hit, +1 per
    secondary, +0.5 if it carries a real metric. Sorted best-first; ties keep
    reservoir order (stable sort)."""
    primary = _norm_set(primary_skills)
    secondary = _norm_set(secondary_skills)
    ranked: list[tuple[dict[str, Any], float]] = []
    for s in stories:
        if (s.get("status") or "active") != "active":
            continue
        skills = _norm_set(s.get("skills"))
        score = 2.0 * len(skills & primary) + 1.0 * len(skills & secondary)
        if s.get("metrics"):
            score += 0.5
        ranked.append((s, score))
    ranked.sort(key=lambda pair: -pair[1])
    return ranked


def select_stories(
    ranked: list[tuple[dict[str, Any], float]],
    *,
    total_cap: int = TOTAL_POINTER_CAP,
    per_role_cap: int = PER_ROLE_CAP,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(included, parked). Every role with any story keeps at least its best one
    (an empty role block reads as a gap on the page), then best-first fill."""
    included: list[dict[str, Any]] = []
    parked: list[dict[str, Any]] = []
    per_role: dict[str, int] = {}

    best_seen_roles: set[str] = set()
    for story, _score in ranked:
        rid = str(story.get("role_id") or "")
        count = per_role.get(rid, 0)
        guaranteed = rid and rid not in best_seen_roles
        if rid:
            best_seen_roles.add(rid)
        if (len(included) < total_cap and count < per_role_cap) or (guaranteed and count == 0):
            included.append(story)
            per_role[rid] = count + 1
        else:
            parked.append(story)
    return included, parked


def compose_projection(
    baseline_cv: dict[str, Any],
    roles: list[dict[str, Any]],
    included: list[dict[str, Any]],
    pointer_by_story: dict[str, str],
) -> dict[str, Any]:
    """cv_structured for the projection: contact/summary/skills_line/certs/
    education carry over from the master; experience = work-class roles with
    their selected stories' pointers; projects = role-less/other selected
    stories. Roles with no included story are omitted (page economy)."""
    by_role: dict[str, list[dict[str, Any]]] = {}
    homeless: list[dict[str, Any]] = []
    for s in included:
        rid = s.get("role_id")
        (by_role.setdefault(str(rid), []) if rid else homeless).append(s)

    def bullets_for(stories: list[dict[str, Any]]) -> list[str]:
        out = []
        for s in stories:
            text = pointer_by_story.get(str(s.get("id")), "").strip()
            if text:
                out.append(text)
        return out

    experience: list[dict[str, Any]] = []
    projects: list[dict[str, Any]] = []
    for r in roles:
        stories = by_role.get(str(r.get("id")), [])
        bullets = bullets_for(stories)
        if not bullets:
            continue
        if (r.get("kind") or "work") in ("work", "volunteer", "leadership"):
            experience.append({
                "role": r.get("title") or "",
                "company": r.get("company") or "",
                "dates": r.get("date_label") or "",
                "bullets": bullets,
            })
        else:
            projects.append({"name": f"{r.get('title') or ''} — {r.get('company') or ''}".strip(" —"),
                             "bullets": bullets})

    for s in homeless:
        text = pointer_by_story.get(str(s.get("id")), "").strip()
        if text:
            projects.append({"name": s.get("title") or "", "bullets": [text]})

    cv = {
        "contact": baseline_cv.get("contact") or {},
        "summary": baseline_cv.get("summary"),
        "experience": experience,
        "projects": projects,
        "education": baseline_cv.get("education") or [],
        "skills_line": baseline_cv.get("skills_line"),
        "certs": baseline_cv.get("certs") or [],
    }
    return {k: v for k, v in cv.items() if v not in (None, "", [])}


# ── orchestration ────────────────────────────────────────────────────────────

def project_for_job(
    *,
    user_id: str,
    job: dict[str, Any],
    baseline: dict[str, Any],
    roles: list[dict[str, Any]],
    stories: list[dict[str, Any]],
    pointers: list[dict[str, Any]],
) -> dict[str, Any]:
    """Pure end-to-end: rank → select → compose. Returns
    {cv_structured, included_ids, parked_ids} for the caller to persist."""
    pointer_by_story: dict[str, str] = {}
    for p in pointers:
        sid = str(p.get("story_id"))
        if p.get("is_canonical") and sid not in pointer_by_story:
            pointer_by_story[sid] = p.get("text") or ""
    for p in pointers:  # fallback: any variant when no canonical
        sid = str(p.get("story_id"))
        pointer_by_story.setdefault(sid, p.get("text") or "")

    with_pointers = [s for s in stories if pointer_by_story.get(str(s.get("id")), "").strip()]
    ranked = rank_stories(with_pointers, job.get("main_skills") or [], job.get("side_skills") or [])
    included, parked = select_stories(ranked)
    cv = compose_projection(baseline.get("cv_structured") or {}, roles, included, pointer_by_story)
    return {
        "cv_structured": cv,
        "included_ids": [str(s.get("id")) for s in included],
        "parked_ids": [str(s.get("id")) for s in parked],
    }
