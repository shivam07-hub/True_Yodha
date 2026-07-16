"""jd_coverage — Lane C tracer: "What this job wants" coverage panel.

For a job the user is tailoring against, parse the JD's REAL requirements with a
JUDGMENT-lane model, then match each against the user's career stories
(memory_recall) to classify:

  - covered : a story already evidences it  → one-tap pointer insert
  - weak    : a story is adjacent but thin  → grounded rewrite (cv_rewrite)
  - gap     : nothing evidences it          → mentor asks ONE question; the
              answer flows through the dump pipeline into a NEW story

Grounded in the Deloitte case study (2026-07-14): the old playground panel read
`job_skills` taxonomy → garbage for non-tech JDs ("Go (Programming Language)",
"Track (Rail Transport)" on a sales role). Requirements are parsed from the JD
PROSE; coverage runs against STORIES, never CV keyword overlap.

No-cheap-models law ([[feedback_no_cheap_models_judgment]]): requirement parsing
is a judgment call → `get_judgment_provider()`. Coverage banding is deterministic
cosine math (memory_recall embeddings), not a small model.

FAIL-SOFT: parse failure → empty requirement list (panel hides); a story-recall
failure downgrades that row to `gap` rather than taking the surface down.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.services import memory_recall
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.jd_coverage")

MAX_JD_CHARS = 16_000
MAX_REQUIREMENTS = 14
_PARSE_MAX_TOKENS = 1400

# Best-story cosine bands. Covered = a story clearly evidences the requirement;
# weak = adjacent but not proof; below → gap. Tuned conservatively so a wrong
# "covered" (a trust breach) is rare — the user always sees the matched story.
COVERED_MIN = 0.74
WEAK_MIN = 0.58

_PARSE_SYSTEM = (
    "You are a senior recruiter reading a job description. Extract the CONCRETE "
    "things this job actually requires of a candidate — the responsibilities, "
    "must-have experience, and evaluation criteria a hiring manager would screen "
    "on. Write each as ONE short plain-English requirement phrase (6-14 words), "
    "as the JOB states it, not as a skill taxonomy keyword.\n"
    "GOOD: 'Own quota and territory planning for enterprise accounts'.\n"
    "BAD: 'Sales', 'Go (Programming Language)', 'Communication' — single words / "
    "taxonomy tags are useless.\n"
    "Merge duplicates. Keep only real requirements — drop boilerplate (EEO "
    "statements, benefits, 'apply now'). Order most-important first.\n"
    f"Return ONLY compact JSON: {{\"requirements\": [str]}} with at most "
    f"{MAX_REQUIREMENTS} items. No prose outside the JSON."
)


@dataclass
class CoverageItem:
    requirement: str
    status: str  # "covered" | "weak" | "gap"
    story_id: str | None = None
    story_title: str = ""
    story_pointer: str = ""
    similarity: float = 0.0
    source: str = "story"  # "story" | "cv" — what evidenced it


@dataclass
class CoverageResult:
    requirements: list[CoverageItem] = field(default_factory=list)
    covered: int = 0
    weak: int = 0
    gap: int = 0


def _json_object(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith("json"):
            text = text[nl + 1:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_requirements_response(raw: str) -> list[str]:
    """Pure: defensively pull a clean, deduped requirement list from the LLM
    response. Empty on any malformed output."""
    obj = _json_object(raw)
    if not obj:
        return []
    items = obj.get("requirements")
    if not isinstance(items, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not isinstance(item, str):
            continue
        phrase = " ".join(item.split()).strip(" .-•").strip()
        key = phrase.lower()
        if len(phrase) < 4 or key in seen:
            continue
        seen.add(key)
        out.append(phrase[:160])
        if len(out) >= MAX_REQUIREMENTS:
            break
    return out


async def parse_requirements(jd_text: str, provider: LLMProvider) -> list[str]:
    """LLM-parse a JD's real requirements. [] on empty JD or provider failure."""
    text = (jd_text or "").strip()
    if len(text) < 40:
        return []
    messages = [
        {"role": "system", "content": _PARSE_SYSTEM},
        {"role": "user", "content": f"Job description:\n\n{text[:MAX_JD_CHARS]}"},
    ]
    try:
        raw = await provider.complete(messages, max_tokens=_PARSE_MAX_TOKENS)
    except LLMProviderError as exc:
        logger.info("jd_coverage: requirement parse failed (%s)", exc.__class__.__name__)
        return []
    return parse_requirements_response(raw)


def _classify(similarity: float) -> str:
    if similarity >= COVERED_MIN:
        return "covered"
    if similarity >= WEAK_MIN:
        return "weak"
    return "gap"


async def _cover_one(user_id: str, requirement: str) -> CoverageItem:
    hits = await memory_recall.recall_stories(user_id, requirement, k=1)
    if not hits:
        return CoverageItem(requirement=requirement, status="gap")
    best = hits[0]
    status = _classify(best.similarity)
    if status == "gap":
        return CoverageItem(requirement=requirement, status="gap")
    return CoverageItem(
        requirement=requirement,
        status=status,
        story_id=best.id,
        story_title=best.title,
        story_pointer=best.pointer,
        similarity=round(best.similarity, 3),
    )


def bullets_from_cv(cv_structured: dict | None) -> list[str]:
    """Pure: every experience/project bullet on the CV — the evidence the user is
    literally showing recruiters. Coverage that ignores these says "Missing" while
    the line sits on screen (the Oracle/mit20 trust breach, 2026-07-16)."""
    out: list[str] = []
    for block in (cv_structured or {}).get("experience") or []:
        for b in block.get("bullets") or []:
            text = str(b or "").strip()
            if text:
                out.append(text)
    for block in (cv_structured or {}).get("projects") or []:
        for b in block.get("bullets") or []:
            text = str(b or "").strip()
            if text:
                out.append(text)
    return out


async def _apply_cv_bullet_pass(items: list[CoverageItem], cv_bullets: list[str]) -> None:
    """Second evidence leg: match each requirement against the CV's own bullets and
    keep whichever evidence (story vs CV line) is stronger. FAIL-SOFT — any
    embedding failure leaves the story-only verdicts untouched."""
    from app.services import embeddings
    from app.services.career_reservoir import cosine

    bullets = [b for b in cv_bullets if b.strip()][:80]
    if not items or not bullets:
        return
    try:
        qvecs = await embeddings.embed_texts([i.requirement for i in items])
        bvecs = await embeddings.embed_texts(bullets)
    except Exception as exc:  # noqa: BLE001 — the CV leg is an upgrade, never an outage
        logger.info("jd_coverage: cv-bullet embed failed (%s)", exc.__class__.__name__)
        return
    for i, item in enumerate(items):
        best_sim, best_bullet = 0.0, ""
        for bullet, bvec in zip(bullets, bvecs):
            sim = cosine(qvecs[i], bvec)
            if sim > best_sim:
                best_sim, best_bullet = sim, bullet
        if best_sim >= WEAK_MIN and best_sim > item.similarity:
            items[i] = CoverageItem(
                requirement=item.requirement,
                status=_classify(best_sim),
                story_id=None,
                story_title="On your CV",
                story_pointer=best_bullet,
                similarity=round(best_sim, 3),
                source="cv",
            )


async def assess(
    user_id: str,
    jd_text: str,
    provider: LLMProvider,
    cv_bullets: list[str] | None = None,
) -> CoverageResult:
    """Parse the JD then classify every requirement against the user's stories —
    and, when the caller passes the CV's bullets, against what the CV already
    proves (stories ∪ CV pointers; the stronger evidence wins)."""
    requirements = await parse_requirements(jd_text, provider)
    items = [await _cover_one(user_id, req) for req in requirements]
    if cv_bullets:
        await _apply_cv_bullet_pass(items, cv_bullets)
    return CoverageResult(
        requirements=items,
        covered=sum(1 for i in items if i.status == "covered"),
        weak=sum(1 for i in items if i.status == "weak"),
        gap=sum(1 for i in items if i.status == "gap"),
    )


# ── cache (Preparations room, 2026-07-15) ─────────────────────────────────────
# Coverage is cached per (user, job) in job_deepenings under this key so the prep
# room and the playground read ONE stable panel (stable requirements = trust; a
# re-parse can shuffle phrasing between visits). Coverage only changes when the
# user banks a new story, so consumers refresh explicitly, not per visit.

CACHE_PROMPT_KEY = "jd_coverage"


def result_to_payload(result: CoverageResult) -> str:
    """Serialize for the job_deepenings text column, stamped with computed_at."""
    return json.dumps({
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "covered": result.covered,
        "weak": result.weak,
        "gap": result.gap,
        "requirements": [
            {
                "requirement": i.requirement,
                "status": i.status,
                "story_id": i.story_id,
                "story_title": i.story_title,
                "story_pointer": i.story_pointer,
                "similarity": i.similarity,
                "source": i.source,
            }
            for i in result.requirements
        ],
    })


def payload_to_result(raw: str | None) -> tuple[CoverageResult, str] | None:
    """(result, computed_at) from a cached payload; None on any malformed data
    (caller then recomputes — a corrupt cache never takes the surface down)."""
    if not raw:
        return None
    try:
        obj = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("requirements"), list):
        return None
    items: list[CoverageItem] = []
    for entry in obj["requirements"]:
        if not isinstance(entry, dict) or not entry.get("requirement"):
            continue
        status = entry.get("status")
        if status not in ("covered", "weak", "gap"):
            continue
        items.append(CoverageItem(
            requirement=str(entry["requirement"]),
            status=status,
            story_id=entry.get("story_id") or None,
            story_title=str(entry.get("story_title") or ""),
            story_pointer=str(entry.get("story_pointer") or ""),
            similarity=float(entry.get("similarity") or 0.0),
            source=str(entry.get("source") or "story"),
        ))
    if not items:
        return None
    result = CoverageResult(
        requirements=items,
        covered=sum(1 for i in items if i.status == "covered"),
        weak=sum(1 for i in items if i.status == "weak"),
        gap=sum(1 for i in items if i.status == "gap"),
    )
    return result, str(obj.get("computed_at") or "")
