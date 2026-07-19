"""project_rewrite — guarded reword of the SELECTED reservoir bullets into the
target job's language. The "wow" half of career_projection: the deterministic
requirement-ranker decides WHICH real bullets make the CV; this step rewords each
into the job's vocabulary WITHOUT inventing anything.

Structural honesty (same guards as cv_weave, reused from cv_rewrite): a reworded
bullet ships ONLY if every source number survives (`loses_metrics` False), it adds
no number absent from the source (`gains_foreign_numbers` False), and named
specifics survive (`loses_substance` False). Any bullet that fails a guard → its
ORIGINAL verbatim pointer ships. Provider/parse failure → all originals.
Deterministic projection stays the floor; rewording is pure upside, never a
silently degraded or fabricated line.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from app.services.cv_rewrite import gains_foreign_numbers, loses_metrics, loses_substance
from app.services.llm_provider import LLMProvider, LLMProviderError, get_writer_provider

logger = logging.getLogger("myro.project_rewrite")

_MAX_TOKENS = 1600


@dataclass
class RoleItems:
    """One CV role's selected bullets, keyed so the reworded lines map back."""
    key: str
    role: str
    company: str
    items: list[dict[str, str]] = field(default_factory=list)  # [{story_id, text}]


_SYSTEM = (
    "You are a senior CV writer tailoring an existing CV to ONE target job. You are "
    "given the job's real requirements and, per role, that role's chosen bullets. "
    "Reword EACH bullet so it speaks the target job's language and leads with the "
    "impact a hiring manager for THIS job cares about.\n"
    "HONESTY (unbreakable): use ONLY the facts already in each bullet. NEVER invent "
    "or change numbers, employers, clients, titles, dates, or scope. Every number in "
    "the original MUST appear unchanged in your reworded line. Do not add a number "
    "that is not in the original. Keep every named entity (company, client, product, "
    "tool) that the original names.\n"
    "Return ONE reworded line per input bullet, SAME order, SAME count per role.\n"
    'Return ONLY compact JSON: {"roles": [{"key": str, "bullets": [str]}]}. '
    "No prose outside the JSON."
)


def _parse(raw: str) -> dict[str, list[str]]:
    """key -> reworded bullet list. {} on any malformed response."""
    try:
        obj = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
    except (ValueError, json.JSONDecodeError):
        return {}
    out: dict[str, list[str]] = {}
    for entry in (obj.get("roles") or []):
        if not isinstance(entry, dict):
            continue
        key = str(entry.get("key") or "")
        bullets = entry.get("bullets")
        if key and isinstance(bullets, list):
            out[key] = [str(b or "").strip() for b in bullets]
    return out


def _messages(job_title: str, company: str, requirements: list[str], roles: list[RoleItems]) -> list[dict[str, str]]:
    reqs = "\n".join(f"- {r}" for r in requirements[:14]) or "- (no parsed requirements; keep bullets faithful)"
    blocks = []
    for r in roles:
        lines = "\n".join(f"  {i + 1}. {it['text']}" for i, it in enumerate(r.items))
        blocks.append(f'ROLE key="{r.key}": {r.role} · {r.company}\n{lines}')
    user = (
        f"Target job: {job_title or 'the role'} at {company or 'the company'}\n\n"
        f"What this job requires:\n{reqs}\n\n"
        f"The chosen bullets, per role:\n" + "\n\n".join(blocks)
    )
    return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]


async def reword_bullets(
    *,
    job_title: str,
    company: str,
    requirements: list[str],
    roles: list[RoleItems],
    provider: LLMProvider | None = None,
) -> dict[str, str]:
    """Return {story_id: text} — the reworded line where it PASSES every guard,
    else the original verbatim pointer. Always covers every input item; fail-soft
    to originals on provider/parse failure."""
    # Baseline: everything keeps its original text. Guards only ever swap upward.
    result: dict[str, str] = {it["story_id"]: it["text"] for r in roles for it in r.items}
    if not roles:
        return result

    provider = provider or get_writer_provider()  # writer floor — no cheap models
    try:
        raw = await provider.complete(_messages(job_title, company, requirements, roles), max_tokens=_MAX_TOKENS)
    except (LLMProviderError, Exception) as exc:  # noqa: BLE001 — reword is upside, never an outage
        logger.info("project_rewrite: reword failed (%s) — keeping originals", exc.__class__.__name__)
        return result

    by_key = _parse(raw)
    kept = swapped = 0
    for r in roles:
        reworded = by_key.get(r.key)
        # A length mismatch means the model dropped/merged bullets — don't guess the
        # mapping; keep this whole role's originals.
        if not reworded or len(reworded) != len(r.items):
            kept += len(r.items)
            continue
        for it, new in zip(r.items, reworded):
            src = it["text"]
            if (
                new
                and not loses_metrics(src, new)
                and not gains_foreign_numbers(src, new)
                and not loses_substance(src, new)
            ):
                result[it["story_id"]] = new
                swapped += 1
            else:
                kept += 1
    logger.info("project_rewrite: %d reworded, %d kept verbatim (guard/failsoft)", swapped, kept)
    return result
