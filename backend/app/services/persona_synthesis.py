"""persona_synthesis — writes the "What Myro knows about you" canvas (Lane B).

ONE living document per user in three movements — where you've been / where you
stand / where you're headed — synthesized from the deterministic signal lines
built by persona_signals. Grill locks (2026-07-14):

- USER EDITS ARE LAW: paragraphs the user authored are pinned; synthesis
  regenerates only Myro-authored prose, must never contradict a pinned passage,
  and pinned paragraphs survive every regeneration at their position.
- Grounded, never vague: the writer receives numbered signal lines (real
  saved/dismissed/tailored/search/practice aggregates) and every paragraph
  carries the signal lines it draws on — surfaced in the UI as the trace.
- No fabricated numbers (ADR-0016): a digit token in the output that does not
  appear in the signal block (or a pinned passage) drops the paragraph.

Judgment path → judgment-tier provider only (no cheap models on trust surfaces).
Runtime mirrors memory_distiller: BackgroundTasks, debounced, admin-scoped,
fail-soft — a synthesis failure keeps the previous canvas.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.llm_provider import LLMProvider, LLMProviderError
from app.services.persona_signals import allowed_numbers, numbers_in, render_block

logger = logging.getLogger("myro.persona_synthesis")

MOVEMENTS = ("past", "present", "future")

_DEBOUNCE_HOURS = 12       # steady-state cadence, same as the distiller
_FORCE_GAP_MINUTES = 10    # explicit refresh can't hammer the provider
_MIN_SIGNALS = 2           # below this there is nothing honest to write
_MAX_PER_MOVEMENT = 4      # pinned always kept; Myro prose trimmed to fit
_MAX_TOKENS = 1400

_SYSTEM = (
    "You write \"What Myro knows about you\" — the living career document a "
    "career-intelligence platform keeps about one job seeker. Voice: second "
    "person, warm but precise, dignified, never flattering. The reader should "
    "feel the document knows their career better than their CV does.\n"
    "Structure — exactly three movements:\n"
    "- past: where they've been. The through-line across their roles and stories.\n"
    "- present: where they stand. Their leverage NOW — and what their behaviour "
    "on the platform reveals: what they save, what they dismiss without a second "
    "look, what they tailor CVs for, what they search, what they practise. Name "
    "these patterns plainly; the behavioural signals are the strongest material.\n"
    "- future: where they're headed. The target they set + the specific, "
    "nameable gap between here and there.\n"
    "HARD RULES:\n"
    "- Ground every claim in the numbered SIGNALS. Never invent an employer, "
    "date, metric or preference.\n"
    "- Numbers: you may only write a number that appears in a signal line, "
    "copied verbatim. Never recompute, sum or estimate.\n"
    "- 1-3 paragraphs per movement, each under 75 words. Plain prose — no "
    "headings, no bullets, no markdown.\n"
    "- Each paragraph lists the ids of the signal lines it draws on (grounds).\n"
    "- PINNED passages are the user's own words and are law: never contradict "
    "them, never rewrite them, never repeat them.\n"
    "- Thin signals → write less. An honest short document beats a padded one.\n"
    'Return ONLY JSON: {"past": [{"text": "...", "grounds": ["S1"]}], '
    '"present": [...], "future": [...]}. No prose outside the JSON.'
)


# ── pure core (testable without DB/LLM) ──────────────────────────────────────

def build_messages(
    block: str,
    facts: list[str],
    pinned: list[dict[str, Any]],
) -> list[dict[str, str]]:
    parts = ["SIGNALS:", block or "none"]
    if facts:
        parts += ["", "Learned facts already on file (weave, don't list):"] + [f"- {f}" for f in facts]
    if pinned:
        parts += ["", "PINNED passages (the user's own words — law):"] + [
            f"- [{p.get('movement')}] {p.get('text')}" for p in pinned
        ]
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": "\n".join(parts)},
    ]


def parse_canvas(raw: str) -> dict[str, list[dict[str, Any]]] | None:
    """LLM response → {movement: [{text, grounds}]}. Junk → None."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.strip("`")
        text = text[4:].strip() if text.lower().startswith("json") else text.strip()
    start = text.find("{")
    if start == -1:
        return None
    try:
        data = json.loads(text[start:])
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    out: dict[str, list[dict[str, Any]]] = {}
    for movement in MOVEMENTS:
        items = data.get(movement)
        rows: list[dict[str, Any]] = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            body = str(item.get("text") or "").strip()
            if not body:
                continue
            grounds = [str(g).strip() for g in item.get("grounds") or [] if str(g).strip()]
            rows.append({"text": body[:600], "grounds": grounds})
        out[movement] = rows
    return out if any(out.get(m) for m in MOVEMENTS) else None


def sanitize(
    canvas: dict[str, list[dict[str, Any]]],
    lines: list[dict[str, str]],
    allowed: set[str],
) -> list[dict[str, Any]]:
    """Ground-id → display line resolution + the no-fabricated-numbers guard.

    A paragraph whose text carries a digit token absent from `allowed` is
    dropped (metric-logged) — silently shipping an invented number is the one
    unforgivable failure on a trust surface.
    """
    by_id = {line["id"]: line["text"] for line in lines}
    out: list[dict[str, Any]] = []
    for movement in MOVEMENTS:
        for item in canvas.get(movement) or []:
            fabricated = numbers_in(item["text"]) - allowed
            if fabricated:
                logger.warning(
                    "metric persona.fabricated_number_dropped movement=%s tokens=%s",
                    movement,
                    sorted(fabricated),
                )
                continue
            out.append(
                {
                    "id": uuid.uuid4().hex,
                    "movement": movement,
                    "text": item["text"],
                    "author": "myro",
                    "pinned": False,
                    "grounds": [by_id[g] for g in item["grounds"] if g in by_id],
                }
            )
    return out


def merge_pinned(
    new_paragraphs: list[dict[str, Any]],
    old_paragraphs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Pinned paragraphs survive regeneration at their old index per movement;
    Myro prose fills around them up to the per-movement cap."""
    merged: list[dict[str, Any]] = []
    for movement in MOVEMENTS:
        fresh = [p for p in new_paragraphs if p.get("movement") == movement]
        old = [p for p in old_paragraphs if p.get("movement") == movement]
        pinned = [(i, p) for i, p in enumerate(old) if p.get("pinned")]
        keep = fresh[: max(0, _MAX_PER_MOVEMENT - len(pinned))]
        for index, paragraph in pinned:
            keep.insert(min(index, len(keep)), paragraph)
        merged.extend(keep)
    return merged


# ── IO shell (admin-scoped, fail-soft) ───────────────────────────────────────

def maybe_synthesize(user_id: str, force: bool = False) -> None:
    """Background entry (BackgroundTasks). Debounced, fail-soft — a synthesis
    problem must never affect the user's session; the old canvas stands."""
    import asyncio

    try:
        asyncio.run(_run(user_id, force))
    except Exception as exc:  # noqa: BLE001 — best-effort background work
        logger.warning("persona_synthesis.failed user=%s reason=%s", user_id, exc.__class__.__name__)


async def _run(user_id: str, force: bool) -> None:
    from app.database import get_supabase_admin
    from app.services import persona_signals

    db = get_supabase_admin()
    now = datetime.now(timezone.utc)
    existing = read_persona(db, user_id)
    generated_at = _parse_ts((existing or {}).get("generated_at"))
    if generated_at is not None:
        gap = timedelta(minutes=_FORCE_GAP_MINUTES) if force else timedelta(hours=_DEBOUNCE_HOURS)
        if now - generated_at < gap:
            return

    collected = persona_signals.collect(db, user_id)
    if collected["total"] < _MIN_SIGNALS:
        return  # too thin to write anything honest; try again next window

    old_paragraphs = list((existing or {}).get("paragraphs") or [])
    pinned = [p for p in old_paragraphs if isinstance(p, dict) and p.get("pinned")]

    from app.services.llm_provider import get_judgment_provider

    provider: LLMProvider = get_judgment_provider()
    try:
        raw = await provider.complete(
            build_messages(render_block(collected["lines"]), collected["facts"], pinned),
            max_tokens=_MAX_TOKENS,
        )
    except LLMProviderError:
        logger.info("persona_synthesis: provider/budget unavailable — will retry next window")
        return

    canvas = parse_canvas(raw)
    if canvas is None:
        logger.warning("metric persona.parse_failed user=%s", user_id)
        return

    allowed = allowed_numbers(collected["lines"], [p.get("text") or "" for p in pinned])
    paragraphs = sanitize(canvas, collected["lines"], allowed)
    if not paragraphs and not pinned:
        logger.warning("metric persona.all_paragraphs_dropped user=%s", user_id)
        return

    merged = merge_pinned(paragraphs, old_paragraphs)
    db.table("user_persona").upsert(
        {
            "user_id": user_id,
            "paragraphs": merged,
            "generated_at": now.isoformat(),
            "model": getattr(provider, "model", None) or "judgment",
            "updated_at": now.isoformat(),
        },
        on_conflict="user_id",
    ).execute()
    logger.info(
        "persona_synthesis.done user=%s signals=%d paragraphs=%d pinned=%d",
        user_id, collected["total"], len(merged), len(pinned),
    )


def read_persona(db: Any, user_id: str) -> dict[str, Any] | None:
    from app.db_safe import safe_read

    return safe_read(
        db.table("user_persona").select("*").eq("user_id", user_id).maybe_single(),
        default=None,
        context="persona_read",
    )


def _parse_ts(raw: Any) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None
