"""jd_coverage — "What this job wants" coverage panel.

For a job the user is tailoring against, parse the JD's REAL requirements with a
JUDGMENT-lane model, then rule each against the person's own evidence — career
stories, CV bullets, the skills line, the summary:

  - covered : a told story or a line on the CV proves it
  - weak    : only an untold story proves it (a CV line is a start, not an
              answer — Shivam, 2026-09-13) → the interview asks for the telling
  - gap     : nothing proves it → mentor asks ONE question; the answer flows
              through the dump pipeline into a NEW story

Who decides "proves" (ARCHITECTURE_JD_REFLECTION.md §0, 2026-10-19): named
tools are a string fact (`jd_reflection.names_a_tool`); everything else is ONE
batched judgment-lane call per (person, job) panel over each requirement's
three best lines by cosine. Cosine orders; it never decides. The verdicts are
cached here and every other reader takes them from this panel.

FAIL-SOFT: parse failure → empty requirement list (panel hides); a judge failure
caches nothing and shows nothing (a stale panel keeps its last verdicts).
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.services import jd_reflection, memory_recall
from app.services.deepening_keys import DeepeningKey
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.jd_coverage")

MAX_JD_CHARS = 16_000
MAX_REQUIREMENTS = 14
_PARSE_MAX_TOKENS = 1400

# Stories recalled per requirement before the cut to the judge's three.
_RECALL_K = 8
# CV lines embedded per panel. A CV past this is long enough that its 80th
# line is not the one that proves anything.
_MAX_CV_LINES = 80

#: Stamped into every panel the judge ruled. A panel without it was ruled by an
#: older rule and re-judges the next time its person opens it (forward pass).
RULE = "judge-1"
RULE_KEY = "rule"

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
    #: Every CV line the judge (or the named-tools rule) ruled proving. The
    #: weave reads it to keep the only line that proves a requirement.
    proof_lines: list[str] = field(default_factory=list)


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


def evidence_lines(cv_structured: dict | None) -> list[str]:
    """Pure: the CV's own evidence — bullets, then the skills line, then the
    summary. The spec names all three (ARCHITECTURE_JD_REFLECTION.md §3)."""
    lines = bullets_from_cv(cv_structured)
    for key in ("skills_line", "summary"):
        text = str((cv_structured or {}).get(key) or "").strip()
        if text:
            lines.append(text)
    return lines


@dataclass
class _Line:
    """One candidate line for one requirement, before the judge rules."""

    id: str
    text: str
    kind: str  # "story" | "cv"
    similarity: float
    story_id: str | None = None
    story_title: str = ""
    told: bool = False


def _story_text(hit: Any) -> str:
    return " ".join(part for part in (hit.pointer, hit.result, hit.title) if part)


async def _embed(texts: list[str]) -> list[list[float]] | None:
    from app.services import embeddings

    if not texts:
        return []
    try:
        return await embeddings.embed_texts(texts)
    except Exception as exc:  # noqa: BLE001 — the judge sees fewer lines, never invented ones
        logger.warning("jd_coverage: embed failed (%s)", exc.__class__.__name__)
        return None


async def _candidates(
    user_id: str, requirements: list[str], cv_lines: list[str],
) -> list[list[_Line]]:
    """Each requirement's best lines by cosine — stories and CV lines together,
    cut to the judge's three. Cosine orders; it decides nothing.

    One embedding call for the requirements, one for the CV, one read of the
    story bank — not one of each per requirement.
    """
    from app.services.career_reservoir import cosine

    qvecs = await _embed(requirements)
    lvecs = await _embed(cv_lines) if qvecs else None
    story_hits = await memory_recall.recall_stories_many(
        user_id, requirements, k=_RECALL_K, qvecs=qvecs or None,
    )
    out: list[list[_Line]] = []
    for r_index, requirement in enumerate(requirements):
        pool: list[_Line] = []
        for hit in story_hits[r_index] if r_index < len(story_hits) else []:
            text = _story_text(hit)
            if text:
                pool.append(_Line(
                    id="", text=text, kind="story", similarity=hit.similarity,
                    story_id=hit.id, story_title=hit.title, told=hit.told,
                ))
        if qvecs and lvecs:
            for text, vec in zip(cv_lines, lvecs):
                pool.append(_Line(id="", text=text, kind="cv", similarity=cosine(qvecs[r_index], vec)))
        pool.sort(key=lambda line: line.similarity, reverse=True)
        top = pool[:jd_reflection.CANDIDATES_PER_REQUIREMENT]
        for c_index, line in enumerate(top):
            line.id = f"{r_index + 1}{'abc'[c_index]}"
        out.append(top)
    return out


async def _judge(
    batch: list[tuple[str, list[_Line]]], provider: LLMProvider,
) -> list[set[str]] | None:
    """ONE judgment-lane call for the whole panel. None when it fails."""
    if not batch:
        return []
    shown = [
        (requirement, [jd_reflection.Candidate(id=line.id, text=line.text) for line in lines])
        for requirement, lines in batch
    ]
    try:
        raw = await provider.complete(
            jd_reflection.judge_messages(shown),
            max_tokens=jd_reflection.JUDGE_MAX_TOKENS,
            temperature=0,
        )
    except LLMProviderError as exc:
        logger.warning("jd_coverage: judge failed (%s)", exc.__class__.__name__)
        return None
    verdicts = jd_reflection.parse_verdicts(raw, shown)
    if verdicts is None:
        logger.warning("jd_coverage: judge answer unreadable")
    return verdicts


def _rule(requirement: str, proving: list[_Line]) -> CoverageItem:
    """A told story closes the question; a line on the CV is proof the recruiter
    reads; an untold story is evidence that still needs telling."""
    proof_lines = [line.text for line in proving if line.kind == "cv"]
    told = next((line for line in proving if line.kind == "story" and line.told), None)
    cv = next((line for line in proving if line.kind == "cv"), None)
    untold = next((line for line in proving if line.kind == "story"), None)
    if told is not None:
        return CoverageItem(
            requirement=requirement, status="covered", story_id=told.story_id,
            story_title=told.story_title, story_pointer=told.text,
            similarity=round(told.similarity, 3), proof_lines=proof_lines,
        )
    if cv is not None:
        return CoverageItem(
            requirement=requirement, status="covered", story_title="On your CV",
            story_pointer=cv.text, similarity=round(cv.similarity, 3),
            source="cv", proof_lines=proof_lines,
        )
    if untold is not None:
        return CoverageItem(
            requirement=requirement, status="weak", story_id=untold.story_id,
            story_title=untold.story_title, story_pointer=untold.text,
            similarity=round(untold.similarity, 3),
        )
    return CoverageItem(requirement=requirement, status="gap")


def _tool_proof(requirement: str, candidates: list[_Line], cv_lines: list[str]) -> list[_Line]:
    """Named tools are a string fact: every CV line that names one, plus any
    candidate story that does. Read across the whole CV, not just the top three."""
    proving = [
        _Line(id="", text=text, kind="cv", similarity=0.0)
        for text in cv_lines if jd_reflection.names_a_tool(requirement, text)
    ]
    proving += [
        line for line in candidates
        if line.kind == "story" and jd_reflection.names_a_tool(requirement, line.text)
    ]
    return proving


async def assess(
    user_id: str,
    jd_text: str,
    provider: LLMProvider,
    cv_lines: list[str] | None = None,
) -> CoverageResult | None:
    """Parse the JD, then rule every requirement against the person's evidence.
    An empty result when the parse finds nothing; None when the judge fails."""
    requirements = await parse_requirements(jd_text, provider)
    return await rematch(user_id, requirements, provider, cv_lines=cv_lines)


async def rematch(
    user_id: str,
    requirements: list[str],
    provider: LLMProvider,
    *,
    cv_lines: list[str] | None = None,
) -> CoverageResult | None:
    """Rule KNOWN requirements against the person's evidence as it is now.

    `assess` minus the parse. Parsing is a property of the JD; the verdicts are
    a property of the person's evidence, so when the story bank moves only this
    half is redone, and the requirement wording stays identical between visits.

    Named-tool requirements are settled by string; the rest go to the judge in
    ONE call. None when that call fails — the caller must not cache it.
    """
    lines = [line for line in (cv_lines or []) if line.strip()][:_MAX_CV_LINES]
    candidates = await _candidates(user_id, requirements, lines)
    proving: dict[int, list[_Line]] = {}
    to_judge: list[int] = []
    for index, requirement in enumerate(requirements):
        if jd_reflection.named_tools(requirement):
            proving[index] = _tool_proof(requirement, candidates[index], lines)
        else:
            to_judge.append(index)
    verdicts = await _judge([(requirements[i], candidates[i]) for i in to_judge], provider)
    if verdicts is None:
        return None
    for index, ids in zip(to_judge, verdicts):
        proving[index] = [line for line in candidates[index] if line.id in ids]
    items = [_rule(requirement, proving.get(i, [])) for i, requirement in enumerate(requirements)]
    return CoverageResult(
        requirements=items,
        covered=sum(1 for i in items if i.status == "covered"),
        weak=sum(1 for i in items if i.status == "weak"),
        gap=sum(1 for i in items if i.status == "gap"),
    )


async def answer_proves(requirement: str, answer: str, provider: LLMProvider) -> bool:
    """Does a banked answer, in the person's own words, prove its requirement?

    The same two rules as the panel: a named tool by string, everything else by
    the judge — one requirement, one line. A failed judge proves nothing.
    """
    text = " ".join((answer or "").split())
    if not text:
        return False
    if jd_reflection.named_tools(requirement):
        return jd_reflection.names_a_tool(requirement, text)
    line = _Line(id="1a", text=text, kind="story", similarity=0.0)
    verdicts = await _judge([(requirement, [line])], provider)
    return bool(verdicts and "1a" in verdicts[0])


async def settle_answer(
    jobs_repo: Any,
    user_id: str,
    job_id: str,
    raw: str | None,
    requirement: str,
    answer: str,
    provider: LLMProvider,
) -> None:
    """After a gap answer is banked: flip its row if the answer proves it, else
    mark the room stale so it is re-judged once the answer is a story. Either
    way the room never keeps saying "gap" about an answer it has not ruled on."""
    if not raw:
        return
    proven = await answer_proves(requirement, answer, provider)
    patched = patch_requirement_answered(raw, requirement, answer, proven=proven)
    update = patched or mark_stale(raw)
    if update:
        jobs_repo.upsert_deepening(user_id, job_id, CACHE_PROMPT_KEY, update)


# ── cache (Preparations room, 2026-07-15) ─────────────────────────────────────
# Coverage is cached per (user, job) in job_deepenings under this key so the prep
# room and the playground read ONE stable panel (stable requirements = trust; a
# re-parse can shuffle phrasing between visits). Coverage only changes when the
# user banks a new story, so consumers refresh explicitly, not per visit.

#: This store's key lives in the registry — see deepening_keys for why a
#: literal at a call site is how a cache goes silently missing.
CACHE_PROMPT_KEY = DeepeningKey.JD_COVERAGE


STALE_KEY = "stale"


def is_stale(raw: str | None) -> bool:
    """Has the story bank moved since this row was computed?

    The flag rides INSIDE the cached payload, set when the user banks a story,
    so the read path pays nothing to know it. The alternative — reading a
    "bank last changed" marker on every panel load — taxes the frequent action
    (opening a room) to serve the rare one (answering a gap).

    A panel ruled before the judge (no `rule` stamp) is stale too: it keeps its
    requirements and is re-judged the next time its person opens it.
    """
    if not raw:
        return False
    try:
        obj = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return False
    if not isinstance(obj, dict) or not obj.get("requirements"):
        return False
    return obj.get(STALE_KEY) is True or obj.get(RULE_KEY) != RULE


def mark_stale(raw: str | None) -> str | None:
    """Flag a cached coverage row for re-matching. None when there is nothing
    to flag, so the caller can skip the write."""
    if not raw:
        return None
    try:
        obj = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict) or not obj.get("requirements"):
        return None
    if obj.get(STALE_KEY) is True:
        return None
    obj[STALE_KEY] = True
    return json.dumps(obj)


def result_to_payload(result: CoverageResult) -> str:
    """Serialize for the job_deepenings text column, stamped with computed_at."""
    return json.dumps({
        "computed_at": datetime.now(timezone.utc).isoformat(),
        RULE_KEY: RULE,
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
                "proof_lines": i.proof_lines,
            }
            for i in result.requirements
        ],
    })


def story_for_requirement(raw: str | None, requirement: str) -> str | None:
    """The story the cached coverage row matched to this requirement, if any.

    This is how a banked answer knows which story it is IMPROVING rather than
    minting a sibling of. Resolved server-side from our own cache on purpose: a
    client-supplied story id would let a caller graft an answer onto any story.
    """
    hit = payload_to_result(raw)
    if hit is None:
        return None
    wanted = " ".join((requirement or "").split()).casefold()
    for item in hit[0].requirements:
        if " ".join(item.requirement.split()).casefold() == wanted:
            return item.story_id or None
    return None


def patch_requirement_answered(
    raw: str | None, requirement: str, answer: str, *, proven: bool,
) -> str | None:
    """Flip ONE cached requirement to covered after the person banked an answer
    the judge says proves it (`answer_proves`). Without this the frozen cache
    keeps the ask at gap and every later weave interview RE-ASKS an answered
    question. None when the answer does not prove it, or the cache is absent or
    malformed, or the requirement isn't in it — the caller then marks the room
    stale so it is re-judged once the answer is a story."""
    if not proven:
        return None
    hit = payload_to_result(raw)
    if hit is None:
        return None
    result, _ = hit
    want = " ".join(requirement.split()).strip().lower()
    patched = False
    for i, item in enumerate(result.requirements):
        if item.requirement.strip().lower() != want or item.status == "covered":
            continue
        result.requirements[i] = CoverageItem(
            requirement=item.requirement,
            status="covered",
            story_id=None,
            story_title="Your answer",
            story_pointer=" ".join(answer.split())[:160],
            similarity=item.similarity,
            source="story",
        )
        patched = True
        break
    if not patched:
        return None
    result.covered = sum(1 for i in result.requirements if i.status == "covered")
    result.weak = sum(1 for i in result.requirements if i.status == "weak")
    result.gap = sum(1 for i in result.requirements if i.status == "gap")
    payload = result_to_payload(result)
    # The other rows keep whatever rule ruled them; a patch must not stamp an
    # old panel as judged.
    return (mark_stale(payload) or payload) if is_stale(raw) else payload


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
            proof_lines=[str(t) for t in entry.get("proof_lines") or [] if str(t).strip()],
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


_assess_locks: dict[tuple[str, str], asyncio.Lock] = {}


def _assess_lock(user_id: str, job_id: str) -> asyncio.Lock:
    key = (user_id, job_id)
    lock = _assess_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _assess_locks[key] = lock
    return lock


async def assess_for_job(
    user_id: str,
    job_id: str,
    jd_text: str,
    jobs_repo: Any,
    cv_structured: dict,
    provider: LLMProvider,
    *,
    refresh: bool = False,
) -> tuple[CoverageResult, bool, str]:
    """Cache-first coverage, one in-flight assess per (user, job).

    Playground POST /cv/jd-coverage and weave interview share this lock so a
    cache miss cannot double-spend the judgment lane.

    A row flagged `stale` closes the hole this cache has always had. Coverage is
    a projection of the story bank onto one JD, so answering a gap in ONE room
    silently staled every other room's — and every other room went on saying
    "gap" about a requirement the user had already answered. A stale row reuses
    its requirements (same JD, same words, no parse spend) and redoes only the
    ruling; writing the result back clears the flag.

    A failed judge writes nothing: a stale row keeps its last verdicts, and a
    fresh panel comes back empty (the surface hides it, as for a failed parse).
    """
    lines = evidence_lines(cv_structured)
    async with _assess_lock(user_id, job_id):
        if not refresh:
            raw = jobs_repo.get_deepening(user_id, job_id, CACHE_PROMPT_KEY)
            hit = payload_to_result(raw)
            if hit is not None:
                if not is_stale(raw):
                    return hit[0], True, hit[1]
                result = await rematch(
                    user_id,
                    [item.requirement for item in hit[0].requirements],
                    provider,
                    cv_lines=lines,
                )
                if result is None:
                    return hit[0], True, hit[1]
                if result.requirements:
                    jobs_repo.upsert_deepening(
                        user_id, job_id, CACHE_PROMPT_KEY, result_to_payload(result),
                    )
                return result, False, ""
        result = await assess(user_id, jd_text, provider, cv_lines=lines)
        if result is None:
            return CoverageResult(), False, ""
        if result.requirements:
            jobs_repo.upsert_deepening(
                user_id, job_id, CACHE_PROMPT_KEY, result_to_payload(result),
            )
        return result, False, ""
