"""cv_weave — "Tailor with Mentor": the whole-CV weave for one job (Lane C v2).

Grill locks 2026-07-16 (memory project_tailor_weave_mentor): draft-first. The
user taps Tailor with Mentor → a short option-driven interview over the JD's
unproven asks (cv_weave_interview) → ONE weave pass proposes each CV role's 2–4
strongest pointers rewritten against the JD — merging overlaps, speaking the
JD's language, dropping the weakest — grounded in the CV itself, the user's
banked stories, and their interview answers. The user accepts role-by-role
(L2); apply writes the job-tailored version, the living master stays untouched
(L3, CVJT1).

Money (L6): 50 Myro Coins per weave run, charged on DELIVERY by the router —
a provider/parse failure charges nothing; the cached proposal replays free.

HONESTY (ADR-0016 + the no-DELETION/no-substance laws): guards are structural,
not prompt-hope. Per role — every number from the lines a proposal claims must
survive (loses_metrics), no number may appear that isn't in the user's material
(gains_foreign_numbers), and named specifics must survive (loses_substance).
A role that fails its guard falls back to its ORIGINAL bullets, marked
unchanged — fail-soft per role, never a silently degraded line.

Writer floor (project_mentor_writer_floor): provider=None resolves
get_writer_provider() inside this module; no caller can lower the floor.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.services.cv_rewrite import gains_foreign_numbers, loses_metrics, loses_substance
from app.services.cv_weave_interview import StoryMaterial
from app.services.jd_coverage import CoverageItem
from app.services import myro_voice
from app.services.llm_provider import LLMProvider, LLMProviderError, get_writer_provider

logger = logging.getLogger(__name__)

MAX_BULLETS_PER_ROLE = 4
MAX_BULLET_CHARS = 320
_MAX_TOKENS = 2400
_MAX_JD_CHARS = 6000

CACHE_PROMPT_KEY = "cv_weave"


# ── source shape ───────────────────────────────────────────────────────────────

def experience_blocks(cv_structured: dict | None) -> list[dict[str, Any]]:
    """The CV's experience roles with indexed bullets — the weave's unit of work
    AND the per-role accept unit (L2)."""
    blocks: list[dict[str, Any]] = []
    for i, block in enumerate((cv_structured or {}).get("experience") or []):
        blocks.append({
            "index": i,
            "role": str(block.get("role") or ""),
            "company": str(block.get("company") or ""),
            "dates": str(block.get("dates") or ""),
            "bullets": [str(b or "").strip() for b in block.get("bullets") or [] if str(b or "").strip()],
        })
    return blocks


def source_fingerprint(cv_structured: dict | None) -> str:
    """Stable hash of the experience section a proposal was drafted from. Apply
    refuses on mismatch — a proposal must never land on a CV it wasn't written
    for (the master can change between weave and apply)."""
    basis = [
        {"role": b["role"], "company": b["company"], "bullets": b["bullets"]}
        for b in experience_blocks(cv_structured)
    ]
    raw = json.dumps(basis, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


# ── prompt ─────────────────────────────────────────────────────────────────────

_TASK = (
    "THIS SURFACE: tailoring their CV to ONE job. You get the CV's experience "
    "roles (bullets indexed per role), the job description, the job's parsed "
    "requirements, their own banked career stories, and their interview answers.\n"
    "Rework EACH role's bullets into its strongest 2-4 lines for THIS job:\n"
    "- merge bullets that describe the same achievement into one richer line\n"
    "- rewrite kept lines to speak the job's language — mirror its vocabulary "
    "honestly, never keyword-stuff\n"
    "- drop only the weakest, least relevant lines\n"
    "- work the stories and answers in where they genuinely belong (best-fit role)\n"
    "CARRY-THROUGH (unbreakable): every number and every named specific (clients, "
    "markets, products, technologies) from the lines you keep or merge MUST "
    "survive into your output.\n"
    "ACCOUNTING (unbreakable): within each role, every original bullet index must "
    "appear either in some new line's \"from\" list or in that role's \"dropped\" "
    "list. Nothing vanishes silently.\n"
    "Return ONLY minified JSON:\n"
    '{"summary": str|null, "skills_line": str|null, "roles": [{"role_index": int, '
    '"why": str, "bullets": [{"text": str, "from": [int], "story_ids": [str], '
    '"used_answer": bool}], "dropped": [int]}]}\n'
    "summary/skills_line: rewrite only when the job clearly calls for it, else "
    "null. \"why\" = one plain sentence on what this role's rework does for the "
    "candidate's chances. No prose outside the JSON."
)

_SYSTEM = myro_voice.drafting_for_reader(_TASK)


def _requirements_digest(items: list[CoverageItem]) -> str:
    lines = []
    for i in items:
        tag = {"covered": "PROVEN", "weak": "PARTIAL", "gap": "UNPROVEN"}.get(i.status, i.status)
        line = f"- [{tag}] {i.requirement}"
        if i.story_title and i.status != "gap":
            line += f" (their evidence: {i.story_title})"
        lines.append(line)
    return "\n".join(lines)


def _blocks_digest(blocks: list[dict[str, Any]]) -> str:
    parts = []
    for b in blocks:
        head = f"ROLE {b['index']}: {b['role']} · {b['company']}"
        if b["dates"]:
            head += f" ({b['dates']})"
        lines = [head] + [f"  [{i}] {t}" for i, t in enumerate(b["bullets"])]
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def _stories_digest(stories: list[StoryMaterial]) -> str:
    lines = []
    for s in stories:
        parts = [s.title]
        if s.pointer:
            parts.append(s.pointer)
        elif s.result:
            parts.append(f"result: {s.result}")
        if s.metric_values:
            parts.append("figures: " + ", ".join(s.metric_values[:4]))
        lines.append(f"- (id {s.id}) " + " — ".join(p for p in parts if p))
    return "\n".join(lines)


def _answers_digest(answers: list[dict[str, str]]) -> str:
    return "\n".join(
        f"- Asked about \"{a.get('requirement', '')}\" — they said: {a.get('text', '')}"
        for a in answers if (a.get("text") or "").strip()
    )


def _build_messages(
    job_title: str,
    company: str,
    jd_text: str,
    coverage_items: list[CoverageItem],
    blocks: list[dict[str, Any]],
    stories: list[StoryMaterial],
    answers: list[dict[str, str]],
) -> list[dict[str, str]]:
    parts = [
        f"Target job: {job_title or 'the role'} at {company or 'the company'}",
        f"Job description:\n{(jd_text or '').strip()[:_MAX_JD_CHARS]}",
        f"What this job requires (parsed):\n{_requirements_digest(coverage_items)}",
        f"The candidate's CV experience:\n{_blocks_digest(blocks)}",
    ]
    if stories:
        parts.append("The candidate's banked career stories (verified material):\n" + _stories_digest(stories))
    if answers:
        digest = _answers_digest(answers)
        if digest:
            parts.append("The candidate's interview answers (their own words):\n" + digest)
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": "\n\n".join(parts)},
    ]


# ── parse + guards ─────────────────────────────────────────────────────────────

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


def parse_weave_response(raw: str, blocks: list[dict[str, Any]]) -> dict | None:
    """Defensively validate the model's proposal against the actual CV shape.
    Role entries that break the contract (bad indices, empty text, unaccounted
    bullets) are discarded individually; None only when nothing usable remains."""
    obj = _json_object(raw)
    if not obj:
        return None
    by_index = {b["index"]: b for b in blocks}
    roles_out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for entry in obj.get("roles") or []:
        if not isinstance(entry, dict):
            continue
        ri = entry.get("role_index")
        if not isinstance(ri, int) or ri not in by_index or ri in seen:
            continue
        n_old = len(by_index[ri]["bullets"])
        bullets_in = entry.get("bullets")
        if not isinstance(bullets_in, list) or not bullets_in:
            continue
        bullets: list[dict[str, Any]] = []
        referenced: set[int] = set()
        ok = True
        for b in bullets_in[:MAX_BULLETS_PER_ROLE]:
            if not isinstance(b, dict):
                ok = False
                break
            text = str(b.get("text") or "").strip().strip('"').strip()
            if not text:
                ok = False
                break
            frm = [i for i in (b.get("from") or []) if isinstance(i, int) and 0 <= i < n_old]
            referenced.update(frm)
            bullets.append({
                "text": text[:MAX_BULLET_CHARS],
                "from": sorted(set(frm)),
                "story_ids": [str(s) for s in (b.get("story_ids") or []) if s],
                "used_answer": bool(b.get("used_answer")),
            })
        if not ok or not bullets:
            continue
        dropped = sorted({i for i in (entry.get("dropped") or []) if isinstance(i, int) and 0 <= i < n_old})
        if referenced | set(dropped) != set(range(n_old)):
            continue  # accounting violated — this role falls back to its original lines
        seen.add(ri)
        roles_out.append({
            "role_index": ri,
            "why": str(entry.get("why") or "").strip(),
            "bullets": bullets,
            "dropped": dropped,
        })
    summary = obj.get("summary")
    skills_line = obj.get("skills_line")
    if not roles_out and not summary and not skills_line:
        return None
    return {
        "summary": str(summary).strip() if isinstance(summary, str) and summary.strip() else None,
        "skills_line": str(skills_line).strip() if isinstance(skills_line, str) and skills_line.strip() else None,
        "roles": roles_out,
    }


def role_guard_ok(old_bullets: list[str], entry: dict[str, Any], allowed_text: str) -> bool:
    """The structural honesty floor, per role. Source = the old lines this entry
    claims (dropped lines excluded — dropping is allowed, mangling is not)."""
    referenced = sorted({i for b in entry["bullets"] for i in b["from"]})
    src = " ".join(old_bullets[i] for i in referenced)
    new = " ".join(b["text"] for b in entry["bullets"])
    if gains_foreign_numbers(src, new, allowed_text):
        return False
    if loses_metrics(src, new):
        return False
    return not loses_substance(src, new)


# ── proposal (the renderable, cacheable artifact) ─────────────────────────────

def build_proposal(
    cv_structured: dict | None,
    parsed: dict,
    stories: list[StoryMaterial],
    answers: list[dict[str, str]],
    coverage_items: list[CoverageItem],
) -> dict | None:
    """Every experience role, in CV order, changed or not — the per-role accept
    stepper renders straight from this. Guard-failing roles fall back to their
    original bullets (changed=False + guarded flag). None when not one role
    survives AND there's no summary/skills change — a worthless artifact must
    not be delivered (or charged for)."""
    blocks = experience_blocks(cv_structured)
    titles = {s.id: s.title for s in stories}
    allowed_text = " ".join(
        [s.pointer + " " + s.result + " " + " ".join(s.metric_values) for s in stories]
        + [a.get("text") or "" for a in answers]
    )
    by_index = {e["role_index"]: e for e in parsed.get("roles") or []}
    roles_out: list[dict[str, Any]] = []
    changed_count = 0
    for b in blocks:
        entry = by_index.get(b["index"])
        base = {
            "role_index": b["index"],
            "role": b["role"],
            "company": b["company"],
            "changed": False,
            "guarded": False,
            "why": "",
            "bullets": [{"text": t, "from_lines": [], "story_titles": [], "used_answer": False} for t in b["bullets"]],
            "dropped_lines": [],
        }
        if entry and b["bullets"]:
            if role_guard_ok(b["bullets"], entry, allowed_text):
                base["changed"] = True
                base["why"] = entry["why"]
                base["bullets"] = [
                    {
                        "text": nb["text"],
                        "from_lines": [b["bullets"][i] for i in nb["from"]],
                        "story_titles": [titles[sid] for sid in nb["story_ids"] if sid in titles],
                        "used_answer": nb["used_answer"],
                    }
                    for nb in entry["bullets"]
                ]
                base["dropped_lines"] = [b["bullets"][i] for i in entry["dropped"]]
                changed_count += 1
            else:
                base["guarded"] = True
                logger.info("metric cv_weave.role_guard_failed role_index=%d", b["index"])
        roles_out.append(base)
    if changed_count == 0 and not parsed.get("summary") and not parsed.get("skills_line"):
        return None
    return {
        "fingerprint": source_fingerprint(cv_structured),
        "summary": parsed.get("summary"),
        "skills_line": parsed.get("skills_line"),
        "roles": roles_out,
        "changed_roles": changed_count,
        "requirements_total": len(coverage_items),
        "asks_unproven": sum(1 for i in coverage_items if i.status != "covered"),
    }


# ── weave (LLM) ────────────────────────────────────────────────────────────────

async def weave(
    *,
    job_title: str,
    company: str,
    jd_text: str,
    coverage_items: list[CoverageItem],
    cv_structured: dict | None,
    stories: list[StoryMaterial],
    answers: list[dict[str, str]],
    provider: LLMProvider | None = None,
) -> dict | None:
    """One weave pass → the proposal dict, or None on provider/parse/guard-total
    failure (the router then charges nothing). `provider` is a test-only
    override — the writer floor is owned here."""
    blocks = experience_blocks(cv_structured)
    if not any(b["bullets"] for b in blocks):
        return None
    provider = provider or get_writer_provider()
    messages = _build_messages(job_title, company, jd_text, coverage_items, blocks, stories, answers)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_weave: all providers failed")
        return None
    parsed = parse_weave_response(raw or "", blocks)
    if parsed is None:
        logger.info("cv_weave: unparseable proposal")
        return None
    return build_proposal(cv_structured, parsed, stories, answers, coverage_items)


# ── apply (compose the accepted CV) ────────────────────────────────────────────

def compose_weave(
    cv_structured: dict,
    proposal: dict,
    accepted_roles: set[int],
    *,
    accept_summary: bool = True,
    accept_skills_line: bool = True,
) -> dict:
    """cv_structured for the tailored version: accepted+changed roles take their
    proposed bullets, everything else carries over verbatim. Pure."""
    next_cv = json.loads(json.dumps(cv_structured))
    by_index = {r["role_index"]: r for r in proposal.get("roles") or []}
    for i, block in enumerate(next_cv.get("experience") or []):
        entry = by_index.get(i)
        if entry and entry.get("changed") and i in accepted_roles:
            block["bullets"] = [b["text"] for b in entry["bullets"]]
    if accept_summary and proposal.get("summary"):
        next_cv["summary"] = proposal["summary"]
    if accept_skills_line and proposal.get("skills_line"):
        next_cv["skills_line"] = proposal["skills_line"]
    return next_cv
