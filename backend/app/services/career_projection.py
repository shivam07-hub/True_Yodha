"""career_projection — a per-job 1-page CV projected from the Story Reservoir.

The tailoring half of the reservoir: given a target job, pick the stories that
BEST evidence the job's REAL requirements, keep only the relevant roles led
strongest-first, reword the chosen bullets into the job's language (guarded), and
compose a cv_structured through the CV Version Writer Seam as a normal version —
so the playground, export, and apply-snapshot flows all work on it unchanged.

Ranking = Lane C requirements, NOT the scraped `jobs.main_skills` taxonomy.
Requirements are LLM-parsed from the JD prose (jd_coverage); each is embedded and
scored by cosine against every reservoir story's embedding. This is the same
signal the "Job fit" coverage panel trusts — so a real-estate sales JD surfaces
the candidate's real-estate work automatically, instead of ranking on taxonomy
garbage ("Go (Programming Language)" on a sales role).

Transparent, never silent: the response reports included vs parked story counts
(the "included N / parked M" trust move) — nothing is dropped invisibly.

FAIL-SOFT: if requirements can't be parsed/embedded, ranking degrades to a
metric-weighted best-first over all stories (every role still guaranteed its
best); if the reword step fails, verbatim canonical pointers ship. The
deterministic projection is always the floor.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services import cv_parser, embeddings, project_rewrite
from app.services.career_reservoir import cosine

logger = logging.getLogger("myro.career_projection")

# Density: a 6-year profile earns a dense full page, not a sparse half-page.
TOTAL_POINTER_CAP = 16
PER_ROLE_CAP = 4
MAX_ROLES = 6

# A story-requirement cosine below this earns no credit (noise floor).
REL_FLOOR = 0.30
# A role's best story must clear this to make the CV — the relevance gate that
# keeps the projection tight (a fragmented 30-role reservoir → a targeted CV).
ROLE_KEEP_MIN = 0.42


# ── vector parsing ────────────────────────────────────────────────────────────

def _vec(raw: Any) -> list[float] | None:
    """PostgREST returns pgvector columns as a '[0.1,0.2,...]' string."""
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str) and raw.startswith("["):
        import json
        try:
            return [float(x) for x in json.loads(raw)]
        except (json.JSONDecodeError, ValueError):
            return None
    return None


# ── pure ranking + selection ──────────────────────────────────────────────────

def score_story(story_vec: list[float] | None, req_vecs: list[list[float]]) -> float:
    """A story's relevance to the job = the sum of its above-floor cosine to each
    requirement. Multi-requirement stories rank highest; noise is floored out."""
    if not story_vec or not req_vecs:
        return 0.0
    return sum(sim for rv in req_vecs if (sim := cosine(story_vec, rv)) >= REL_FLOOR)


def rank_stories(
    stories: list[dict[str, Any]],
    story_vec_by_id: dict[str, list[float]],
    req_vecs: list[list[float]],
) -> list[tuple[dict[str, Any], float]]:
    """Score each active story against the JD's requirements (best-first). A tiny
    metric bonus breaks ties toward quantified stories. When req_vecs is empty
    (parse/emboss failure) every story scores 0 and the metric bonus alone orders
    them — a graceful metric-weighted fallback that still guarantees every role."""
    ranked: list[tuple[dict[str, Any], float]] = []
    for s in stories:
        if (s.get("status") or "active") != "active":
            continue
        score = score_story(story_vec_by_id.get(str(s.get("id"))), req_vecs)
        if s.get("metrics"):
            score += 0.15
        ranked.append((s, score))
    ranked.sort(key=lambda pair: -pair[1])
    return ranked


def select_stories(
    ranked: list[tuple[dict[str, Any], float]],
    *,
    total_cap: int = TOTAL_POINTER_CAP,
    per_role_cap: int = PER_ROLE_CAP,
    max_roles: int = MAX_ROLES,
    role_keep_min: float = ROLE_KEEP_MIN,
    force_role_ids: set[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(included, parked). Relevance-gated + tight: keep only the roles whose best
    story clears `role_keep_min` (plus any forced current role), capped at
    `max_roles` and led by relevance; then best-first fill each kept role up to the
    caps. Everything else parks. Homeless (role-less) stories qualify on their own
    score.

    Degenerate case (all scores 0 → parse failure): every role's best story clears
    the gate via the "no positive scores anywhere" escape, so the projection never
    collapses to empty — it just falls back to a metric-ordered best-first."""
    force = force_role_ids or set()
    best_by_role: dict[str, float] = {}
    for story, sc in ranked:
        rid = str(story.get("role_id") or "")
        if rid and (rid not in best_by_role or sc > best_by_role[rid]):
            best_by_role[rid] = sc

    any_signal = any(sc > 0 for sc in best_by_role.values())
    # Roles to keep: relevance-gated, led by score, capped — union forced roles.
    eligible = sorted(best_by_role.items(), key=lambda kv: -kv[1])
    kept_roles: set[str] = set(force & set(best_by_role))
    for rid, sc in eligible:
        if len([r for r in kept_roles if r]) >= max_roles and rid not in force:
            break
        if not any_signal or sc >= role_keep_min or rid in force:
            kept_roles.add(rid)

    included: list[dict[str, Any]] = []
    parked: list[dict[str, Any]] = []
    per_role: dict[str, int] = {}
    seen_role: set[str] = set()
    for story, sc in ranked:
        rid = str(story.get("role_id") or "")
        # Role-less stories: keep only if genuinely relevant (or no signal at all).
        role_ok = rid in kept_roles if rid else (not any_signal or sc >= role_keep_min)
        count = per_role.get(rid, 0)
        guaranteed = bool(rid) and rid in kept_roles and rid not in seen_role
        if rid:
            seen_role.add(rid)
        room = len(included) < total_cap and count < per_role_cap
        if role_ok and (room or guaranteed):
            included.append(story)
            per_role[rid] = count + 1
        else:
            parked.append(story)
    return included, parked


def compose_projection(
    baseline_cv: dict[str, Any],
    roles: list[dict[str, Any]],
    included: list[dict[str, Any]],
    text_by_story: dict[str, str],
) -> dict[str, Any]:
    """cv_structured for the projection: contact/summary/skills_line/certs/
    education carry over from the master; experience = work-class roles with their
    selected stories' (reworded-or-verbatim) bullets; projects = role-less/other
    selected stories. Roles with no included story are omitted (page economy)."""
    by_role: dict[str, list[dict[str, Any]]] = {}
    homeless: list[dict[str, Any]] = []
    for s in included:
        rid = s.get("role_id")
        (by_role.setdefault(str(rid), []) if rid else homeless).append(s)

    def bullets_for(stories: list[dict[str, Any]]) -> list[str]:
        out = []
        for s in stories:
            text = text_by_story.get(str(s.get("id")), "").strip()
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
        text = text_by_story.get(str(s.get("id")), "").strip()
        if text:
            projects.append({"name": s.get("title") or "", "bullets": [text]})

    # Every section is emitted, empty ones included. Dropping empty keys here
    # produced a partial payload that any reader validating the full contract
    # 500s on — the same shape that killed six users' CV page. Absent and empty
    # are not the same fact, and only one of them is storable.
    return cv_parser.normalize_structured({
        "contact": baseline_cv.get("contact") or {},
        "summary": baseline_cv.get("summary"),
        "experience": experience,
        "projects": projects,
        "education": baseline_cv.get("education") or [],
        "skills_line": baseline_cv.get("skills_line"),
        "certs": baseline_cv.get("certs") or [],
    })


# ── orchestration ────────────────────────────────────────────────────────────

def _canonical_text(pointers: list[dict[str, Any]]) -> dict[str, str]:
    """story_id -> canonical pointer text (fallback to any variant)."""
    by_story: dict[str, str] = {}
    for p in pointers:
        sid = str(p.get("story_id"))
        if p.get("is_canonical") and sid not in by_story:
            by_story[sid] = p.get("text") or ""
    for p in pointers:
        sid = str(p.get("story_id"))
        by_story.setdefault(sid, p.get("text") or "")
    return by_story


def _force_current_roles(roles: list[dict[str, Any]]) -> set[str]:
    """The current job must never be dropped for relevance — a CV without the
    present role reads as unemployed."""
    return {
        str(r.get("id"))
        for r in roles
        if "present" in str(r.get("date_label") or "").lower() and r.get("id")
    }


async def project_for_job(
    *,
    user_id: str,
    job: dict[str, Any],
    requirements: list[str],
    baseline: dict[str, Any],
    roles: list[dict[str, Any]],
    stories: list[dict[str, Any]],
    pointers: list[dict[str, Any]],
    story_embeddings: list[dict[str, Any]],
    reword: bool = True,
) -> dict[str, Any]:
    """End-to-end: requirement-rank → relevance-gated select → guarded reword →
    compose. Returns {cv_structured, included_ids, parked_ids} for the caller to
    persist. Fully fail-soft — a provider outage degrades quality, never breaks."""
    canonical = _canonical_text(pointers)
    with_pointers = [s for s in stories if canonical.get(str(s.get("id")), "").strip()]

    story_vec_by_id: dict[str, list[float]] = {}
    for row in story_embeddings:
        vec = _vec(row.get("embedding"))
        if vec:
            story_vec_by_id[str(row.get("id"))] = vec

    req_vecs: list[list[float]] = []
    reqs = [r for r in requirements if r and r.strip()]
    if reqs:
        try:
            req_vecs = await embeddings.embed_texts(reqs)
        except Exception as exc:  # noqa: BLE001 — degrade to metric-ordered ranking
            logger.info("career_projection: requirement embed failed (%s)", exc.__class__.__name__)

    ranked = rank_stories(with_pointers, story_vec_by_id, req_vecs)
    included, parked = select_stories(ranked, force_role_ids=_force_current_roles(roles))

    text_by_story = dict(canonical)
    if reword and included:
        role_by_id = {str(r.get("id")): r for r in roles}
        grouped: dict[str, project_rewrite.RoleItems] = {}
        for s in included:
            rid = str(s.get("role_id") or "")
            key = rid or f"story:{s.get('id')}"
            if key not in grouped:
                r = role_by_id.get(rid, {})
                grouped[key] = project_rewrite.RoleItems(
                    key=key, role=str(r.get("title") or s.get("title") or ""),
                    company=str(r.get("company") or ""),
                )
            grouped[key].items.append({"story_id": str(s.get("id")), "text": canonical.get(str(s.get("id")), "")})
        reworded = await project_rewrite.reword_bullets(
            job_title=str(job.get("job_title") or ""),
            company=str(job.get("company_name") or ""),
            requirements=reqs,
            roles=list(grouped.values()),
        )
        text_by_story.update(reworded)

    cv = compose_projection(baseline.get("cv_structured") or {}, roles, included, text_by_story)
    return {
        "cv_structured": cv,
        "included_ids": [str(s.get("id")) for s in included],
        "parked_ids": [str(s.get("id")) for s in parked],
    }
