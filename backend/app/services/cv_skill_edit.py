"""Inline skill-driven baseline edits.

Backlog #16 follow-up. Locked decisions SE1–SE17 in CLAUDE.md.

When a user clicks ✎ on a skill card on /skills, the modal collects new bullet
text and POSTs to /cv/skill-edit. This module owns:

  * locate_bullet()           — find the (section, indices) tuple inside the
                                latest baseline's cv_structured that holds the
                                skill's evidence_text. Returns either one hit,
                                a list of candidates (>1 match → 409), or None.
  * apply_bullet_edit()       — return a new cv_structured with the target
                                bullet replaced, leaving every other field
                                untouched.
  * diff_keyword_skills()     — sync-side skill diff. Returns the taxonomy_keys
                                whose evidence_text no longer occurs in the new
                                body_text. These rows get evicted immediately so
                                /skills reflects the change before the async
                                LLM re-tag finishes.
  * run_async_retag()         — background task. Re-tags the new baseline via
                                parse_cv_text, recomputes the score via
                                record_cv_score, and stamps recompute_finished_at
                                on the new baseline row.

Locator is text-scan based (SE2 = A+C). When evidence_text appears verbatim in
multiple places, locate_bullet returns LocateConflict so the router can answer
409 and the client can prompt the user to pick.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from app.database import get_supabase_admin
from app.repositories.cv import CVVersionsRepository
from app.repositories.scores import ScoresRepository
from app.services import background, cv_compose, cv_parser, scoring

logger = logging.getLogger(__name__)


@background.handler("skill_retag")
async def _skill_retag_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Bulk-lane Background Job (ADR-0008) for the post-skill-edit re-tag.

    Builds its own admin-scoped repos — the worker has no request context.
    run_async_retag is best-effort (swallows its own errors + always stamps
    recompute_finished_at), so it is terminal: no retry path needed.
    """
    admin_db = get_supabase_admin()
    await run_async_retag(
        CVVersionsRepository(admin_db),
        ScoresRepository(admin_db),
        payload["user_id"],
        payload["baseline_id"],
        payload["new_body_text"],
    )


# Editable section kinds per SE15. Education stays out — multi-field row.
EDITABLE_SECTIONS = {"summary", "exp_bullet", "proj_bullet", "skills_line", "cert"}


# ── Public dataclasses ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BulletLocation:
    """Concrete pointer into a cv_structured payload."""
    section: str          # one of EDITABLE_SECTIONS
    item_index: int       # outer index — experience[i], projects[i], certs[i]; 0 for singletons
    bullet_index: int     # inner bullet index for exp/proj; 0 for singletons
    text: str             # the bullet text currently stored at this location
    label: str            # human-readable context ("Experience · Senior Eng @ Co · bullet 2")


@dataclass(frozen=True)
class LocateConflict:
    """More than one bullet matched evidence_text. Caller must prompt user."""
    candidates: list[BulletLocation]


# ── Locator ───────────────────────────────────────────────────────────────────


def _walk_locations(cv_structured: dict[str, Any]) -> list[BulletLocation]:
    """Enumerate every editable text region in a cv_structured payload."""
    out: list[BulletLocation] = []

    summary = (cv_structured.get("summary") or "").strip()
    if summary:
        out.append(BulletLocation("summary", 0, 0, summary, "Summary"))

    for i, exp in enumerate(cv_structured.get("experience") or []):
        ctx = f"{exp.get('role') or ''} @ {exp.get('company') or ''}".strip(" @")
        for j, bullet in enumerate(exp.get("bullets") or []):
            bullet = (bullet or "").strip()
            if bullet:
                out.append(BulletLocation("exp_bullet", i, j, bullet, f"Experience · {ctx} · bullet {j + 1}"))

    for i, proj in enumerate(cv_structured.get("projects") or []):
        name = (proj.get("name") or "").strip()
        for j, bullet in enumerate(proj.get("bullets") or []):
            bullet = (bullet or "").strip()
            if bullet:
                out.append(BulletLocation("proj_bullet", i, j, bullet, f"Project · {name} · bullet {j + 1}"))

    skills_line = (cv_structured.get("skills_line") or "").strip()
    if skills_line:
        out.append(BulletLocation("skills_line", 0, 0, skills_line, "Skills line"))

    for i, cert in enumerate(cv_structured.get("certs") or []):
        cert = (cert or "").strip()
        if cert:
            out.append(BulletLocation("cert", i, 0, cert, f"Certification · {cert[:40]}"))

    return out


def locate_bullet(
    cv_structured: dict[str, Any],
    evidence_text: str,
    section_hint: str | None = None,
    item_index: int | None = None,
    bullet_index: int | None = None,
) -> BulletLocation | LocateConflict | None:
    """Find the bullet inside cv_structured that backs `evidence_text`.

    Resolution rules (SE2):
      1. If (section_hint, item_index, bullet_index) is provided and the
         location holds a non-empty bullet, return that — the client already
         picked it.
      2. Otherwise scan all editable locations for an exact-text match against
         evidence_text. If exactly 1 → return it. If >1 → LocateConflict.
      3. If nothing matches verbatim, fall back to substring containment
         (some LLMs stash a slightly trimmed excerpt). Single match → win.
         Multiple → LocateConflict. None → None.
    """
    locations = _walk_locations(cv_structured)

    if section_hint and item_index is not None and bullet_index is not None:
        for loc in locations:
            if (
                loc.section == section_hint
                and loc.item_index == item_index
                and loc.bullet_index == bullet_index
            ):
                return loc
        return None

    needle = (evidence_text or "").strip()
    if not needle:
        return None

    exact = [loc for loc in locations if loc.text == needle]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return LocateConflict(exact)

    # Substring containment fallback — handles tagger-trimmed evidence.
    contains = [loc for loc in locations if needle.lower() in loc.text.lower()]
    if len(contains) == 1:
        return contains[0]
    if len(contains) > 1:
        return LocateConflict(contains)

    return None


# ── Mutator ───────────────────────────────────────────────────────────────────


def apply_bullet_edit(
    cv_structured: dict[str, Any],
    location: BulletLocation,
    new_text: str,
) -> dict[str, Any]:
    """Return a deep-copied cv_structured with the target bullet replaced."""
    if not new_text or not new_text.strip():
        raise ValueError("new_text cannot be empty")

    fresh = deepcopy(cv_structured)
    text = new_text.strip()

    if location.section == "summary":
        fresh["summary"] = text
    elif location.section == "skills_line":
        fresh["skills_line"] = text
    elif location.section == "exp_bullet":
        fresh["experience"][location.item_index]["bullets"][location.bullet_index] = text
    elif location.section == "proj_bullet":
        fresh["projects"][location.item_index]["bullets"][location.bullet_index] = text
    elif location.section == "cert":
        fresh["certs"][location.item_index] = text
    else:
        raise ValueError(f"Unsupported section: {location.section!r}")

    return fresh


# ── Sync skill diff ───────────────────────────────────────────────────────────


def diff_keyword_skills(
    scores_repo: ScoresRepository,
    user_id: str,
    new_body_text: str,
) -> list[str]:
    """Drop user_skills whose stored evidence keyword no longer appears anywhere
    in the rewritten CV. Returns the list of taxonomy_keys that were evicted.

    This is the cheap, synchronous half of SE3=D. The async re-tag still runs
    afterwards and may re-add skills surfaced via synonyms.
    """
    rows = scores_repo.client.table("user_skills") \
        .select("skills(taxonomy_key, display_name), evidence_text") \
        .eq("user_id", user_id).execute()

    haystack = new_body_text.lower()
    evicted: list[str] = []
    for row in rows.data or []:
        skill = row.get("skills") or {}
        taxonomy_key = skill.get("taxonomy_key")
        display_name = (skill.get("display_name") or "").lower()
        if not taxonomy_key or not display_name:
            continue
        if display_name in haystack:
            continue  # display name still present
        evidence = (row.get("evidence_text") or "").strip().lower()
        if evidence and evidence in haystack:
            continue  # original evidence still present
        evicted.append(taxonomy_key)

    if evicted:
        scores_repo.client.table("user_skills") \
            .delete() \
            .eq("user_id", user_id) \
            .in_("skill_id", _resolve_skill_ids(scores_repo, evicted)) \
            .execute()
    return evicted


def _resolve_skill_ids(scores_repo: ScoresRepository, taxonomy_keys: list[str]) -> list[int]:
    if not taxonomy_keys:
        return []
    result = scores_repo.client.table("skills") \
        .select("id, taxonomy_key") \
        .in_("taxonomy_key", taxonomy_keys).execute()
    return [row["id"] for row in (result.data or [])]


# ── Async re-tag + recompute ──────────────────────────────────────────────────


async def run_async_retag(
    cv_repo: CVVersionsRepository,
    scores_repo: ScoresRepository,
    user_id: str,
    baseline_id: int,
    new_body_text: str,
) -> None:
    """Background task: parse_cv_text → record_cv_score → stamp recompute_finished_at.

    Runs after the sync save returns 201. Exceptions are logged and the stamp
    is still written so the frontend stops polling — better stale-but-final
    than infinite poll on a tagger blip.
    """
    try:
        parsed = await cv_parser.parse_cv_text(new_body_text)
        skills_detected = parsed.get("skills_detected") or []
        if skills_detected:
            scoring.record_cv_score(scores_repo, user_id, skills_detected)
        else:
            scoring.recompute_score(scores_repo, user_id)
    except Exception:
        logger.exception("Async re-tag failed for user=%s baseline=%s", user_id, baseline_id)
    finally:
        cv_repo.client.table("cv_versions") \
            .update({"recompute_finished_at": "now()"}) \
            .eq("id", baseline_id) \
            .execute()


# ── New-baseline composer ─────────────────────────────────────────────────────


def render_baseline_text(cv_structured: dict[str, Any]) -> str:
    """Render the mutated cv_structured into the body_text we persist on the
    new baseline_upload row. Reuses cv_compose.render_deterministic with no
    hidden_items overrides — the mutation already lives in cv_structured.
    """
    return cv_compose.render_deterministic(cv_structured, hidden_items=None, edited_items=None)
