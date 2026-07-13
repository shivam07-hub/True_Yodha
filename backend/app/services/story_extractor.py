"""story_extractor — turn a career dump into roles + STAR stories.

The extraction half of the Career Story Reservoir: one inflow entry (an old CV,
a pointers doc, a LinkedIn export, free text) → the roles it evidences and the
STORIES underneath (situation/task/action/result narrative, verbatim metrics,
skills proven, plus ONE canonical CV pointer per story). Stories are what make
Myro understand the user's actual work — pointers project from them per job,
and interview prep reads them directly.

Grounding: the pointer phrasing follows the authored CV playbook (Mentor shelf,
same retriever as cv_rewrite — fail-soft to the static XYZ rule).

No-fabrication law (ADR-0016): only facts present in the dump text — metrics are
copied verbatim, never invented; a story with no stated number simply has no
metrics. Pure helpers are LLM/DB-free and unit-tested; the async shell takes an
injected provider.
"""
from __future__ import annotations

import csv
import json
import logging
import re
from typing import Any

from app.services import mentor_retriever
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.story_extractor")

MAX_INPUT_CHARS = 24_000   # one CV / pointers doc / LinkedIn render fits well inside
MAX_STORIES = 24           # per extraction call
MAX_ROLES = 16
MAX_TOKENS = 8000
_RETRIEVE_K = 3

ROLE_KINDS = {"work", "education", "leadership", "volunteer", "other"}
STORY_KINDS = {"project", "achievement", "accolade", "education", "research", "other"}

# Invariant guardrails — structural + the no-fabrication law.
_GUARDRAILS = (
    "You are a top-tier career coach and CV editor. From the candidate's raw career "
    "material (an old CV, a pointers document, a LinkedIn export, or free writing) "
    "you build their career inventory: the ROLES they held and the STORIES inside "
    "each role — the real projects and achievements, fleshed out so they can be "
    "reused for any future CV or interview.\n"
    "HONESTY (unbreakable): use ONLY facts stated in the material. NEVER invent "
    "numbers, employers, titles, dates, scope, or outcomes. Copy every metric "
    "VERBATIM — the exact token as written, keeping currency symbols and "
    "suffixes: '€500K+' stays '€500K+', '~200' stays '~200', '₹1 Crore+' stays "
    "'₹1 Crore+'. NEVER normalize to a plain number like 500000. A story with "
    "no stated number has an empty metrics list.\n"
    "STORIES: extract as many DISTINCT stories as the material supports — each a "
    "real project/achievement, not a duplicate phrasing of another. Flesh out the "
    "narrative as situation / task / action / result, each 1-2 sentences built "
    "strictly from stated facts (leave a field empty when the material doesn't "
    "say). The RESULT field is the most important — whenever the material states "
    "any outcome, impact, or metric, it MUST appear in result. Keep every "
    "concrete specific: client names, scale, technologies, stakeholders.\n"
    "ROLE LINKING: role_index MUST be the exact index into your roles array of "
    "the role where the story happened, and role_company MUST repeat that role's "
    "company verbatim — re-check each story against the role list before "
    "answering; a story linked to the wrong employer is a serious error.\n"
    "POINTER: for each story write ONE canonical CV bullet (18-30 words, strong "
    "past-tense verb, the story's best metric woven in when one exists).\n"
    "SKILLS: per story, the skills it genuinely demonstrates (max 8, no forcing).\n"
    'Return ONLY compact JSON: {"roles": [{"company": str, "title": str, '
    '"location": str, "date_label": str, "kind": one of '
    "[work, education, leadership, volunteer, other]}], "
    '"stories": [{"role_index": int|null, "role_company": str, "kind": one of '
    "[project, achievement, accolade, education, research, other], "
    '"title": str, "narrative": {"situation": str, "task": str, "action": str, '
    '"result": str}, "metrics": [{"value": str, "what": str}], '
    '"skills": [str], "pointer": str}]}. No prose outside the JSON.'
)

# Fallback pointer-style guidance when retrieval returns nothing.
_STATIC_STYLE = (
    "Pointers follow the Google XYZ formula: 'Accomplished X, measured by Y, by doing Z'."
)


def _grounding_block(passages: list) -> str:
    lines = [f"- {p.chunk_text}  (source: {p.source_title})" for p in passages]
    return "Ground every pointer in these authored CV-playbook rules:\n" + "\n".join(lines)


def build_messages(raw_text: str, passages: list | None = None) -> list[dict[str, str]]:
    guidance = _grounding_block(passages) if passages else _STATIC_STYLE
    return [
        {"role": "system", "content": f"{_GUARDRAILS}\n\n{guidance}"},
        {"role": "user", "content": f"Candidate's career material:\n\n{raw_text.strip()[:MAX_INPUT_CHARS]}"},
    ]


# ── defensive parse (pure) ───────────────────────────────────────────────────

def _json_object(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith(("json",)):
            text = text[nl + 1:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        parsed = _salvage_truncated(text[start:])
    return parsed if isinstance(parsed, dict) else None


def _salvage_truncated(text: str, attempts: int = 24) -> dict | None:
    """A max_tokens-clipped response ends mid-object. Recover every COMPLETE
    story by cutting back to the last closed object and re-closing the arrays —
    losing the clipped tail beats losing the whole extraction."""
    cut = len(text)
    for _ in range(attempts):
        cut = text.rfind("}", 0, cut)
        if cut <= 0:
            return None
        for closer in ("]}", "}]}"):
            try:
                parsed = json.loads(text[: cut + 1] + closer)
            except (json.JSONDecodeError, ValueError):
                continue
            if isinstance(parsed, dict):
                return parsed
    return None


def _clean_str(value: Any, cap: int = 400) -> str:
    return str(value or "").strip()[:cap]


# ── verbatim-metric guard (pure) ─────────────────────────────────────────────
#
# The model sometimes normalizes a stated figure ('€500K+' → 500000) despite the
# verbatim rule. This deterministic pass re-anchors every metric to the exact
# token in the story's own text — and DROPS a large pure-digit value that maps
# to nothing (a normalized form the material never stated = fabricated shape,
# ADR-0016).

_METRIC_TOKEN_RE = re.compile(
    r"[€$₹£]?\s?~?\d[\d,.]*(?:\s?(?:k|m|bn|b|cr(?:ore)?s?|l(?:akh)?s?)\b|%)?\+?",
    re.IGNORECASE,
)
_SUFFIX_MULT = {
    "k": 1e3, "m": 1e6, "b": 1e9, "bn": 1e9,
    "cr": 1e7, "crore": 1e7, "crores": 1e7,
    "l": 1e5, "lakh": 1e5, "lakhs": 1e5,
}


def _magnitude(token: str) -> float | None:
    t = (token or "").strip().lower()
    t = t.lstrip("€$₹£").strip().lstrip("~").rstrip("+").rstrip("%").strip()
    m = re.fullmatch(r"([\d,.]+)\s*([a-z]*)", t)
    if not m:
        return None
    try:
        num = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    return num * _SUFFIX_MULT.get(m.group(2), 1.0)


def verbatim_metric_value(value: str, texts: list[str]) -> str | None:
    """The display form a metric chip should carry: the exact token as written in
    the story's own text. Pure-digit values re-anchor by magnitude ('500000' →
    '€500K+'); unverifiable large pure-digit values drop (None); everything else
    passes through unchanged."""
    v = (value or "").strip()
    if not v:
        return None
    pure_digits = bool(re.fullmatch(r"\d[\d,]*", v))
    mag = _magnitude(v)

    if not pure_digits and any(v.lower() in (t or "").lower() for t in texts):
        return v
    if mag is not None:
        for text in texts:
            for m in _METRIC_TOKEN_RE.finditer(text or ""):
                if _magnitude(m.group(0)) == mag:
                    return m.group(0).strip()
    if pure_digits and any(v in (t or "") for t in texts):
        return v
    if pure_digits and (mag or 0) >= 1000:
        return None  # normalized number the material never states → not a real chip
    return v


def _company_matches(a: str, b: str) -> bool:
    na, nb = " ".join(a.lower().split()), " ".join(b.lower().split())
    return bool(na) and bool(nb) and (na in nb or nb in na)


def _verify_role_link(role_index: int | None, role_company: str, roles: list[dict[str, Any]]) -> int | None:
    """Deterministic guard against the model mis-indexing a story's role: the
    echoed role_company must match the indexed role's company. On mismatch,
    re-match by company when it identifies exactly one role; otherwise drop the
    link (a role-less story is curatable — a wrong employer is not)."""
    if not role_company:
        return role_index
    if role_index is not None and _company_matches(role_company, roles[role_index].get("company") or ""):
        return role_index
    matches = [i for i, r in enumerate(roles) if _company_matches(role_company, r.get("company") or "")]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        work = [i for i in matches if (roles[i].get("kind") or "work") == "work"]
        return work[0] if len(work) == 1 else None  # still ambiguous → role-less, curatable
    return role_index if role_index is not None else None


def parse_extraction(raw: str) -> dict[str, list[dict[str, Any]]]:
    """Validate the model's JSON into {roles, stories}. Junk → empty lists.
    role_index values out of range become None (role-less story, kept)."""
    parsed = _json_object(raw)
    if parsed is None:
        return {"roles": [], "stories": []}

    raw_roles = parsed.get("roles") if isinstance(parsed.get("roles"), list) else []
    raw_stories = parsed.get("stories") if isinstance(parsed.get("stories"), list) else []

    roles: list[dict[str, Any]] = []
    for item in raw_roles[:MAX_ROLES]:
        if not isinstance(item, dict):
            continue
        title = _clean_str(item.get("title"), 200)
        if not title:
            continue
        kind = _clean_str(item.get("kind"), 20).lower()
        roles.append({
            "company": _clean_str(item.get("company"), 200),
            "title": title,
            "location": _clean_str(item.get("location"), 120),
            "date_label": _clean_str(item.get("date_label"), 80),
            "kind": kind if kind in ROLE_KINDS else "work",
        })

    stories: list[dict[str, Any]] = []
    for item in raw_stories[:MAX_STORIES]:
        if not isinstance(item, dict):
            continue
        title = _clean_str(item.get("title"), 200)
        pointer = _clean_str(item.get("pointer"), 320)
        if not title and not pointer:
            continue
        ri = item.get("role_index")
        role_index = ri if isinstance(ri, int) and 0 <= ri < len(roles) else None
        role_index = _verify_role_link(role_index, _clean_str(item.get("role_company"), 200), roles)
        kind = _clean_str(item.get("kind"), 20).lower()
        narrative_in = item.get("narrative") if isinstance(item.get("narrative"), dict) else {}
        narrative = {
            k: _clean_str(narrative_in.get(k), 600)
            for k in ("situation", "task", "action", "result")
            if _clean_str(narrative_in.get(k), 600)
        }
        metric_texts = [title, pointer, *narrative.values()]
        metrics: list[dict[str, str]] = []
        seen_metrics: set[tuple[str, str]] = set()
        for m in (item.get("metrics") or []):
            if not isinstance(m, dict) or not _clean_str(m.get("value"), 60):
                continue
            anchored = verbatim_metric_value(_clean_str(m.get("value"), 60), metric_texts)
            if not anchored:
                continue
            what = _clean_str(m.get("what"), 160)
            if (anchored.lower(), what.lower()) in seen_metrics:
                continue
            seen_metrics.add((anchored.lower(), what.lower()))
            metrics.append({"value": anchored, "what": what})
            if len(metrics) >= 8:
                break
        skills = list(dict.fromkeys(
            s for raw_s in (item.get("skills") or [])
            if isinstance(raw_s, str) and (s := raw_s.strip()[:60])
        ))[:8]
        stories.append({
            "role_index": role_index,
            "kind": kind if kind in STORY_KINDS else "project",
            "title": title or pointer[:120],
            "narrative": narrative,
            "metrics": metrics,
            "skills": skills,
            "pointer": pointer or title,
        })

    return {"roles": roles, "stories": stories}


async def extract(raw_text: str, provider: LLMProvider) -> dict[str, list[dict[str, Any]]] | None:
    """One dump text → {roles, stories}. None on provider/budget failure (caller
    leaves the entry unprocessed → retried); {} lists when the text yields nothing."""
    text = (raw_text or "").strip()
    if not text:
        return {"roles": [], "stories": []}

    # Ground pointer style in the authored playbook (fail-soft → static rule).
    passages = await mentor_retriever.retrieve(
        "write strong CV achievement bullets, quantify impact", shelf="cv", k=_RETRIEVE_K,
    )
    try:
        raw = await provider.complete(build_messages(text, passages), max_tokens=MAX_TOKENS)
    except LLMProviderError:
        logger.info("story_extractor: provider/budget unavailable — entry left for retry")
        return None
    return parse_extraction(raw)


# ── LinkedIn export → readable career text (pure, deterministic) ─────────────
#
# The extractor keeps ONE LLM path: LinkedIn CSVs are rendered into structured
# prose blocks and flow through the same `extract()` call. Detection is by the
# canonical LinkedIn export headers.

_LINKEDIN_RENDERERS = {
    "positions": ("Company Name", "Title"),
    "education": ("School Name", "Degree Name"),
    "profile": ("First Name", "Headline"),
    "certifications": ("Name", "Authority"),
    "shares": ("Date", "ShareCommentary"),
    "recommendations": ("First Name", "Text", "Creation Date"),
    "skills": ("Name",),
}


def linkedin_csv_kind(raw: bytes) -> str | None:
    """Which LinkedIn export CSV this is, by header match. None = not one we read."""
    try:
        header = raw.decode("utf-8-sig", errors="replace").splitlines()[0]
    except IndexError:
        return None
    cols = {c.strip().strip('"') for c in header.split(",")}
    for kind, needed in _LINKEDIN_RENDERERS.items():
        if all(col in cols for col in needed):
            return kind
    return None


def _csv_rows(raw: bytes) -> list[dict[str, str]]:
    text = raw.decode("utf-8-sig", errors="replace")
    return [
        {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        for row in csv.DictReader(text.splitlines())
    ]


def render_linkedin_csv(kind: str, raw: bytes) -> str:
    """One LinkedIn CSV → a readable career-text block for the extractor."""
    rows = _csv_rows(raw)
    if kind == "positions":
        blocks = []
        for r in rows[:30]:
            head = f"ROLE: {r.get('Title', '')} @ {r.get('Company Name', '')}"
            dates = " – ".join(p for p in (r.get("Started On"), r.get("Finished On") or "Present") if p)
            meta = " | ".join(p for p in (r.get("Location"), dates) if p)
            desc = r.get("Description", "")
            blocks.append("\n".join(p for p in (head, meta, desc) if p))
        return "WORK HISTORY (LinkedIn):\n\n" + "\n\n".join(blocks)
    if kind == "education":
        lines = [
            f"- {r.get('Degree Name', '')} at {r.get('School Name', '')} "
            f"({r.get('Start Date', '')} – {r.get('End Date', '')}). "
            f"{r.get('Notes', '')} Activities: {r.get('Activities', '')}".strip()
            for r in rows[:10]
        ]
        return "EDUCATION (LinkedIn):\n" + "\n".join(lines)
    if kind == "profile":
        r = rows[0] if rows else {}
        return (
            f"PROFILE (LinkedIn): {r.get('First Name', '')} {r.get('Last Name', '')} — "
            f"{r.get('Headline', '')}\nSummary: {r.get('Summary', '')}"
        )
    if kind == "certifications":
        lines = [f"- {r.get('Name', '')} ({r.get('Authority', '')}, {r.get('Started On', '')})" for r in rows[:40]]
        return "CERTIFICATIONS (LinkedIn):\n" + "\n".join(lines)
    if kind == "skills":
        return "SKILLS (LinkedIn): " + ", ".join(r.get("Name", "") for r in rows[:80] if r.get("Name"))
    if kind == "shares":
        posts = [
            f"[{r.get('Date', '')[:10]}] {r.get('ShareCommentary', '')[:800]}"
            for r in rows[:40]
            if r.get("ShareCommentary", "").strip()
        ]
        if not posts:
            return ""
        return "POSTS AUTHORED BY THE USER (LinkedIn — their own words):\n\n" + "\n\n".join(posts)
    if kind == "recommendations":
        lines = [
            f"- {r.get('First Name', '')} {r.get('Last Name', '')} "
            f"({r.get('Job Title', '')}, {r.get('Company', '')}, {r.get('Creation Date', '')[:10]}): "
            f"“{r.get('Text', '')[:600]}”"
            for r in rows[:20]
            if r.get("Text", "").strip()
        ]
        if not lines:
            return ""
        return "RECOMMENDATIONS RECEIVED (LinkedIn — colleagues wrote these about the user):\n" + "\n".join(lines)
    return ""
