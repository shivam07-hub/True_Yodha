"""persona_signals — deterministic evidence collector for the persona canvas.

The canvas ("What Myro knows about you", Lane B) must feel like Myro knows the
user's career better than they do. That feeling comes from GROUNDING: the
synthesis prompt receives numbered signal lines built here — real counts and
patterns from what the user saves, dismisses, tailors, searches and practises —
and the writer may only cite numbers that appear verbatim in these lines.

SECOND PERSON IS A CONTRACT, not a style choice. Every line here is shown to
the user verbatim as a ground chip under the paragraph it supports, AND is the
evidence block the writer reads. A line phrased "companies they keep coming
back to" makes the reader a case file being discussed by someone else — and the
writer inherits that distance and echoes it in the prose. Address the reader:
"you", "your", never "they/their/the user". Guarded in test_persona_canvas.

Everything in this module is deterministic (no LLM): aggregates are computed in
Python from capped reads, each source fail-soft so one dead table never sinks
the canvas. The number set extracted from the lines powers the no-fabrication
guard in persona_synthesis (ADR-0016 posture: a number the signals don't
contain must never reach the user).
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Any

logger = logging.getLogger("myro.persona_signals")

_EXAMPLE_CAP = 3      # example titles per behavioural source
_FACT_CAP = 20        # user_memory facts forwarded to the writer
_SEARCH_CAP = 8       # recent distinct searches
_ROW_CAP = 200        # per-source read ceiling


# ── pure helpers ─────────────────────────────────────────────────────────────

def normalize_number(token: str) -> str:
    """'2,377' → '2377'; '72%' arrives as '72'. Trailing dot stripped."""
    return token.replace(",", "").rstrip(".")


def numbers_in(text: str) -> set[str]:
    return {normalize_number(t) for t in re.findall(r"\d[\d,]*(?:\.\d+)?", text or "")}


def allowed_numbers(lines: list[dict[str, str]], extra_texts: list[str] | None = None) -> set[str]:
    """Every number token the writer is allowed to use."""
    out: set[str] = set()
    for line in lines:
        out |= numbers_in(line.get("text") or "")
    for t in extra_texts or []:
        out |= numbers_in(t)
    return out


def render_block(lines: list[dict[str, str]]) -> str:
    return "\n".join(f"{line['id']}: {line['text']}" for line in lines)


def _line(lines: list[dict[str, str]], text: str) -> None:
    lines.append({"id": f"S{len(lines) + 1}", "text": text})


def _titles(rows: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for r in rows:
        job = r.get("jobs") or {}
        title = (job.get("job_title") or "").strip()
        if not title:
            continue
        company = (job.get("company_name") or "").strip()
        out.append(f"{title} @ {company}" if company else title)
    return out


def _top(values: list[str], n: int = 3) -> list[str]:
    return [v for v, _ in Counter(v for v in values if v).most_common(n)]


# ── collector ────────────────────────────────────────────────────────────────

def collect(db: Any, user_id: str) -> dict[str, Any]:
    """→ {"lines": [{id,text}], "timeline": [...], "facts": [str], "total": int}

    `total` counts behavioural + story signals only (facts excluded) so callers
    can decide whether the window is rich enough to write a canvas at all.
    """
    lines: list[dict[str, str]] = []

    saved = _job_rows(db, user_id, "job_applications", "created_at")
    if saved:
        companies = _top([(r.get("jobs") or {}).get("company_name") or "" for r in saved])
        examples = "; ".join(_titles(saved)[:_EXAMPLE_CAP])
        text = f"{len(saved)} jobs you saved on Myro"
        if examples:
            text += f" — examples: {examples}"
        if companies:
            text += f". Companies you keep coming back to: {', '.join(companies)}"
        _line(lines, text)

    dismissed = _job_rows(db, user_id, "user_dismissed_job_cards", "dismissed_at")
    if dismissed:
        examples = "; ".join(_titles(dismissed)[:_EXAMPLE_CAP])
        text = f"{len(dismissed)} job cards you dismissed on sight"
        if examples:
            text += f" — examples: {examples}"
        _line(lines, text)

    tailored = _tailored_rows(db, user_id)
    if tailored:
        examples = "; ".join(_titles(tailored)[:_EXAMPLE_CAP])
        text = f"{len(tailored)} CVs you tailored for a specific job"
        if examples:
            text += f" — for: {examples}"
        _line(lines, text)

    searches = _searches(db, user_id)
    if searches:
        _line(lines, "What you searched, in your words: " + "; ".join(searches))

    practice = _practice(db, user_id)
    if practice["count"]:
        text = f"{practice['count']} practice sessions you finished"
        if practice["skills"]:
            text += f" — most practised: {', '.join(practice['skills'])}"
        _line(lines, text)

    upvoted = _upvoted_skills(db, user_id)
    if upvoted:
        _line(lines, "Skills you upvoted on job cards (want to build): " + ", ".join(upvoted))

    timeline = collect_timeline(db, user_id)
    stories = _story_count(db, user_id)
    if timeline:
        arc = " → ".join(
            f"{r['title']} at {r['company']}" + (f" ({r['date_label']})" if r.get("date_label") else "")
            for r in timeline
        )
        _line(lines, f"Your timeline, from your own documents: {arc}")
    if stories:
        _line(lines, f"{stories} career stories on file across {len(timeline)} of your roles")

    targets = _targets(db, user_id)
    if targets:
        _line(lines, "Targets you set yourself: " + targets)

    behavioural_total = len(lines)
    facts = _facts(db, user_id)

    return {
        "lines": lines,
        "timeline": timeline,
        "facts": facts,
        "total": behavioural_total,
    }


# ── per-source reads (fail-soft) ─────────────────────────────────────────────

def _job_rows(db: Any, user_id: str, table: str, ts_col: str) -> list[dict[str, Any]]:
    from app.services.job_history import attach_jobs

    try:
        rows = (
            db.table(table)
            .select(f"{ts_col}, job_id")
            .eq("user_id", user_id)
            .order(ts_col, desc=True)
            .limit(_ROW_CAP)
            .execute()
        ).data or []
        attach_jobs(rows, db, "job_title, company_name")
        return rows
    except Exception as exc:  # noqa: BLE001 — one dead source must not sink the canvas
        logger.info("persona_signals: read failed table=%s reason=%s", table, exc.__class__.__name__)
        return []


def _tailored_rows(db: Any, user_id: str) -> list[dict[str, Any]]:
    from app.services.job_history import attach_jobs

    try:
        rows = (
            db.table("cv_versions")
            .select("id, job_id")
            .eq("user_id", user_id)
            .not_.is_("job_id", "null")
            .order("created_at", desc=True)
            .limit(_ROW_CAP)
            .execute()
        ).data or []
        attach_jobs(rows, db, "job_title, company_name")
        return rows
    except Exception as exc:  # noqa: BLE001
        logger.info("persona_signals: tailored read failed reason=%s", exc.__class__.__name__)
        return []


def _searches(db: Any, user_id: str) -> list[str]:
    try:
        rows = (
            db.table("search_queries")
            .select("query")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(_ROW_CAP)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.info("persona_signals: searches read failed reason=%s", exc.__class__.__name__)
        return []
    seen: list[str] = []
    for r in rows:
        q = (r.get("query") or "").strip()
        if q and q.lower() not in {s.lower() for s in seen}:
            seen.append(q)
        if len(seen) >= _SEARCH_CAP:
            break
    return seen


def _practice(db: Any, user_id: str) -> dict[str, Any]:
    try:
        rows = (
            db.table("forge_sessions")
            .select("skill_name")
            .eq("user_id", user_id)
            .limit(_ROW_CAP)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.info("persona_signals: practice read failed reason=%s", exc.__class__.__name__)
        return {"count": 0, "skills": []}
    return {"count": len(rows), "skills": _top([(r.get("skill_name") or "").strip() for r in rows])}


def _upvoted_skills(db: Any, user_id: str) -> list[str]:
    try:
        rows = (
            db.table("skill_upvotes")
            .select("display_name, skill_key")
            .eq("user_id", user_id)
            .limit(_ROW_CAP)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        logger.info("persona_signals: upvotes read failed reason=%s", exc.__class__.__name__)
        return []
    return _top([((r.get("display_name") or r.get("skill_key")) or "").strip() for r in rows], n=5)


def collect_timeline(db: Any, user_id: str) -> list[dict[str, Any]]:
    """Work/leadership roles oldest-first — the meridian's node data."""
    from app.db_safe import safe_read

    rows = safe_read(
        db.table("career_roles")
        .select("company, title, date_label, started_on, kind")
        .eq("user_id", user_id)
        .eq("status", "active")
        .in_("kind", ["work", "leadership"])
        .order("started_on", desc=False)
        .limit(20),
        default=[],
        context="persona_timeline",
    )
    return [
        {
            "company": (r.get("company") or "").strip(),
            "title": (r.get("title") or "").strip(),
            "date_label": (r.get("date_label") or "").strip(),
            "started_on": r.get("started_on"),
        }
        for r in rows
        if (r.get("title") or "").strip()
    ]


def _story_count(db: Any, user_id: str) -> int:
    from app.db_safe import safe_read

    rows = safe_read(
        db.table("career_stories").select("id").eq("user_id", user_id).eq("status", "active"),
        default=[],
        context="persona_story_count",
    )
    return len(rows)


def _targets(db: Any, user_id: str) -> str:
    from app.db_safe import safe_read

    row = safe_read(
        db.table("user_profiles")
        .select("target_role_titles, target_location")
        .eq("id", user_id)
        .maybe_single(),
        default=None,
        context="persona_targets",
    )
    if not row:
        return ""
    parts: list[str] = []
    titles = [t for t in (row.get("target_role_titles") or []) if isinstance(t, str) and t.strip()]
    if titles:
        parts.append("roles: " + ", ".join(titles[:5]))
    location = (row.get("target_location") or "").strip()
    if location:
        parts.append(f"location: {location}")
    return "; ".join(parts)


def _facts(db: Any, user_id: str) -> list[str]:
    from app.db_safe import safe_read

    rows = safe_read(
        db.table("user_memory")
        .select("kind, text")
        .eq("user_id", user_id)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(_FACT_CAP),
        default=[],
        context="persona_facts",
    )
    return [f"{r.get('kind')}: {t}" for r in rows if (t := (r.get("text") or "").strip())]
