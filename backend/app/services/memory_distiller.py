"""
memory_distiller — User Memory Phase 2: passive behavioural distillation.

On login (debounced), read the user's recent behaviour — jobs they SAVED, jobs
they DISMISSED, searches they typed — and distil durable facts about them
(aspirations, constraints, work-mode / salary preferences, target companies) into
the canonical `user_memory` store. This is the passive writer that makes Myro
"know the user"; the brain-dump canvas (Phase 3) is the authored writer.

Scope + trust (grill 2026-07-06):
- Writes ONLY the user_memory kinds (aspiration/constraint/habit/preference/salary/
  work_mode/target_company/note) — all reversible + PV1-visible. It does NOT touch
  the profile columns (target_roles/locations/seniority): those are the propose-
  only axes, and the user confirms changes there through the intent-chat loop
  (Q3 trust guardrail), never a silent auto-flip.
- Every distilled fact carries `source='distilled'` so the user can see + edit +
  dismiss it. A DISMISSED fact is a tombstone — never re-derived.

Runtime: fire-and-forget off the login critical path via FastAPI BackgroundTasks
(not the durable RQ lane — distillation is best-effort + idempotent, it simply
re-runs next login, so it doesn't meet ADR-0008's restart-durability bar). Uses
the PAID OpenRouter provider through the shared llm_budget; a budget-dry / provider
failure leaves the watermark untouched so the batch retries next eligible window.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.memory_distiller")

_DEBOUNCE_HOURS = 12          # attempt at most ~2×/day per user
_FIRST_RUN_LOOKBACK_DAYS = 30  # bounded scan when never distilled before
_SIGNAL_CAP = 50               # flood cap per source (log-drop the rest)
_MIN_SIGNALS = 3               # below this the window is too thin to distil
_MAX_NEW_FACTS = 8             # cap what one batch can add
_MAX_TOKENS = 500

# The kinds the distiller is allowed to emit — the columnless user_memory set.
# role/location/seniority are deliberately absent (propose-only, via intent-chat).
_ALLOWED_KINDS = {"aspiration", "constraint", "habit", "preference", "salary", "work_mode", "target_company", "note"}

_SYSTEM = (
    "You infer DURABLE facts about a job seeker from their recent behaviour, so a "
    "career platform can remember them. Read the jobs they saved (liked), the jobs "
    "they dismissed (disliked), and what they searched. Output only facts that are "
    "clearly supported and likely to stay true — aspirations, hard constraints, "
    "work-mode or salary preferences, companies they target, working habits.\n"
    "RULES:\n"
    "- Never invent a fact not supported by the signals. Prefer FEW high-confidence "
    "facts over many guesses. It is fine to return an empty list.\n"
    "- Do NOT restate a role title or location as a fact (those are handled "
    "elsewhere). Focus on the softer 'what this person is really after'.\n"
    "- Each fact is one short sentence in the user's third person "
    "('Prefers remote work', 'Targeting fintech companies', 'Avoids early-stage "
    "startups').\n"
    'Return ONLY a compact JSON array, each item {"kind": one of '
    "[aspiration, constraint, habit, preference, salary, work_mode, target_company, note], "
    '"text": the fact}. No prose outside the array.'
)


# ── pure helpers (testable without a DB/LLM) ─────────────────────────────────

def _fingerprint(kind: str, text: str) -> str:
    """Dedup key: kind + normalized text (case/space/punct-insensitive)."""
    norm = re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()
    norm = re.sub(r"\s+", " ", norm)
    return f"{kind}:{norm}"


def build_messages(signals: dict[str, list[str]]) -> list[dict[str, str]]:
    saved = signals.get("saved") or []
    dismissed = signals.get("dismissed") or []
    searches = signals.get("searches") or []
    dump = signals.get("dump") or []
    parts = [
        # The brain-dump is the user's OWN words → the richest, highest-trust signal.
        "What they wrote about themselves (their own words): " + ("\n- ".join([""] + dump) if dump else "none"),
        "Saved (liked): " + ("; ".join(saved) if saved else "none"),
        "Dismissed (disliked): " + ("; ".join(dismissed) if dismissed else "none"),
        "Searched: " + ("; ".join(searches) if searches else "none"),
    ]
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": "\n".join(parts)},
    ]


def parse_facts(text: str) -> list[dict[str, str]]:
    """Extract the fact array from the LLM response. Junk → []."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1] if "```" in raw[3:] else raw.strip("`")
        raw = raw[4:].strip() if raw.lower().startswith("json") else raw.strip()
    start = raw.find("[")
    if start == -1:
        return []
    try:
        arr = json.loads(raw[start:])
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(arr, list):
        return []
    out: list[dict[str, str]] = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip().lower()
        fact = str(item.get("text") or "").strip()
        if kind in _ALLOWED_KINDS and fact:
            out.append({"kind": kind, "text": fact[:280]})
    return out


def select_new(candidates: list[dict[str, str]], existing_fingerprints: set[str]) -> list[dict[str, str]]:
    """Drop candidates that match an existing fact (active OR dismissed = tombstone),
    and de-dupe within the batch. Never re-derives a fact the user rejected."""
    seen = set(existing_fingerprints)
    fresh: list[dict[str, str]] = []
    for c in candidates:
        fp = _fingerprint(c["kind"], c["text"])
        if fp in seen:
            continue
        seen.add(fp)
        fresh.append(c)
        if len(fresh) >= _MAX_NEW_FACTS:
            break
    return fresh


async def distill(
    signals: dict[str, list[str]],
    existing_fingerprints: set[str],
    provider: LLMProvider,
) -> list[dict[str, str]] | None:
    """LLM → candidate facts → deduped new facts. Returns None on a provider/budget
    failure (caller must NOT advance the watermark → retry), [] when nothing new."""
    try:
        raw = await provider.complete(build_messages(signals), max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("memory_distiller: provider/budget unavailable — will retry next window")
        return None
    return select_new(parse_facts(raw), existing_fingerprints)


# ── IO shell (admin-scoped, fail-soft) ───────────────────────────────────────

def maybe_distill(user_id: str) -> None:
    """Background entry (BackgroundTasks). Debounced, admin-scoped, fail-soft — any
    error is swallowed (a distillation problem must never affect the user's session).
    Sync wrapper so it can be scheduled from a sync route; runs the async core on a
    private loop."""
    import asyncio

    try:
        asyncio.run(_run(user_id))
    except Exception as exc:  # noqa: BLE001 — best-effort background work
        logger.warning("memory_distiller.failed user=%s reason=%s", user_id, exc.__class__.__name__)


async def _run(user_id: str) -> None:
    from app.database import get_supabase_admin

    db = get_supabase_admin()
    now = datetime.now(timezone.utc)
    watermark = _read_watermark(db, user_id)
    if watermark and (now - watermark) < timedelta(hours=_DEBOUNCE_HOURS):
        return  # too soon since the last attempt

    since = watermark or (now - timedelta(days=_FIRST_RUN_LOOKBACK_DAYS))
    signals = _collect_signals(db, user_id, since.isoformat())
    total = sum(len(v) for v in signals.values())
    if total < _MIN_SIGNALS:
        _set_watermark(db, user_id, now)  # zero/thin window — advance the cursor, no LLM
        return

    from app.services.llm_provider import get_paid_jobs_provider

    facts = await distill(signals, _existing_fingerprints(db, user_id), get_paid_jobs_provider())
    if facts is None:
        return  # provider/budget failure — leave watermark for retry

    _write_facts(db, user_id, facts)
    _set_watermark(db, user_id, now)
    logger.info("memory_distiller.done user=%s signals=%d new_facts=%d", user_id, total, len(facts))


def _read_watermark(db: Any, user_id: str) -> datetime | None:
    from app.db_safe import safe_read

    row = safe_read(
        db.table("user_profiles").select("last_memory_distill_at").eq("id", user_id).maybe_single(),
        default=None,
        context="memory_distill_watermark",
    )
    raw = (row or {}).get("last_memory_distill_at")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _set_watermark(db: Any, user_id: str, when: datetime) -> None:
    db.table("user_profiles").update({"last_memory_distill_at": when.isoformat()}).eq("id", user_id).execute()


def _collect_signals(db: Any, user_id: str, since_iso: str) -> dict[str, list[str]]:
    return {
        "dump": _cv_dump(db, user_id, since_iso),
        "saved": _job_titles(db, "job_applications", "created_at", user_id, since_iso),
        "dismissed": _job_titles(db, "user_dismissed_job_cards", "dismissed_at", user_id, since_iso),
        "searches": _searches(db, user_id, since_iso),
    }


def _cv_dump(db: Any, user_id: str, since_iso: str) -> list[str]:
    from app.repositories.cv_dump import CvDumpRepository

    rows = CvDumpRepository(db).list_since(user_id, since_iso, limit=_SIGNAL_CAP)
    return [t for r in rows if (t := (r.get("text") or "").strip())]


def _job_titles(db: Any, table: str, ts_col: str, user_id: str, since_iso: str) -> list[str]:
    """Recent job titles (+company) from a user-owned join table, newest first."""
    try:
        rows = (
            db.table(table)
            .select(f"{ts_col}, jobs(job_title, company_name)")
            .eq("user_id", user_id)
            .gt(ts_col, since_iso)
            .order(ts_col, desc=True)
            .limit(_SIGNAL_CAP)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001 — one dead signal source must not sink the batch
        logger.info("memory_distiller: signal read failed table=%s reason=%s", table, exc.__class__.__name__)
        return []
    out: list[str] = []
    for r in rows:
        job = r.get("jobs") or {}
        title = (job.get("job_title") or "").strip()
        if not title:
            continue
        company = (job.get("company_name") or "").strip()
        out.append(f"{title} @ {company}" if company else title)
    return out


def _searches(db: Any, user_id: str, since_iso: str) -> list[str]:
    from app.repositories.search_queries import SearchQueriesRepository

    rows = SearchQueriesRepository(db).list_since(user_id, since_iso, limit=_SIGNAL_CAP)
    return [q for r in rows if (q := (r.get("query") or "").strip())]


def _existing_fingerprints(db: Any, user_id: str) -> set[str]:
    """All of the user's facts — active AND dismissed — so a dismissed fact acts as
    a tombstone the distiller never re-derives."""
    from app.db_safe import safe_read

    rows = safe_read(
        db.table("user_memory").select("kind, text").eq("user_id", user_id),
        default=[],
        context="memory_distill_existing",
    )
    return {_fingerprint(r.get("kind") or "", r.get("text") or "") for r in rows}


def _write_facts(db: Any, user_id: str, facts: list[dict[str, str]]) -> None:
    from app.repositories.user_memory import UserMemoryRepository

    repo = UserMemoryRepository(db)
    for f in facts:
        try:
            repo.add(user_id, kind=f["kind"], text=f["text"], source="distilled", confidence=0.6)
        except Exception as exc:  # noqa: BLE001 — one bad insert must not drop the rest
            logger.info("memory_distiller: fact insert failed reason=%s", exc.__class__.__name__)
