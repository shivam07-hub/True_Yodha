"""mentor_learn — what Myro takes away from a single turn the user just typed.

MYRO_MENTOR's `learned[]`, and the one-way-memory gap it exists to close.

Memory was READ by twelve modules and WRITTEN by two: the batch distiller and
the job concierge. So a user could spend an hour on the CV surface explaining
what they actually did and what they want next, and Myro would end that hour
knowing exactly what it knew at the start. The distiller does eventually read
their brain-dump entries — but it runs on `/home`, debounced twelve hours, and
gated on three BEHAVIOURAL signals with facts explicitly excluded from the
count. Someone who talks a lot and clicks very little qualifies for nothing.

This runs on the turn. The user writes "honestly I don't want to manage people
again" and it is a `constraint` before the request returns.

WHAT IT REUSES, DELIBERATELY

Everything except the prompt: `_ALLOWED_KINDS`, `parse_facts` and `select_new`
are the distiller's, so there is one definition of what a fact may be, one
parser, and one dedup — including the tombstone rule, where a fact the user
dismissed is never re-derived. A second extraction path would have drifted from
the first within a month.

Only the prompt differs, because the input differs: the distiller infers from
behaviour it watched, this reads words the user chose. Guessing is much less
forgivable here — they are right there, and they can see what Myro heard.

WHAT IT MAY WRITE (lock 5)

Memory facts only, `source="distilled"` — Myro's reading of what they said, not
a claim they authored it. It never touches a `user_profiles` column: anything
the matcher ranks on waits for the user to accept it in the paragraph. That
line is what keeps the pre-flight's Discard honest, and it is enforced by this
module writing through `UserMemoryRepository` and nothing else.
"""
from __future__ import annotations

import logging

from app.services.llm_provider import LLMProvider, LLMProviderError
from app.services.memory_distiller import _fingerprint, parse_facts, select_new

logger = logging.getLogger(__name__)

# One turn is one thought. A turn that yields six "durable facts" is a model
# padding, not a user confiding — the distiller's batch cap is for a fortnight
# of behaviour, this is for a paragraph.
_MAX_TURN_FACTS = 3
_MAX_TOKENS = 300

# Below this there is nothing to infer and an LLM call is waste. "yes", "ok",
# "add python" carry no durable fact about the person.
_MIN_TEXT_CHARS = 60

_SYSTEM = (
    "You read one thing a job seeker has just written about themselves, in their "
    "own words, and take away only what will still be true in six months.\n"
    "RULES:\n"
    "- They are right there and they will see what you heard. A wrong fact is "
    "worse than no fact. Prefer NONE over a guess — an empty list is the correct "
    "answer most of the time.\n"
    "- Take only what they actually said. Never extrapolate from a job title, an "
    "employer, or a tone. 'I ran payments at a bank' is not evidence that they "
    "want fintech.\n"
    "- Skip anything transient: what they are doing today, one interview, one "
    "application, a mood.\n"
    "- Do NOT restate a role title, a location or a seniority as a fact — those "
    "are the user's to confirm, not yours to infer.\n"
    "- Each fact is one short sentence describing them in the third person "
    "('Prefers remote work', 'Avoids managing people', 'Targeting fintech').\n"
    'Return ONLY a compact JSON array, each item {"kind": one of '
    "[aspiration, constraint, habit, preference, salary, work_mode, target_company, note], "
    '"text": the fact}. No prose outside the array.'
)


def build_messages(text: str, surface: str) -> list[dict[str, str]]:
    """The turn, labelled with where it was said. Surface is context, not a rule —
    someone confiding on the CV screen is telling you the same kind of thing as
    someone confiding on the skills screen."""
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"Written by them on the {surface} screen:\n\n{text.strip()[:4000]}"},
    ]


def worth_reading(text: str) -> bool:
    """A turn long enough to hold a durable fact. Cheap gate before any LLM call."""
    return len((text or "").strip()) >= _MIN_TEXT_CHARS


async def learn(
    text: str,
    surface: str,
    existing_fingerprints: set[str],
    provider: LLMProvider,
) -> list[dict[str, str]] | None:
    """One turn → new facts. `None` on a provider/budget failure so the caller can
    tell "nothing to learn" (`[]`) from "could not look" — the distinction the
    distiller's watermark depends on and the one a retry needs."""
    if not worth_reading(text):
        return []
    try:
        raw = await provider.complete(build_messages(text, surface), max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("mentor_learn: provider/budget unavailable surface=%s", surface)
        return None
    return select_new(parse_facts(raw), existing_fingerprints)[:_MAX_TURN_FACTS]


# ── IO shell (admin-scoped, fail-soft) ───────────────────────────────────────


def learn_from_turn(user_id: str, text: str, surface: str) -> None:
    """Background entry (BackgroundTasks). Fail-soft in every direction: the user
    is mid-request on a surface that has nothing to do with memory, and losing a
    fact is survivable where losing their brain-dump entry is not."""
    import asyncio

    try:
        asyncio.run(_run(user_id, text, surface))
    except Exception as exc:  # noqa: BLE001 — best-effort background work
        logger.warning(
            "mentor_learn.failed user=%s surface=%s reason=%s",
            user_id, surface, exc.__class__.__name__,
        )


async def _run(user_id: str, text: str, surface: str) -> None:
    if not worth_reading(text):
        return

    from app.database import get_supabase_admin
    from app.repositories.user_memory import UserMemoryRepository
    from app.services import memory_semantic
    from app.services.llm_provider import get_llm_provider
    from app.services.memory_distiller import _existing_fingerprints

    db = get_supabase_admin()
    facts = await learn(text, surface, _existing_fingerprints(db, user_id), get_llm_provider())
    if not facts:
        return

    repo = UserMemoryRepository(db)
    written = 0
    for fact in facts:
        try:
            row = repo.add(
                user_id, kind=fact["kind"], text=fact["text"],
                source="distilled", confidence=0.6,
            )
        except Exception as exc:  # noqa: BLE001 — one bad insert must not drop the rest
            logger.info("mentor_learn: fact insert failed reason=%s", exc.__class__.__name__)
            continue
        written += 1
        if row.get("id"):
            await memory_semantic.embed_and_store(user_id, str(row["id"]), fact["text"])

    # Emitted whether or not anything was written: "the user talked and Myro took
    # nothing away" is the number that says this is tuned too tight, and it is
    # invisible if only successes are counted.
    logger.info(
        "metric mentor_learn.turn surface=%s candidates=%d written=%d",
        surface, len(facts), written,
    )


__all__ = ["build_messages", "learn", "learn_from_turn", "worth_reading", "_fingerprint"]
