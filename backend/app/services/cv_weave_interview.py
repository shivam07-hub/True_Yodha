"""cv_weave_interview — the option-driven interview before a weave (Lane C v2).

Grill lock L7 (2026-07-16, memory project_tailor_weave_mentor): when the user
taps "Tailor with Mentor", Mentor asks ONLY the JD asks the coverage panel could
not prove — and each question arrives with candidate answers mined from what
Myro already holds (the user's own stories and the CV's own lines), free-text as
the fallback. The intimacy moment: the user picks "yes, that Capgemini work"
instead of retyping their own history.

Mining is deterministic (embeddings + cosine — no LLM): options are grounded by
construction because every candidate IS a stored story or an on-CV line.

L4: a thin free-text answer gets exactly ONE pointed, skippable follow-up before
banking — task/action/result-"Unknown" stories embed weakly and poison future
coverage (prod-verified 2026-07-16).

FAIL-SOFT throughout: any embedding failure degrades to free-text-only questions;
the interview never blocks the weave.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.services import embeddings
from app.services.career_reservoir import cosine
from app.services.jd_coverage import CoverageItem

logger = logging.getLogger(__name__)

OPTION_MIN = 0.40       # looser than coverage's WEAK_MIN — options are suggestions the user confirms
MAX_OPTIONS = 3
MATERIAL_MIN = 0.35     # story material fed to the weave prompt
MAX_MATERIAL = 12


@dataclass
class InterviewOption:
    kind: str                    # "story" | "cv"
    label: str                   # the story title / CV line itself
    detail: str = ""             # canonical pointer / host-role label
    story_id: str | None = None


@dataclass
class InterviewQuestion:
    requirement: str
    status: str                  # "weak" | "gap"
    options: list[InterviewOption] = field(default_factory=list)


@dataclass
class StoryMaterial:
    id: str
    title: str
    pointer: str
    result: str
    metric_values: list[str]


def _vec(raw: Any) -> list[float] | None:
    """PostgREST returns pgvector columns as a '[0.1,0.2,...]' string."""
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str) and raw.startswith("["):
        try:
            return [float(x) for x in json.loads(raw)]
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def cv_bullet_rows(cv_structured: dict | None) -> list[tuple[str, str]]:
    """(bullet, host-role label) for every experience bullet on the CV."""
    rows: list[tuple[str, str]] = []
    for block in (cv_structured or {}).get("experience") or []:
        label = " · ".join(p for p in (block.get("role"), block.get("company")) if p)
        for b in block.get("bullets") or []:
            text = str(b or "").strip()
            if text:
                rows.append((text, label))
    return rows


def _canonical_pointers(repo: Any, user_id: str, story_ids: list[str]) -> dict[str, str]:
    if not story_ids:
        return {}
    out: dict[str, str] = {}
    for p in repo.story_pointers(user_id, story_ids):
        sid = str(p.get("story_id"))
        if p.get("is_canonical") and sid not in out:
            out[sid] = p.get("text") or ""
    return out


async def build_interview(
    user_id: str,
    coverage_items: list[CoverageItem],
    cv_structured: dict | None,
) -> list[InterviewQuestion]:
    """One question per unproven ask, each with up to MAX_OPTIONS mined candidates.
    Degrades to option-less questions on any embedding/recall failure."""
    unproven = [i for i in coverage_items if i.status != "covered"]
    questions = [InterviewQuestion(requirement=i.requirement, status=i.status) for i in unproven]
    if not questions:
        return []

    # A weak ask already carries the classifier's matched story — it leads.
    for q, item in zip(questions, unproven):
        if item.status == "weak" and item.story_id:
            q.options.append(InterviewOption(
                kind="story", label=item.story_title or "Your story",
                detail=item.story_pointer, story_id=item.story_id,
            ))

    try:
        qvecs = await embeddings.embed_texts([q.requirement for q in questions])
    except Exception as exc:  # noqa: BLE001 — free-text-only interview still works
        logger.info("cv_weave_interview: requirement embed failed (%s)", exc.__class__.__name__)
        return questions

    from app.database import get_supabase_admin
    from app.repositories.career_reservoir import CareerReservoirRepository

    try:
        repo = CareerReservoirRepository(get_supabase_admin())
        story_vecs = [
            (str(r["id"]), _vec(r.get("embedding")))
            for r in repo.story_embeddings(user_id)
        ]
        stories = {str(s["id"]): s for s in repo.list_stories(user_id)}
    except Exception as exc:  # noqa: BLE001
        logger.info("cv_weave_interview: story load failed (%s)", exc.__class__.__name__)
        story_vecs, stories, repo = [], {}, None

    bullet_rows = cv_bullet_rows(cv_structured)[:80]
    bvecs: list[list[float]] = []
    if bullet_rows:
        try:
            bvecs = await embeddings.embed_texts([b for b, _ in bullet_rows])
        except Exception as exc:  # noqa: BLE001
            logger.info("cv_weave_interview: bullet embed failed (%s)", exc.__class__.__name__)
            bvecs = []

    wanted_pointers: set[str] = set()
    for qi, q in enumerate(questions):
        seen_ids = {o.story_id for o in q.options if o.story_id}
        ranked = sorted(
            ((sid, cosine(qvecs[qi], vec)) for sid, vec in story_vecs if vec),
            key=lambda kv: kv[1], reverse=True,
        )
        for sid, sim in ranked[:2]:
            if sim < OPTION_MIN or sid in seen_ids or sid not in stories:
                continue
            s = stories[sid]
            q.options.append(InterviewOption(
                kind="story", label=s.get("title") or "Your story",
                detail=(s.get("narrative") or {}).get("result") or "",
                story_id=sid,
            ))
            wanted_pointers.add(sid)
        if bvecs:
            best_sim, best_idx = 0.0, -1
            for bi, bvec in enumerate(bvecs):
                sim = cosine(qvecs[qi], bvec)
                if sim > best_sim:
                    best_sim, best_idx = sim, bi
            if best_sim >= OPTION_MIN and best_idx >= 0:
                bullet, label = bullet_rows[best_idx]
                q.options.append(InterviewOption(kind="cv", label=bullet, detail=label))
        q.options = q.options[:MAX_OPTIONS]

    # Upgrade story options' detail to their canonical CV pointer where one exists.
    if repo is not None and wanted_pointers:
        try:
            pointers = _canonical_pointers(repo, user_id, list(wanted_pointers))
            for q in questions:
                for o in q.options:
                    if o.story_id and pointers.get(o.story_id):
                        o.detail = pointers[o.story_id]
        except Exception as exc:  # noqa: BLE001
            logger.info("cv_weave_interview: pointer join failed (%s)", exc.__class__.__name__)

    return questions


# ── the one follow-up (L4) ─────────────────────────────────────────────────────

_FOLLOW_UP = "What came of it — a number, a size, or a client win you can name?"


def follow_up_for(answer: str) -> str | None:
    """ONE pointed, skippable push for substance on a thin answer. Deterministic:
    an answer with any figure, or with real length, passes straight through."""
    text = (answer or "").strip()
    if re.search(r"\d", text):
        return None
    if len(text.split()) >= 25:
        return None
    return _FOLLOW_UP


# ── story material for the weave prompt ───────────────────────────────────────

async def gather_story_material(
    user_id: str,
    requirements: list[str],
    cap: int = MAX_MATERIAL,
) -> list[StoryMaterial]:
    """The user's stories nearest to ANY of the job's requirements — the truthful
    raw material the weave may draw from. [] on any failure (the weave then
    grounds on the CV + answers alone)."""
    reqs = [r for r in requirements if r.strip()]
    if not reqs:
        return []
    try:
        qvecs = await embeddings.embed_texts(reqs)
        from app.database import get_supabase_admin
        from app.repositories.career_reservoir import CareerReservoirRepository

        repo = CareerReservoirRepository(get_supabase_admin())
        story_vecs = [(str(r["id"]), _vec(r.get("embedding"))) for r in repo.story_embeddings(user_id)]
        stories = {str(s["id"]): s for s in repo.list_stories(user_id)}
        scored: dict[str, float] = {}
        for sid, vec in story_vecs:
            if not vec:
                continue
            best = max((cosine(q, vec) for q in qvecs), default=0.0)
            if best >= MATERIAL_MIN:
                scored[sid] = best
        top = sorted(scored.items(), key=lambda kv: kv[1], reverse=True)[:cap]
        pointers = _canonical_pointers(repo, user_id, [sid for sid, _ in top])
        out: list[StoryMaterial] = []
        for sid, _sim in top:
            s = stories.get(sid)
            if not s:
                continue
            narrative = s.get("narrative") or {}
            out.append(StoryMaterial(
                id=sid,
                title=s.get("title") or "",
                pointer=pointers.get(sid, ""),
                result=narrative.get("result") or "",
                metric_values=[
                    str(m.get("value") or "").strip()
                    for m in (s.get("metrics") or []) if isinstance(m, dict) and m.get("value")
                ],
            ))
        return out
    except Exception as exc:  # noqa: BLE001 — material is garnish, never an outage
        logger.info("cv_weave_interview: material gather failed (%s)", exc.__class__.__name__)
        return []
